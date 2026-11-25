// Act 1: an in-browser illustration of a plain in-memory queue that deletes
// each order as soon as it hands it to a worker (auto-ack).
// It is deliberately not real infrastructure; Act 2 is where real Temporal runs.

import { HUB_IN } from "../geometry";
import { HAMMER_MS, SCORE_META, STEP_NAMES, workerName } from "../steps";
import type { ArenaView, ChecklistRowView, DotView, NodeId, ScoreItemView, ScoreKey, ToolId, WorkerCardView } from "../types";

const ACT_MS = 700;
const EVERY: [number, number] = [2600, 3800];
const CHARGE = 1;
const PAY_MS = 10_000;
const SLOW_MS = 5_000;
/** Client 1 is the VIP: its orders are tagged, but a plain queue still serves them in arrival order. */
const VIP = 0;
const BULK = 3;

type OState = "queued" | "fetching" | "running" | "done" | "lost";

interface SimOrder {
  id: string;
  num: number;
  client: number;
  state: OState;
  worker: number; // 1-based, 0 = none
  done: boolean[];
  cur: number;
  t: number; // ms spent in the current state
  charged: boolean;
  endedAt: number;
  chargeTried: boolean;
  slow: boolean;
  /** Charged on an earlier delivery: a redelivery charges the card again. */
  chargedBefore: boolean;
  queuedAt: number;
  /** Queued behind a bulk job (set only when the presenter pressed Bulk job). */
  behindBulk: boolean;
  bulk: boolean;
}

interface SimWorker {
  id: number;
  downUntil: number;
  order: SimOrder | null;
  completed: number;
}

export interface SimConfig {
  score: ScoreKey[];
  hub: string;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class QueueSim {
  private cfg: SimConfig;
  private rng: () => number;
  private now = 0;
  private num = 0;
  private orders: SimOrder[] = [];
  private queue: SimOrder[] = [];
  private workers: SimWorker[];
  private nextAt = [0, 0, 0, 0];
  /** Clients only place orders after the presenter presses Play. */
  running = false;
  private hubDown = 0;
  private stats = { done: 0, lost: 0, failed: 0, dup: 0 };
  private payFault: { mode: "down" | "slow"; until: number } | null = null;
  private declineNext = false;
  /** "auto": the queue deletes an order when it hands it out. "after": it only deletes after the worker finishes, so crashes redeliver. */
  ackMode: "auto" | "after" = "auto";
  private banner = { seq: 0, text: "" };

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.rng = mulberry32(0xc0de00 + 7919);
    this.workers = [1, 2, 3, 4].map((id) => ({ id, downUntil: 0, order: null, completed: 0 }));
    this.nextAt = this.nextAt.map(() => 200 + this.rng() * 1500);
  }

  private say(text: string) {
    this.banner = { seq: this.banner.seq + 1, text };
  }

  private spawn(client: number, bulk = false) {
    this.num++;
    const o: SimOrder = {
      id: `sim-${this.num}`,
      num: this.num,
      client,
      state: "queued",
      worker: 0,
      done: [false, false, false, false],
      cur: 0,
      t: 0,
      charged: false,
      endedAt: 0,
      chargeTried: false,
      slow: false,
      chargedBefore: false,
      queuedAt: this.now,
      behindBulk: this.queue.some((q) => q.bulk),
      bulk,
    };
    this.orders.push(o);
    if (this.now < this.hubDown) {
      this.lose(o);
      this.say(`Order #${o.num} failed: the queue is down.`);
      return;
    }
    this.queue.push(o);
  }

  private lose(o: SimOrder) {
    o.state = "lost";
    o.endedAt = this.now;
    this.stats.lost++;
  }

  /** How long the order's current activity lasts: Charge stretches to 5 s while Payments is slow. */
  private actMs(o: SimOrder) {
    return o.cur === CHARGE && o.slow ? SLOW_MS : ACT_MS;
  }

  /** Payments is called when an order starts Charge; a plain queue has no retry or compensation. */
  private tryCharge(o: SimOrder, w: SimWorker): boolean {
    o.chargeTried = true;
    const fault = this.payFault && this.now < this.payFault.until ? this.payFault.mode : null;
    let why = "";
    if (this.declineNext) {
      this.declineNext = false;
      why = "the card was declined";
    } else if (fault === "down") why = "the Payments API is down";
    else if (fault === "slow") o.slow = true;
    if (!why) return false;
    w.order = null;
    this.stats.failed++;
    this.lose(o);
    this.say(
      this.ackMode === "after"
        ? `Order #${o.num} failed: ${why}. The worker dropped it, so nothing retries it and nothing is refunded or released.`
        : `Order #${o.num} failed: ${why}. The queue already deleted it, so nothing retries it and nothing is refunded or released.`,
    );
    return true;
  }

  toggleAckMode() {
    this.ackMode = this.ackMode === "auto" ? "after" : "auto";
    this.say(
      this.ackMode === "after"
        ? "Ack after processing: the queue keeps each order until a worker finishes it, so a crash redelivers it."
        : "Auto-ack: the queue deletes each order as soon as it hands it to a worker.",
    );
  }

  /** At-least-once: the queue never saw an ack, so the whole order goes back to the front and starts again. */
  private redeliver(o: SimOrder) {
    o.chargedBefore ||= o.charged;
    o.state = "queued";
    o.worker = 0;
    o.done = [false, false, false, false];
    o.cur = 0;
    o.t = 0;
    o.chargeTried = false;
    o.slow = false;
    this.queue.unshift(o);
  }

  /** Start a Payments fault: down (500s) or slow (5 s calls) for 10 s, or decline the next card. */
  payments(mode: "down" | "slow" | "declined") {
    if (mode === "declined") {
      this.declineNext = true;
      this.say("The next card will be declined.");
      return;
    }
    this.payFault = { mode, until: this.now + PAY_MS };
    this.say(mode === "down" ? "Payments API is down for 10 s." : "Payments API is slow for 10 s: charges take 5 s.");
  }

  /**
   * Advance the simulation. `now` is real time, so outages (10 s) always
   * last their stated seconds; `speed` only scales
   * how fast orders move: client pace, fetching and each activity.
   */
  tick(dt: number, speed = 1) {
    this.now += dt;
    const now = this.now;
    for (let c = 0; c < 4; c++) {
      if (this.running && now >= this.nextAt[c]) {
        this.spawn(c);
        this.nextAt[c] = now + (EVERY[0] + this.rng() * (EVERY[1] - EVERY[0])) / speed;
      }
    }
    if (now >= this.hubDown) {
      for (const w of this.workers) {
        if (w.downUntil <= now && !w.order && this.queue.length) {
          const o = this.queue.shift()!;
          const waited = Math.round((now - o.queuedAt) / 1000);
          if (o.client === VIP && o.behindBulk && waited >= 5) this.say(`VIP order #${o.num} waited ${waited} s behind the bulk job. A plain queue is first in, first out.`);
          w.order = o;
          o.worker = w.id;
          o.state = "fetching";
          o.t = 0;
        }
      }
    }
    for (const o of this.orders) {
      o.t += dt * speed;
      const w = o.worker ? this.workers[o.worker - 1] : null;
      switch (o.state) {
        case "fetching":
          if (o.t >= 450) {
            o.state = "running";
            o.t = 0;
          }
          break;
        case "running": {
          if (!w) break;
          if (o.cur === CHARGE && !o.chargeTried) {
            if (this.tryCharge(o, w)) break;
          }
          if (o.cur === CHARGE && o.t >= this.actMs(o) / 2) o.charged = true;
          if (o.t >= this.actMs(o)) {
            o.done[o.cur] = true;
            if (o.cur === CHARGE && o.chargedBefore) {
              this.stats.dup++;
              this.say(`Order #${o.num} was charged twice: the queue redelivered it after the crash.`);
            }
            o.cur++;
            o.t = 0;
            if (o.cur >= 4) {
              w.order = null;
              w.completed++;
              o.state = "done";
              o.endedAt = now;
              this.stats.done++;
            }
          }
          break;
        }
      }
    }
    this.orders = this.orders.filter((o) => !(o.state === "done" || o.state === "lost") || now - o.endedAt < 1500);
  }

  hit(node: NodeId, tool: ToolId) {
    const now = this.now;
    if (node === "hub") {
      if (tool !== "hammer") return;
      this.hubDown = now + HAMMER_MS;
      const n = this.queue.length;
      this.queue.forEach((o) => this.lose(o));
      this.queue = [];
      this.say(`The queue lived in memory. ${n} waiting orders are gone, and new orders fail for 10 s.`);
      return;
    }
    if (node.startsWith("w:")) {
      if (tool !== "hammer") return;
      const w = this.workers[Number(node.slice(2)) - 1];
      if (now < w.downUntil) return;
      w.downUntil = now + HAMMER_MS;
      const o = w.order;
      w.order = null;
      if (!o) return this.say(`${workerName(w.id)} crashed while idle.`);
      const doneN = o.done.filter(Boolean).length;
      const stepName = STEP_NAMES[Math.min(o.cur, 3)];
      if (this.ackMode === "after") {
        this.redeliver(o);
        this.say(
          `${workerName(w.id)} died during “${stepName}”. The queue never got an ack, so it redelivers order #${o.num}${o.charged ? ", and the card will be charged again" : ""}.`,
        );
        return;
      }
      this.lose(o);
      this.say(
        `${workerName(w.id)} died during “${stepName}”. The queue already deleted order #${o.num}, so it's lost with ${doneN} of 4 steps done${o.charged ? " and the card already charged" : ""}.`,
      );
      return;
    }
    if (node.startsWith("c:")) this.say("Those are your customers. Please don't hammer them.");
  }

  setRunning(run: boolean) {
    if (run === this.running) return;
    this.running = run;
    if (run) this.nextAt = this.nextAt.map(() => this.now + 200 + this.rng() * 1500);
    else this.say("Paused: clients stopped placing orders. Orders in flight finish.");
  }

  flood() {
    for (let i = 0; i < 30; i++) this.spawn(i % 4);
    this.say("30 orders incoming.");
  }

  private tag(o: SimOrder) {
    return o.client === VIP ? "VIP" : undefined;
  }

  /** A plain queue cannot pause an order mid-flight: the only way to stop work is to stop the consumers. */
  pauseAll() {
    let held = 0;
    for (const w of this.workers) {
      w.downUntil = Infinity;
      const o = w.order;
      w.order = null;
      if (!o) continue;
      held++;
      if (this.ackMode === "after") this.redeliver(o);
      else this.lose(o);
    }
    this.say(
      this.ackMode === "after"
        ? `A queue can't pause an order mid-flight: stopping the workers sent ${held} back to the queue. Nothing resumes them.`
        : `A queue can't pause an order mid-flight: stopping the workers dropped ${held} of them. The rest sit in the queue and nothing resumes them.`,
    );
  }

  bulkJob() {
    for (let i = 0; i < 40; i++) this.spawn(BULK, true);
    this.say("A bulk job of 40 orders just landed in the queue.");
  }

  view(): ArenaView {
    const now = this.now;
    const cfg = this.cfg;
    const workers: WorkerCardView[] = this.workers.map((w) => {
      const down = now < w.downUntil;
      const o = w.order;
      const rows: ChecklistRowView[] = STEP_NAMES.map((label, i) => {
        if (!o) return { label, state: "placeholder" };
        if (o.done[i]) return { label, state: "done" };
        if (i === o.cur && o.state === "running") return { label, state: "running", progress: Math.min(1, o.t / this.actMs(o)) };
        return { label, state: "pending" };
      });
      let status = "idle";
      let statusTone: WorkerCardView["statusTone"] = "dim";
      const stopped = w.downUntil === Infinity;
      if (stopped) {
        status = "STOPPED";
        statusTone = "bad";
      } else if (down) {
        status = `DOWN · ${Math.ceil((w.downUntil - now) / 1000)}s`;
        statusTone = "bad";
      } else if (o?.state === "fetching") status = "fetching";
      else if (o) {
        status = "running";
        statusTone = "good";
      }
      return {
        id: w.id,
        up: !down,
        downLeftMs: stopped ? HAMMER_MS : Math.max(0, w.downUntil - now),
        status,
        statusTone,
        orderLabel: o ? `Order #${o.num}` : undefined,
        orderTone: "neutral",
        ghost: false,
        rows,
        footer: `✓ ${w.completed} orders completed`,
      };
    });

    const dots: DotView[] = [];
    this.queue.forEach((o, i) => dots.push({ id: o.id, client: o.client, loc: { kind: "hub", slot: i }, ring: "none", hidden: i >= HUB_IN.cells, tag: this.tag(o) }));
    for (const o of this.orders) {
      if (o.state === "fetching" || o.state === "running")
        dots.push({ id: o.id, client: o.client, loc: { kind: "worker", worker: o.worker }, ring: o.charged ? "charged" : "none", tag: this.tag(o) });
      else if (o.state === "done")
        dots.push({ id: o.id, client: o.client, loc: { kind: "worker", worker: o.worker }, ring: "done", fate: "done" });
      else if (o.state === "lost") dots.push({ id: o.id, client: o.client, loc: { kind: "gone" }, ring: "none", fate: "lost" });
    }

    const inflight = this.orders.filter((o) => o.state !== "done" && o.state !== "lost").length;
    const values: Record<ScoreKey, number> = { done: this.stats.done, inflight, lost: this.stats.lost, dup: this.stats.dup, failed: this.stats.failed, paused: 0, canceled: 0 };
    const keys: ScoreKey[] = this.ackMode === "after" && !cfg.score.includes("dup") ? [...cfg.score.slice(0, 3), "dup", ...cfg.score.slice(3)] : cfg.score;
    const score: ScoreItemView[] = keys.map((k) => ({
      key: k,
      // A plain queue has no compensation, so a failure here is never "clean".
      label: k === "failed" ? "Failed" : SCORE_META[k].label,
      value: values[k],
      tone: values[k] || k === "done" ? (k === "failed" ? "bad" : SCORE_META[k].tone) : "neutral",
    }));

    const hubDown = now < this.hubDown;
    return {
      hub: {
        label: cfg.hub,
        up: !hubDown,
        downLeftMs: Math.max(0, this.hubDown - now),
        starting: false,
        info: hubDown ? `DOWN · ${Math.ceil((this.hubDown - now) / 1000)}s` : `waiting ${this.queue.length}`,
        more: this.queue.length > HUB_IN.cells ? `+${this.queue.length - HUB_IN.cells} more` : undefined,
        lanes: false,
        store: "memory",
      },
      payments:
        this.payFault && now < this.payFault.until ? { state: this.payFault.mode, leftMs: this.payFault.until - now } : { state: "ok", leftMs: 0 },
      side: null,
      workers,
      dots,
      panels: {
        workers: this.workers.map((w) => {
          const down = now < w.downUntil;
          return { id: w.id, up: !down, note: w.downUntil === Infinity ? "stopped" : down ? `down · ${Math.ceil((w.downUntil - now) / 1000)}s` : w.order ? "busy" : "idle", noteTone: down ? "bad" : "dim", completed: w.completed };
        }),
        service: { label: "Queue", up: !hubDown, note: hubDown ? `${Math.ceil((this.hubDown - now) / 1000)}s` : "●" },
        score,
      },
      banner: this.banner,
      connected: true,
      sched: "fifo",
      ackAfter: this.ackMode === "after",
    };
  }
}

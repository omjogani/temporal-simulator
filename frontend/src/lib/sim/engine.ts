// Act 1: an in-browser illustration of a plain in-memory queue that deletes
// each order as soon as it hands it to a worker (auto-ack).
// It is deliberately not real infrastructure; Act 2 is where real Temporal runs.

import { HUB_IN } from "../geometry";
import { HAMMER_MS, SCORE_META, STEP_NAMES, workerName } from "../steps";
import type { ArenaView, ChecklistRowView, DotView, NodeId, ScoreItemView, ScoreKey, ToolId, WorkerCardView } from "../types";

const ACT_MS = 700;
const EVERY: [number, number] = [2600, 3800];
const CHARGE = 1;

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
  private stats = { done: 0, lost: 0 };
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

  private spawn(client: number) {
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
          if (o.cur === CHARGE && o.t >= ACT_MS / 2) o.charged = true;
          if (o.t >= ACT_MS) {
            o.done[o.cur] = true;
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

  view(): ArenaView {
    const now = this.now;
    const cfg = this.cfg;
    const workers: WorkerCardView[] = this.workers.map((w) => {
      const down = now < w.downUntil;
      const o = w.order;
      const rows: ChecklistRowView[] = STEP_NAMES.map((label, i) => {
        if (!o) return { label, state: "placeholder" };
        if (o.done[i]) return { label, state: "done" };
        if (i === o.cur && o.state === "running") return { label, state: "running", progress: Math.min(1, o.t / ACT_MS) };
        return { label, state: "pending" };
      });
      let status = "idle";
      let statusTone: WorkerCardView["statusTone"] = "dim";
      if (down) {
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
        downLeftMs: Math.max(0, w.downUntil - now),
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
    this.queue.forEach((o, i) => dots.push({ id: o.id, client: o.client, loc: { kind: "hub", slot: i }, ring: "none", hidden: i >= HUB_IN.cells }));
    for (const o of this.orders) {
      if (o.state === "fetching" || o.state === "running")
        dots.push({ id: o.id, client: o.client, loc: { kind: "worker", worker: o.worker }, ring: o.charged ? "charged" : "none" });
      else if (o.state === "done")
        dots.push({ id: o.id, client: o.client, loc: { kind: "worker", worker: o.worker }, ring: "done", fate: "done" });
      else if (o.state === "lost") dots.push({ id: o.id, client: o.client, loc: { kind: "gone" }, ring: "none", fate: "lost" });
    }

    const inflight = this.orders.filter((o) => o.state !== "done" && o.state !== "lost").length;
    const values: Record<ScoreKey, number> = { done: this.stats.done, inflight, lost: this.stats.lost, dup: 0, failed: 0, paused: 0 };
    const score: ScoreItemView[] = cfg.score.map((k) => ({ key: k, label: SCORE_META[k].label, value: values[k], tone: values[k] || k === "done" ? SCORE_META[k].tone : "neutral" }));

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
      payments: { state: "ok", leftMs: 0 },
      side: null,
      workers,
      dots,
      panels: {
        workers: this.workers.map((w) => {
          const down = now < w.downUntil;
          return { id: w.id, up: !down, note: down ? `down · ${Math.ceil((w.downUntil - now) / 1000)}s` : w.order ? "busy" : "idle", noteTone: down ? "bad" : "dim", completed: w.completed };
        }),
        service: { label: "Queue", up: !hubDown, note: hubDown ? `${Math.ceil((this.hubDown - now) / 1000)}s` : "●" },
        score,
      },
      banner: this.banner,
      connected: true,
      sched: "fifo",
    };
  }
}

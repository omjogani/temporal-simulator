import { describe, expect, test } from "vitest";
import { STEPS } from "../steps";
import type { SnapOrder, SnapStep, Snapshot } from "./snapshot";
import { liveView, stepProgress } from "./toView";

test("progress is clamped to 0..1", () => {
  expect(stepProgress(1000, 1200, 500)).toBe(0); // browser clock behind the server
  expect(stepProgress(1250, 1000, 500)).toBe(0.5);
  expect(stepProgress(9000, 1000, 500)).toBe(1);
});

test("progress is 0 when the step has no timing yet", () => {
  expect(stepProgress(1000, undefined, 500)).toBe(0);
  expect(stepProgress(1000, 900, undefined)).toBe(0);
  expect(stepProgress(1000, 900, 0)).toBe(0);
});

describe("idiom state", () => {
  const NOW = 1_000_000;
  const cfg = STEPS[1];
  const step = (state: SnapStep["state"] = "pending"): SnapStep => ({ state, attempt: 1, worker: -1 });
  const order = (o: Partial<SnapOrder> = {}): SnapOrder => ({
    id: "o1", num: 1, client: 0, declined: false, status: "queued", worker: -1,
    steps: [step(), step(), step(), step()], current: 0, charged: 0, pauseRequested: false,
    giftWrap: false, address: "", waitUntil: 0, express: false, timeout: "", stuck: "", ...o,
  });
  const snap = (orders: SnapOrder[] = [], workers: Partial<Snapshot["workers"][number]>[] = []): Snapshot => ({
    now: NOW, step: 2, live: true, temporal: { up: true, downUntil: 0 },
    workers: [1, 2, 3, 4].map((id, i) => ({ id, up: true, downUntil: 0, frozen: false, completed: 0, replayedAt: 0, replayedEvents: 0, ...workers[i] })),
    payments: { downUntil: 0, slowUntil: 0, charges: 0, deduped: 0, failures: 0 },
    orders, stats: { done: 0, failed: 0, lost: 0, canceled: 0, duplicates: 0, inflight: 0, paused: 0 },
    sched: "fifo", waits: [0, 0, 0, 0], clientDone: [0, 0, 0, 0], banner: { seq: 0, text: "" },
    retry: { initialMs: 1000, coefficient: 2, maxMs: 0, maxAttempts: 0 }, startToCloseMs: 5000,
    speed: 1, running: false, temporalUi: "", scene: { idemKey: false, build: "good" }, queue: { pollers: [2], backlog: 0 },
  });
  const dot = (o: Partial<SnapOrder>) => liveView(snap([order(o)]), cfg, NOW, true).dots[0];
  const worker0 = (w: Partial<Snapshot["workers"][number]>) => liveView(snap([], [w]), cfg, NOW, true).workers[0];

  test("sleeping order sits on the hub timers with seconds left", () => {
    const d = dot({ waitUntil: NOW + 4000 });
    expect(d.loc).toMatchObject({ kind: "hub", timer: true });
    expect(d.label).toBe("4s");
  });
  test("stuck order gets the stuck ring and stamp", () => {
    const d = dot({ stuck: "nondeterminism" });
    expect(d.ring).toBe("stuck");
    expect(d.stamp).toBe("stuck");
  });
  test("canceled status is a canceled fate", () => {
    expect(dot({ status: "canceled" }).fate).toBe("canceled");
  });
  test("a second charge is a duplicate ring", () => {
    expect(dot({ charged: 2 }).ring).toBe("dup");
    expect(dot({ charged: 1 }).ring).toBe("charged");
  });
  test("gift wrap and timeout become bow and tag", () => {
    const d = dot({ giftWrap: true, timeout: "heartbeat" });
    expect(d.bow).toBe(true);
    expect(d.tag).toBe("heartbeat ⏱");
  });
  test("replay shows for 6 s only", () => {
    expect(worker0({ replayedAt: NOW - 1000, replayedEvents: 12 }).replayed).toEqual({ events: 12, ago: 1000 });
    expect(worker0({ replayedAt: NOW - 9000, replayedEvents: 12 }).replayed).toBeUndefined();
  });
  test("a frozen worker is frozen, not down", () => {
    const w = worker0({ frozen: true, downUntil: NOW + 3000 });
    expect(w.up).toBe(true);
    expect(w.frozen).toBe(true);
    expect(w.status).toBe("FROZEN · 3s");
    expect(w.statusTone).toBe("gold");
  });
  test("queue, scene and polling pass through", () => {
    const v = liveView(snap(), cfg, NOW, true);
    expect(v.queue).toEqual({ pollers: [2], backlog: 0 });
    expect(v.scene).toEqual({ idemKey: false, build: "good" });
    expect(v.workers.map((w) => w.polling)).toEqual([false, true, false, false]);
  });
});

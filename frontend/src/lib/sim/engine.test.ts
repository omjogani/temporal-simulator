import { describe, expect, test } from "vitest";
import { QueueSim } from "./engine";
import { getStep, tryThisLines } from "../steps";
import type { ScoreKey } from "../types";

const SCORE: ScoreKey[] = ["done", "inflight", "lost", "failed"];

export function newSim(score: ScoreKey[] = SCORE) {
  return new QueueSim({ score, hub: "Message queue" });
}

export function runFor(sim: QueueSim, ms: number, step = 16) {
  for (let t = 0; t < ms; t += step) sim.tick(step);
}

/** Run until some banner matches `re` (banners are overwritten, so the final one is not the one to assert on). */
export function runUntilBanner(sim: QueueSim, re: RegExp, ms: number, step = 16): string | null {
  for (let t = 0; t < ms; t += step) {
    sim.tick(step);
    const text = sim.view().banner.text;
    if (re.test(text)) return text;
  }
  return null;
}

function score(sim: QueueSim, key: ScoreKey) {
  return sim.view().panels.score.find((s) => s.key === key)?.value ?? 0;
}

describe("payments faults", () => {
  test("payments down drops orders that reach Charge and counts them as failed and lost", () => {
    const sim = newSim();
    sim.payments("down");
    sim.flood();
    runFor(sim, 9000);
    expect(score(sim, "failed")).toBeGreaterThan(0);
    expect(score(sim, "failed")).toBe(score(sim, "lost"));
    expect(score(sim, "done")).toBe(0);
    expect(sim.view().payments.state).toBe("down");
  });

  test("a payments fault expires after 10 s so later orders complete", () => {
    const sim = newSim();
    sim.payments("down");
    runFor(sim, 10_500);
    expect(sim.view().payments.state).toBe("ok");
    sim.flood();
    runFor(sim, 60_000);
    expect(score(sim, "done")).toBe(30);
    expect(score(sim, "failed")).toBe(0);
  });

  test("declined drops exactly the next order at Charge with a declined banner", () => {
    const sim = newSim();
    sim.payments("declined");
    sim.flood();
    expect(runUntilBanner(sim, /declined/i, 60_000)).not.toBeNull();
    runFor(sim, 60_000);
    expect(score(sim, "failed")).toBe(1);
    expect(score(sim, "lost")).toBe(1);
    expect(score(sim, "done")).toBe(29);
  });

  test("payments slow stretches Charge to 5 s but orders still complete", () => {
    const sim = newSim();
    sim.payments("slow");
    sim.flood();
    runFor(sim, 7000);
    expect(score(sim, "done")).toBe(0);
    runFor(sim, 60_000);
    expect(score(sim, "done")).toBe(30);
    expect(score(sim, "failed")).toBe(0);
  });
});

describe("ack mode", () => {
  /** Flood, let the workers pick up orders and pass Charge, so every worker holds a charged order. */
  function busy(sim: QueueSim) {
    sim.flood();
    runFor(sim, 2000);
    expect(sim.view().dots.some((d) => d.ring === "charged")).toBe(true);
  }

  test("auto-ack loses the order a crashed worker was holding", () => {
    const sim = newSim();
    busy(sim);
    sim.hit("w:1", "hammer");
    expect(score(sim, "lost")).toBe(1);
  });

  test("ack-after redelivers the in-hand order so nothing is lost", () => {
    const sim = newSim();
    sim.toggleAckMode();
    busy(sim);
    sim.hit("w:1", "hammer");
    expect(score(sim, "lost")).toBe(0);
    runFor(sim, 60_000);
    expect(score(sim, "done")).toBe(30);
  });

  test("ack-after charges an already-charged order twice after a crash", () => {
    const sim = newSim();
    sim.toggleAckMode();
    busy(sim);
    sim.hit("w:1", "hammer");
    expect(runUntilBanner(sim, /charged twice/i, 60_000)).not.toBeNull();
    runFor(sim, 60_000);
    expect(score(sim, "dup")).toBe(1);
  });

  test("the Dup counter only appears in ack-after mode", () => {
    const sim = newSim();
    expect(sim.view().panels.score.some((s) => s.key === "dup")).toBe(false);
    sim.toggleAckMode();
    expect(sim.ackMode).toBe("after");
    expect(sim.view().panels.score.some((s) => s.key === "dup")).toBe(true);
    expect(sim.view().ackAfter).toBe(true);
  });

  test("a queue crash still wipes redelivered orders in ack-after mode", () => {
    const sim = newSim();
    sim.toggleAckMode();
    busy(sim);
    sim.hit("w:1", "hammer");
    sim.hit("hub", "hammer");
    expect(score(sim, "lost")).toBe(27);
  });
});

describe("bulk job", () => {
  const hubDots = (sim: QueueSim) => sim.view().dots.filter((d) => d.loc.kind === "hub").length;

  test("bulkJob enqueues 40 orders at once", () => {
    const sim = newSim();
    sim.bulkJob();
    expect(hubDots(sim)).toBe(40);
  });
});

describe("pause all", () => {
  const hubDots = (sim: QueueSim) => sim.view().dots.filter((d) => d.loc.kind === "hub").length;
  const onWorkers = (sim: QueueSim) => sim.view().dots.filter((d) => d.loc.kind === "worker" && !d.fate).length;

  test("stopped workers take no more orders while the queue keeps growing", () => {
    const sim = newSim();
    sim.flood();
    sim.pauseAll();
    runFor(sim, 30_000);
    expect(score(sim, "done")).toBe(0);
    expect(hubDots(sim)).toBe(30);
    sim.setRunning(true);
    runFor(sim, 30_000);
    expect(hubDots(sim)).toBeGreaterThan(30);
    expect(sim.view().workers.every((w) => !w.up)).toBe(true);
  });

  test("auto-ack: stopping the workers drops every order they were holding", () => {
    const sim = newSim();
    sim.flood();
    runFor(sim, 1500);
    sim.pauseAll();
    expect(score(sim, "lost")).toBe(4);
    expect(sim.view().banner.text).toMatch(/can't pause/i);
  });

  test("ack-after: stopping the workers sends their orders back to the queue", () => {
    const sim = newSim();
    sim.toggleAckMode();
    sim.flood();
    runFor(sim, 1500);
    sim.pauseAll();
    expect(score(sim, "lost")).toBe(0);
    expect(hubDots(sim)).toBe(30);
  });

  test("flood, bulk job and hammer after a pause do not throw and leave nothing running", () => {
    const sim = newSim();
    sim.pauseAll();
    sim.flood();
    sim.bulkJob();
    sim.hit("w:1", "hammer");
    sim.hit("hub", "hammer");
    runFor(sim, 20_000);
    expect(onWorkers(sim)).toBe(0);
  });
});

describe("honest copy (final review fixes)", () => {
  test("the Failed counter is red and not called clean in step 1", () => {
    const sim = newSim();
    sim.payments("declined");
    sim.flood();
    runUntilBanner(sim, /declined/i, 60_000);
    const item = sim.view().panels.score.find((s) => s.key === "failed")!;
    expect(item.label).toBe("Failed");
    expect(item.tone).toBe("bad");
  });

  test("in ack-after mode a failed charge is not described as already deleted by the queue", () => {
    const sim = newSim();
    sim.toggleAckMode();
    sim.payments("declined");
    sim.flood();
    const text = runUntilBanner(sim, /Order #\d+ failed/, 60_000);
    expect(text).not.toBeNull();
    expect(text).not.toMatch(/already deleted/i);
    expect(text).toMatch(/worker dropped/i);
  });
});

describe("step 1 does not reveal the VIP idea (that is step 4)", () => {
  test("no VIP tag, banner or caption anywhere in the plain queue", () => {
    const sim = newSim();
    sim.bulkJob();
    sim.flood();
    sim.setRunning(true);
    const seen: string[] = [];
    for (let t = 0; t < 120_000; t += 16) {
      sim.tick(16);
      const v = sim.view();
      seen.push(v.banner.text, ...v.dots.map((d) => d.tag ?? ""));
    }
    expect(seen.some((x) => /vip/i.test(x))).toBe(false);
    expect(tryThisLines(getStep(1)!).some((l) => /vip/i.test(l))).toBe(false);
  });
});

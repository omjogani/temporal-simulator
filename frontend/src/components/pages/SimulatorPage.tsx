"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Tag, UrlPill } from "@/components/atoms";
import { SpeedSlider } from "@/components/molecules";
import { BannerLine, Board, ConnectionNotice, OrdersPanel, RecapCard, StepRail, Toolbox, TryThis, WorkersPanel } from "@/components/organisms";
import { ArenaTemplate } from "@/components/templates/ArenaTemplate";
import { api } from "@/lib/live/api";
import { emptyLiveView, liveView } from "@/lib/live/toView";
import { sparkViews, useLive } from "@/lib/live/useLive";
import { useDotMotion } from "@/lib/motion/useDotMotion";
import { QueueSim, simConfigFor } from "@/lib/sim/engine";
import { STEPS, getStep } from "@/lib/steps";
import type { ActionId, ArenaView, NodeId, SchedMode, ToolId } from "@/lib/types";
import { useFrameLoop } from "@/lib/useFrameLoop";
import { SPEED_STOPS, nudgeSpeed, setSpeed, useSpeed } from "@/lib/speed";
import styles from "./SimulatorPage.module.css";

const BANNER_MS = 7000;

export function SimulatorPage({ stepId }: { stepId: number }) {
  const step = getStep(stepId) ?? STEPS[0];
  const router = useRouter();
  const [tool, setTool] = useState<ToolId>(step.tools[0]);
  const [frozen, setFrozen] = useState(false);
  const [recap, setRecap] = useState(false);
  const [banner, setBanner] = useState({ seq: -1, at: 0 });

  // Act 1: one simulation per step (the page is keyed by step); Reset swaps it.
  const newSim = () => (step.live ? null : new QueueSim(simConfigFor(step.id as 1 | 2, step.score, step.hub)));
  const [sim, setSim] = useState<QueueSim | null>(newSim);

  // Act 2: live snapshots from the Go controller (real Temporal).
  const live = useLive(step.id, step.live);

  // Speed: scales the simulation clock (Act 1), the board animation, and on
  // live steps the real activity durations and client pace in the controller.
  const speed = useSpeed();
  useEffect(() => {
    if (step.live) void api.speed(speed);
  }, [speed, step.live]);

  const { now, wall } = useFrameLoop((dt) => {
    if (sim && !frozen) sim.tick(dt * speed);
  });
  const place = useDotMotion();

  let view: ArenaView;
  if (!step.live) view = sim ? sim.view() : emptyLiveView(step, true);
  else if (live.snapshot && live.snapshot.step === step.id) {
    const serverNow = wall + live.offset;
    view = liveView(live.snapshot, step, serverNow, sparkViews(live.sparks, serverNow), live.connected);
  } else view = emptyLiveView(step, live.connected);

  const dots = place(view.dots, now, speed);

  // Show each banner for a few seconds.
  if (view.banner.seq !== banner.seq && view.banner.text) setBanner({ seq: view.banner.seq, at: now });
  const bannerText = view.banner.text && now - banner.at < BANNER_MS ? view.banner.text : "";

  const hit = (node: NodeId) => {
    if (!step.live) {
      sim?.hit(node, tool);
      return;
    }
    if (node.startsWith("w:")) {
      const id = Number(node.slice(2));
      if (tool === "hammer") void api.hammerWorker(id);
      else if (tool === "pause") {
        const o = live.snapshot?.orders.find((x) => x.worker === id && x.status === "running");
        if (o) void api.pause(o.id);
      }
    } else if (node === "hub" && tool === "hammer") void api.hammerTemporal();
    else if (node === "pay" && tool === "zap") void api.payments("down");
    else if (node === "pay" && tool === "snail") void api.payments("slow");
  };

  const action = (a: ActionId) => {
    if (a === "reset") {
      if (step.live) void api.step(step.id, true);
      else setSim(newSim());
      setRecap(false);
      return;
    }
    if (a === "recap") return setRecap((r) => !r);
    if (!step.live) {
      if (a === "flood") sim?.flood();
      return;
    }
    if (a === "flood" || a === "bulk" || a === "declined") void api.load(a);
    else if (a === "hammerAll") void api.hammerWorkers();
    else if (a === "pauseAll") void api.pause();
    else if (a === "resumeAll") void api.resume();
  };

  const setSched = (m: SchedMode) => void api.sched(m);

  // Keyboard: ← → steps, tool and action hotkeys, space to freeze (Act 1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) return; // e.g. arrow keys on the speed slider
      const k = e.key.toLowerCase();
      const has = (a: ActionId) => step.actions.includes(a);
      if (e.key === "ArrowRight" && step.id < STEPS.length) router.push(`/${step.id + 1}`);
      else if (e.key === "ArrowLeft" && step.id > 1) router.push(`/${step.id - 1}`);
      else if (k === "h" && step.tools.includes("hammer")) setTool("hammer");
      else if (k === "z" && step.tools.includes("zap")) setTool("zap");
      else if (k === "s" && step.tools.includes("snail")) setTool("snail");
      else if (k === "p" && step.tools.includes("pause")) setTool("pause");
      else if (k === "f") {
        if (has("bulk")) action("bulk");
        else if (has("flood")) action("flood");
      } else if (k === "a" && has("hammerAll")) action("hammerAll");
      else if (k === "d" && has("declined")) action("declined");
      else if (k === "r") action("reset");
      else if (e.key === "-" || e.key === "_") nudgeSpeed(-1);
      else if (e.key === "=" || e.key === "+") nudgeSpeed(1);
      else if (e.key === " " && !step.live) {
        e.preventDefault();
        setFrozen((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <ArenaTemplate
      url={<UrlPill host="localhost:13000" path={String(step.id)} />}
      title={step.name}
      tag={<Tag tone={step.act === 1 ? "bad" : "good"}>{step.act === 1 ? "Without Temporal" : "Real Temporal"}</Tag>}
      extra={
        step.live && view.temporalUi ? (
          <a className={styles.uiLink} href={`${view.temporalUi}/namespaces/default/workflows`} target="_blank" rel="noreferrer">
            Temporal UI ↗
          </a>
        ) : undefined
      }
      speed={<SpeedSlider value={speed} stops={SPEED_STOPS} onChange={setSpeed} />}
      toolbox={
        <Toolbox
          step={step}
          tool={tool}
          sched={view.sched}
          frozen={frozen}
          onTool={setTool}
          onAction={action}
          onSched={setSched}
          onFreeze={() => setFrozen((f) => !f)}
        />
      }
      left={<WorkersPanel panels={view.panels} />}
      board={<Board view={view} dots={dots} onHit={hit} onResume={(id) => void api.resume(id)} />}
      overlay={step.live && !view.connected ? <ConnectionNotice /> : recap ? <RecapCard onClose={() => setRecap(false)} /> : undefined}
      right={<OrdersPanel panels={view.panels} />}
      caption={<TryThis text={step.tryThis} />}
      banner={<BannerLine text={bannerText} />}
      rail={<StepRail current={step.id} />}
    />
  );
}

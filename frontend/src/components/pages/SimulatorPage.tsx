"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Tag } from "@/components/atoms";
import { PlayButton, SpeedSlider } from "@/components/molecules";
import { BannerLine, Board, ConnectionNotice, OrdersPanel, StepNav, Toolbox, TryThis, WorkersPanel } from "@/components/organisms";
import { ArenaTemplate } from "@/components/templates/ArenaTemplate";
import { api } from "@/lib/live/api";
import { emptyLiveView, liveView } from "@/lib/live/toView";
import { useLive } from "@/lib/live/useLive";
import { useDotMotion } from "@/lib/motion/useDotMotion";
import { QueueSim } from "@/lib/sim/engine";
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
  const [banner, setBanner] = useState({ seq: -1, at: 0 });

  // Act 1: one simulation per step (the page is keyed by step); Reset swaps it.
  const newSim = () => (step.live ? null : new QueueSim({ score: step.score, hub: step.hub }));
  const [sim, setSim] = useState<QueueSim | null>(newSim);

  // Act 2: live snapshots from the Go controller (real Temporal).
  const live = useLive(step.id, step.live);

  // Speed: scales how fast orders move (dot travel, client pace, activity
  // time; on live steps the controller does this with real activities).
  // Outage timers such as the 10 s hammer always run in real time.
  const speed = useSpeed();
  useEffect(() => {
    if (step.live) void api.speed(speed);
  }, [speed, step.live]);

  const { now, wall } = useFrameLoop((dt) => {
    if (sim && !frozen) sim.tick(dt, speed);
  });
  const place = useDotMotion();

  let view: ArenaView;
  if (!step.live) view = sim ? sim.view() : emptyLiveView(step, true);
  else if (live.snapshot && live.snapshot.step === step.id) {
    const serverNow = wall + live.offset;
    view = liveView(live.snapshot, step, serverNow, live.connected);
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
  };

  const action = (a: ActionId) => {
    if (a === "reset") {
      if (step.live) void api.step(step.id, true);
      else setSim(newSim());
      return;
    }
    if (!step.live) {
      if (a === "flood") sim?.flood();
      return;
    }
    if (a === "flood" || a === "bulk" || a === "declined") void api.load(a);
    else if (a === "payDown") void api.payments("down");
    else if (a === "paySlow") void api.payments("slow");
    else if (a === "hammerAll") void api.hammerWorkers();
    else if (a === "pauseAll") void api.pause();
    else if (a === "resumeAll") void api.resume();
  };

  const setSched = (m: SchedMode) => void api.sched(m);

  // Play / pause: clients only place orders while playing. Every step loads paused.
  const playing = step.live ? Boolean(live.snapshot?.running) : Boolean(sim?.running);
  const togglePlay = () => {
    if (step.live) void api.run(!playing);
    else sim?.setRunning(!playing);
  };

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
      else if (k === "z" && has("payDown")) action("payDown");
      else if (k === "s" && has("paySlow")) action("paySlow");
      else if (k === "p" && step.tools.includes("pause")) setTool("pause");
      else if (k === "f") {
        if (has("bulk")) action("bulk");
        else if (has("flood")) action("flood");
      } else if (k === "a" && has("hammerAll")) action("hammerAll");
      else if (k === "d" && has("declined")) action("declined");
      else if (k === "r") action("reset");
      else if (e.key === "-" || e.key === "_") nudgeSpeed(-1);
      else if (e.key === "=" || e.key === "+") nudgeSpeed(1);
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <ArenaTemplate
      url={<StepNav current={step.id} />}
      title={step.name}
      tag={<Tag tone={step.act === 1 ? "bad" : "good"}>{step.act === 1 ? "Without Temporal" : "Real Temporal"}</Tag>}
      extra={
        step.live && view.temporalUi ? (
          <a className={styles.uiLink} href={`${view.temporalUi}/namespaces/default/workflows`} target="_blank" rel="noreferrer">
            Temporal UI ↗
          </a>
        ) : undefined
      }
      speed={
        <>
          <PlayButton playing={playing} onToggle={togglePlay} />
          <SpeedSlider value={speed} stops={SPEED_STOPS} onChange={setSpeed} />
        </>
      }
      toolbox={
        <Toolbox
          step={step}
          tool={tool}
          sched={view.sched}
          payments={view.payments}
          frozen={frozen}
          onTool={setTool}
          onAction={action}
          onSched={setSched}
          onFreeze={() => setFrozen((f) => !f)}
        />
      }
      left={<WorkersPanel panels={view.panels} />}
      board={<Board view={view} dots={dots} onHit={hit} onResume={(id) => void api.resume(id)} />}
      overlay={step.live && !view.connected ? <ConnectionNotice /> : undefined}
      right={<OrdersPanel panels={view.panels} />}
      caption={<TryThis text={step.tryThis} />}
      banner={<BannerLine text={bannerText} />}
    />
  );
}

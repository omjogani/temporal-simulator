"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Tag } from "@/components/atoms";
import { PlayButton, SpeedSlider } from "@/components/molecules";
import { BannerLine, Board, CodeDrawer, CodePanel, ConnectionNotice, HistoryStrip, OrdersPanel, StepNav, Toolbox, TryThis, WorkersPanel } from "@/components/organisms";
import { ArenaTemplate } from "@/components/templates/ArenaTemplate";
import { bubbleVisible, type Bubble } from "@/lib/bubble";
import { activeAnchor } from "@/lib/code";
import { api } from "@/lib/live/api";
import { emptyLiveView, liveView } from "@/lib/live/toView";
import { useLive } from "@/lib/live/useLive";
import { useDotMotion } from "@/lib/motion/useDotMotion";
import { QueueSim } from "@/lib/sim/engine";
import { toggleCodeOpen } from "@/lib/codeOpen";
import { IDIOMS, neighbours } from "@/lib/idioms";
import { stepAccent, workerName, type StepConfig } from "@/lib/steps";
import { SceneBackdrop } from "@/components/organisms/board/SceneBackdrop";
import { FxCanvas } from "@/components/organisms/board/FxCanvas";
import { ToolCursor } from "@/components/organisms/board/ToolCursor";
import { useFx } from "@/lib/fx/useFx";
import { useSound } from "@/lib/fx/sound";
import type { ActionId, ArenaView, NodeId, SchedMode, Tone, ToolId } from "@/lib/types";
import { useFrameLoop } from "@/lib/useFrameLoop";
import { SPEED_STOPS, nudgeSpeed, setSpeed, useSpeed } from "@/lib/speed";
import styles from "./SimulatorPage.module.css";

const BANNER_MS = 7000;
const PARCEL_TOOLS: ToolId[] = ["select", "error", "signal", "query", "update", "cancel"];

export function SimulatorPage({ config }: { config: StepConfig }) {
  const step = config;
  const router = useRouter();
  const [tool, setTool] = useState<ToolId>(step.tools[0]);
  const [selected, setSelected] = useState<string | null>(null);
  const [errorMode, setErrorMode] = useState<"500" | "declined">("500");
  const [bubble, setBubble] = useState<Bubble | null>(null);
  // Replies to parcel clicks: a counter drops a slow earlier reply that arrives after a newer one.
  const sentSeq = useRef(0);
  const shownSeq = useRef(0);
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
  const fxUpdate = useFx();
  const [resetCount, setResetCount] = useState(0);

  let view: ArenaView;
  if (!step.live) view = sim ? sim.view() : emptyLiveView(step, true);
  else if (live.snapshot && live.snapshot.step === step.id) {
    const serverNow = wall + live.offset;
    view = liveView(live.snapshot, step, serverNow, live.connected);
  } else view = emptyLiveView(step, live.connected);

  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });

  const dots = place(view.dots, now, speed);
  // Act 1 swaps the sim object on Reset; live steps count resets.
  // Effects start fresh (nothing fires for state already on screen) after Reset, when
  // Act 1 swaps its sim, and when live data first arrives or comes back after a drop.
  const liveReal = Boolean(live.connected && live.snapshot && live.snapshot.step === step.id);
  const fxResetKey = step.live ? `${resetCount}:${liveReal}` : sim;
  const fx = fxUpdate(view, dots, now, fxResetKey);

  // Sound (muted by default): play what happened, after the frame is committed.
  const sound = useSound();
  useEffect(() => {
    sound.play(fx.takeEvents(), now);
  });

  // Show each banner for a few seconds.
  if (view.banner.seq !== banner.seq && view.banner.text) setBanner({ seq: view.banner.seq, at: now });
  const bannerText = view.banner.text && now - banner.at < BANNER_MS ? view.banner.text : "";

  // Last placed position of each parcel, so a reply can still anchor where a vanished parcel was.
  const [lastPos] = useState(() => new Map<string, { x: number; y: number }>());
  useEffect(() => {
    for (const d of dots) lastPos.set(d.dot.id, { x: d.x, y: d.y });
  });

  let bubbleAt: { x: number; y: number; text: string; tone: Tone } | null = null;
  if (bubble && bubbleVisible(bubble, now)) {
    const p = dots.find((d) => d.dot.id === bubble.orderId) ?? lastPos.get(bubble.orderId);
    if (p) bubbleAt = { x: p.x, y: p.y, text: bubble.text, tone: bubble.tone };
  }

  const hit = (node: NodeId) => {
    fx.tap(node);
    if (node.startsWith("o:")) {
      if (!step.live) return;
      const id = node.slice(2);
      if (tool === "select") {
        setSelected(id);
        return;
      }
      const op = tool === "error" ? "inject" : tool;
      if (op !== "inject" && op !== "signal" && op !== "query" && op !== "update" && op !== "cancel") return;
      const seq = ++sentSeq.current;
      void api.order(id, op, op === "inject" ? errorMode : undefined).then((r) => {
        if (seq < shownSeq.current) return;
        shownSeq.current = seq;
        setBubble({ orderId: id, text: r.text, tone: r.tone, at: nowRef.current });
      });
      return;
    }
    if (!step.live) {
      sim?.hit(node, tool);
      return;
    }
    if (node.startsWith("w:")) {
      const id = Number(node.slice(2));
      if (tool === "hammer") void api.hammerWorker(id);
      else if (tool === "freeze") void api.freeze(id);
      else if (tool === "pause") {
        const o = live.snapshot?.orders.find((x) => x.worker === id && x.status === "running");
        if (o) void api.pause(o.id);
      }
    } else if (node === "hub" && tool === "hammer") void api.hammerTemporal();
  };

  const action = (a: ActionId) => {
    if (a === "reset") {
      setResetCount((n) => n + 1);
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
    else if (a === "payDownLong") void api.payments("downLong");
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

  // Idiom scenes: the code line the selected order is on, and which worker last replayed it.
  const idiom = step.section === "idioms";
  const selOrder = idiom && selected ? live.snapshot?.orders.find((o) => o.id === selected) : undefined;
  const anchor = activeAnchor(selOrder, wall + live.offset, step.id);
  const replayer = selOrder ? view.workers.find((w) => w.id === selOrder.worker && w.replayed) : undefined;

  // Keyboard: ← → steps, tool and action hotkeys, space to freeze (Act 1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) return; // e.g. arrow keys on the speed slider
      const k = e.key.toLowerCase();
      const has = (a: ActionId) => step.actions.includes(a);
      const nav = neighbours(step);
      const pick = (t: ToolId) => step.tools.includes(t) && (setTool(t), true);
      if (e.key === "Escape") {
        if (selected) setSelected(null);
        else router.push("/");
      }
      else if (e.key === "ArrowRight" && nav.next) router.push(nav.next);
      else if (e.key === "ArrowLeft" && nav.prev) router.push(nav.prev);
      else if (step.section === "idioms" && /^[1-8]$/.test(e.key) && IDIOMS[Number(e.key) - 1]) router.push(`/idioms/${e.key}`);
      else if (k === "e" && step.tools.includes("error")) {
        if (tool === "error") setErrorMode((m) => (m === "500" ? "declined" : "500"));
        else setTool("error");
      } else if (k === "v" && pick("select")) {
        /* picked */
      } else if (k === "g" && pick("signal")) {
        /* picked */
      } else if (k === "q" && pick("query")) {
        /* picked */
      } else if (k === "u" && pick("update")) {
        /* picked */
      } else if (k === "x" && pick("cancel")) {
        /* picked */
      } else if (k === "c" && pick("freeze")) {
        /* picked */
      } else if (k === "h" && step.tools.includes("hammer")) setTool("hammer");
      else if (k === "z" && has("payDown")) action("payDown");
      else if (k === "s" && has("paySlow")) action("paySlow");
      else if (k === "l" && has("payDownLong")) action("payDownLong");
      else if (k === "p" && step.tools.includes("pause")) setTool("pause");
      else if (k === "f") {
        if (has("bulk")) action("bulk");
        else if (has("flood")) action("flood");
      } else if (k === "a" && has("hammerAll")) action("hammerAll");
      else if (k === "d" && has("declined")) action("declined");
      else if (k === "k" && idiom && step.code) toggleCodeOpen();
      else if (k === "r") action("reset");
      else if (k === "m") sound.toggle();
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
      accent={stepAccent(step.id)}
      backdrop={<SceneBackdrop variant={step.act === 1 ? "shed" : "depot"} />}
      url={<StepNav config={step} />}
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
          muted={sound.muted}
          onSound={sound.toggle}
          scene={view.scene}
          onSwitch={(s) => void api.scene(s)}
          errorMode={tool === "error" || step.tools.includes("error") ? errorMode : undefined}
        />
      }
      left={<WorkersPanel panels={view.panels} />}
      board={
        <ToolCursor tool={tool}>
          <Board view={view} dots={dots} onHit={hit} onResume={(id) => void api.resume(id)} shake={fx.shake} parcelTool={step.live && PARCEL_TOOLS.includes(tool)} selected={selected} pollArrows={step.id === 107} bubble={bubbleAt} />
          <FxCanvas effects={fx.effects} shake={fx.shake} ambient={step.act === 1 ? "shed" : "depot"} resetKey={fxResetKey} />
        </ToolCursor>
      }
      overlay={
        <>
          {idiom && step.code && <CodeDrawer code={step.code} active={anchor} />}
          {step.live && !view.connected && <ConnectionNotice />}
        </>
      }
      right={idiom && step.code ? <CodePanel rule={step.rule ?? ""} panels={view.panels} /> : <OrdersPanel panels={view.panels} />}
      strip={idiom ? <HistoryStrip orderId={selected} replayedBy={replayer ? workerName(replayer.id) : undefined} replayedAt={replayer ? live.snapshot?.workers.find((w) => w.id === replayer.id)?.replayedAt : undefined} /> : undefined}
      caption={<TryThis text={step.tryThis} />}
      banner={<BannerLine text={bannerText} />}
    />
  );
}

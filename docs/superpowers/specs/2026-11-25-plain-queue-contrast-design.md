# Plain queue contrast: design (short)

Date: 2026-11-25. Status: approved by the presenter in conversation.

## Intent and why

The talk is "Temporal: Beyond Queues". Step 1 (`/1`, plain in-memory queue) is the "before";
steps 2-5 (`/2`-`/5`) are the "after". Today step 1 only shows lost orders (worker crash with
auto-ack, queue crash wipes). Steps 3-5 therefore fix problems the audience never saw break:
Payments failures, priority/fairness, pause. Step 2's "no duplicates" has no baseline, and an
engineer can object "a real queue would redeliver". The presenter flips between `/1` and
`/2`-`/5` by hand, so all the "before" lives in step 1.

## Goals

- Step 1 shows a plain-queue counterpart for each of steps 2-5.
- Pre-empt the "real queues redeliver" objection honestly (trade-off: duplicates).
- Better presenter experience on stage.

## Non-goals / anti-goals

- No plain-queue mode inside steps 2-5; no new routes (no `/1a`).
- Idioms scenes (`/idioms/*`) untouched.
- Act 1 stays an in-browser illustration; nothing in Act 2 becomes simulated.
- Do not touch the untracked `docs/superpowers/*game-ui*` files.
- Do not add dense debug info to the main view (projected on screen).

## Constraints

- Engine lives in `frontend/src/lib/sim/engine.ts`; step config in `frontend/src/lib/steps.ts`;
  toolbox in `frontend/src/components/organisms/index.tsx`. Atomic design, CSS Modules, tokens.
- Behaviour must match real queue semantics (auto-ack loses; ack-after-processing is
  at-least-once and duplicates).
- Checks: `cd frontend && pnpm test && pnpm lint && pnpm build`.

## Approaches considered

1. **Extend step 1 (chosen).** Least work, keeps the two-act, one-URL-per-step flow. Cost: the
   "before" for priority/pause is a flip away from its "after".
2. Separate scenes per problem (`/1a`...). Breaks the step flow.
3. Plain-queue switch inside steps 3-5. Sharpest contrast but more work and blurs the
   simulated/real line; unnecessary since the presenter flips manually.

## Design (build order, one commit each)

1. **Payments faults** in step 1: down, slow, declined (keys as in step 3). With auto-ack a
   failed or declined charge drops the order, no refund/compensation. Counted as Lost, plus a
   Failed counter. Replace the hard-coded `payments: ok` (`engine.ts:266`).
2. **Ack mode toggle**: auto-ack (today) vs ack-after-processing. In the latter a crashed
   worker's order is redelivered (nothing lost) but an already-charged order is charged again.
   Dup counter (hard-wired 0 at `engine.ts:251`) shown in step 1 only when this mode is on.
3. **Priority**: bulk client and flood action; a VIP order waits behind the batch in FIFO
   (counterpart to step 4).
4. **Pause-all**: stops workers, orders stay stranded; no resume in step 1 (counterpart to
   step 5).
5. **Presenter fixes**: numbered `tryThis` beats instead of one long caption; auto-play or a
   visible "press Space" hint so the board is not empty on stage.

New keys follow the existing scheme (see AGENTS.md). Engine tests added in
`frontend/src/lib/sim/` for each behaviour.

## Left to the builder

Exact key bindings, copy for captions/banners, counter styling (red = lost/duplicate),
VIP visual treatment, where the ack toggle sits in the toolbox.

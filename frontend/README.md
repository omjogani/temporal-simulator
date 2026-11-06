# Frontend

Next.js (App Router) UI for the Temporal Chaos Simulator. Routes `/1` – `/6`, one per talk step.

```bash
pnpm install
pnpm dev        # http://localhost:13000/1
```

- `/1`, `/2` run an in-browser illustration of a queue system (`src/lib/sim`).
- `/3` – `/6` are driven by the Go controller over WebSocket (`src/lib/live`), backed by real
  Temporal. Set `NEXT_PUBLIC_CONTROLLER_URL` if the controller is not on `http://localhost:18080`.

## Structure (atomic design)

```
src/components/atoms       Button, Kbd, StatusDot, BigNumber, Tag, UrlPill + SVG atoms (OrderDot, Checkbox, Wire…)
src/components/molecules   ToolButton, SegmentedControl, WorkerRow, ScoreStat, LaneBar, PolicyList, ChecklistRow…
src/components/organisms   Board (+ WorkerCard, HubNode…), WorkersPanel, OrdersPanel, Toolbox, StepRail…
src/components/templates   ArenaTemplate (layout only)
src/components/pages       SimulatorPage (wires data sources into the template)
src/lib                    view model, step configs, board geometry, dot motion, sim engine, live adapter
src/styles/tokens.css      design tokens
```

Both data sources produce the same `ArenaView` (`src/lib/types.ts`), so components never know
whether they are drawing the illustration or real Temporal.

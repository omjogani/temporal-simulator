# Step 1 toolbox tabs: design (short)

Date: 2026-11-25. Approved by the presenter in conversation.

**Why:** step 1 grew to ten action buttons, too many for a projector.

**Design:** section tabs on `/1` only (`StepConfig.sections`): Crashes (Hammer, Flood, Ack after
processing), Payments (down, slow, Declined card, Dead-letter queue, Replay DLQ), Load (Bulk job,
Pause all). Only the active tab's buttons show. Reset, Freeze, sound and play stay visible.

**Calls:** hotkeys work from any tab and switch to their tab; `/1` opens on Crashes; Replay DLQ is
hidden until the DLQ has parked orders; steps 2-5 are unchanged.

**Considered:** a collapsed "More" menu: simpler but hides buttons instead of grouping them.

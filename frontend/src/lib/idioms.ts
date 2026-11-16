import { STEPS, type StepConfig } from "./steps";

const base = {
  section: "idioms",
  act: 2,
  live: true,
  hub: "Temporal Service",
  side: null,
  lanes: false,
  score: ["done", "inflight", "failed"],
} as const satisfies Partial<StepConfig>;

/** The eight idiom scenes (live steps 101–108 in the controller). Code excerpts come from backend/internal/orders (workflow.go, activities.go, worker.go). */
export const IDIOMS: StepConfig[] = [
  {
    ...base,
    id: 101,
    name: "Workflow vs activity",
    rule: "Workflows decide. Activities do.",
    tools: ["select", "hammer"],
    actions: ["flood"],
    tryThis:
      "Select a parcel, then hammer the pet holding it. The activity is retried on another pet, but the workflow logic does not rerun: it resumes from history.",
    code: {
      lines: [
        "for i := 0; i < MainSteps; i++ {",
        "    name := ActivityNames[i]",
        "    var r StepResult",
        "    err := workflow.ExecuteActivity(actx, name, in).Get(actx, &r)",
        "    if err != nil {",
        "        return fail(err)",
        "    }",
        "    p.Done = append(p.Done, r.Worker)",
        "    save()",
        "}",
      ],
      anchors: { reserve: 3, charge: 3, ship: 3, email: 3 },
    },
  },
  {
    ...base,
    id: 102,
    name: "History & replay",
    rule: "Temporal stores events, not state.",
    tools: ["select", "hammer"],
    actions: ["hammerAll"],
    tryThis:
      "Select a parcel and watch its history grow. Hammer all workers, so every in-flight order is rebuilt from history by whichever pet picks it up. A single-worker hammer only replays if that worker held the cache.",
    code: {
      lines: [
        "var r StepResult",
        "err := workflow.ExecuteActivity(actx, name, in).Get(actx, &r)",
        "if err != nil {",
        "    return fail(err)",
        "}",
        "rw.check(ctx)",
        "p.Done = append(p.Done, r.Worker)",
        "save()",
      ],
      anchors: { charge: 1, ship: 1 },
    },
  },
  {
    ...base,
    id: 103,
    name: "Retryable vs not",
    rule: "Failures retry by policy, unless you say they can't.",
    tools: ["select", "error", "hammer"],
    actions: [],
    score: ["done", "inflight", "failed"],
    tryThis:
      "Pick the error tool and click a parcel before it charges. A 500 is retried with backoff; the retry panel shows the attempt and next delay. A declined card is non-retryable: it fails at once and compensation releases the stock.",
    code: {
      lines: [
        "RetryPolicy: &temporal.RetryPolicy{",
        "    InitialInterval:        ms(in.Retry.InitialMs),",
        "    BackoffCoefficient:     in.Retry.Coefficient,",
        "    MaximumInterval:        ms(in.Retry.MaxMs),",
        "    MaximumAttempts:        int32(in.Retry.MaxAttempts),",
        "    NonRetryableErrorTypes: []string{ErrCardDeclined},",
        "},",
      ],
      anchors: { charge: 5, cleanup: 5 },
    },
  },
  {
    ...base,
    id: 104,
    name: "Idempotency",
    rule: "Activities run at least once. Make them idempotent.",
    tools: ["select", "hammer"],
    actions: [],
    switches: ["idemKey"],
    score: ["done", "inflight", "dup"],
    tryThis:
      "Flip the Idempotency key switch, then hammer a pet mid-charge. The activity is retried after the worker dies. Key on: Payments dedups, one coin. Key off: two charges, two red coins.",
    code: {
      lines: [
        "req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.ControllerURL+\"/payments/charge\", bytes.NewReader(body))",
        "...",
        "// The workflow ID makes retries safe: Payments charges each order at most once.",
        "if !in.NoIdempotencyKey {",
        "    req.Header.Set(\"Idempotency-Key\", in.OrderID)",
        "}",
        "resp, err := a.HTTP.Do(req)",
        "if err != nil {",
        "    return fmt.Errorf(\"payments unreachable: %w\", err)",
        "}",
      ],
      anchors: { charge: 4 },
    },
  },
  {
    ...base,
    id: 105,
    name: "Determinism",
    rule: "Workflow code must replay the same way.",
    tools: ["select", "hammer"],
    actions: [],
    switches: ["build"],
    score: ["done", "inflight", "failed"],
    tryThis:
      "Deploy the bad build (time.Now), then hammer a pet. On replay another pet takes the other branch: a real non-determinism error, and the parcel sticks. Deploy the good build (workflow.Now) to unstick it.",
    code: {
      lines: [
        "if Build == \"bad\" {",
        "    late = time.Since(startedAt) > ms(in.LateAfterMs)",
        "} else {",
        "    late = workflow.Now(ctx).Sub(workflow.GetInfo(ctx).WorkflowStartTime) > ms(in.LateAfterMs)",
        "}",
        "if late {",
        "    name = ActivityShipExpress",
        "}",
      ],
      anchors: { late: 1, ship: 6 },
    },
  },
  {
    ...base,
    id: 106,
    name: "Timeouts",
    rule: "Each timeout catches a different failure.",
    tools: ["select", "freeze", "hammer"],
    actions: ["paySlow", "payDownLong"],
    tryThis:
      "Payments slow trips start-to-close. Freeze a pet (docker pause) and its missing heartbeat trips the heartbeat timeout. Payments down 20 s ends in schedule-to-close. The tripped type is read from history.",
    code: {
      lines: [
        "opts := workflow.ActivityOptions{",
        "    StartToCloseTimeout: ms(in.StartToCloseMs),",
        "    HeartbeatTimeout:    ms(in.HeartbeatMs),",
        "    ...",
        "}",
        "if in.ScheduleToCloseMs > 0 {",
        "    opts.ScheduleToCloseTimeout = ms(in.ScheduleToCloseMs)",
        "}",
      ],
      anchors: { charge: 1 },
    },
  },
  {
    ...base,
    id: 107,
    name: "Workers & task queues",
    rule: "Workers poll. Temporal never pushes.",
    tools: ["hammer"],
    actions: ["hammerAll", "flood"],
    score: ["done", "inflight", "lost"],
    tryThis:
      "Watch the pets poll the queue. Hammer all workers and flood orders: with no pollers the backlog grows and nothing is lost. When the pets restart, it drains.",
    code: {
      lines: [
        "w := worker.New(c, TaskQueue, worker.Options{",
        "    Identity:                           identity,",
        "    MaxConcurrentActivityExecutionSize: 1,",
        "    // A killed worker's cached workflows move to the shared queue quickly.",
        "    StickyScheduleToStartTimeout: 2 * time.Second,",
        "})",
        "w.RegisterWorkflowWithOptions(OrderWorkflow, workflow.RegisterOptions{Name: WorkflowName})",
        "w.RegisterActivity(&Activities{ ... })",
        "return w.Run(stopCh())",
      ],
      anchors: {},
    },
  },
  {
    ...base,
    id: 108,
    name: "Talking to a workflow",
    rule: "Signal tells, query asks, update asks and waits.",
    tools: ["select", "signal", "query", "update", "cancel"],
    actions: [],
    tryThis:
      "Select a parcel, then use the tools on it. Signal adds gift wrap, no reply. Query shows real state, history does not grow. Update changes the address, or is rejected once shipped. Cancel stops it and runs cleanup.",
    code: {
      lines: [
        "workflow.SetQueryHandler(ctx, QueryProgress, func() (Progress, error) { return p, nil })",
        "ch := workflow.GetSignalChannel(gctx, SignalGiftWrap)",
        "ch.Receive(gctx, nil)",
        "p.GiftWrap = true",
        "workflow.SetUpdateHandlerWithOptions(ctx, UpdateChangeAddress,",
        "    func(ctx workflow.Context, addr string) (string, error) {",
        "        p.Address = addr",
        "    ...",
        "case temporal.IsCanceledError(err):",
        "    dctx, _ := workflow.NewDisconnectedContext(ctx)",
        "    _ = workflow.ExecuteActivity(dctx, ActivityNames[CompensationStep], in).Get(dctx, nil)",
      ],
      anchors: { query: 0, signal: 1, update: 4, cleanup: 8 },
    },
  },
];

/** The "Idioms" cartridge on the menu; it opens scene 1 of the section. */
export const IDIOMS_CARD: StepConfig = {
  ...base,
  id: 100,
  name: "Idioms",
  tools: [],
  actions: [],
  tryThis: "Eight short scenes on how Temporal thinks: workflows vs activities, replay, retries, idempotency, determinism, timeouts, task queues, and signals, queries and updates.",
};

export const getScene = (id: number): StepConfig | undefined => IDIOMS.find((s) => s.id === id);

export const routeFor = (cfg: StepConfig): string => (cfg.section === "idioms" ? `/idioms/${cfg.id - 100}` : `/${cfg.id}`);

/** Routes of the previous and next page inside the config's own section. */
export function neighbours(cfg: StepConfig): { prev?: string; next?: string } {
  const list = cfg.section === "idioms" ? IDIOMS : STEPS;
  const i = list.findIndex((s) => s.id === cfg.id);
  return {
    prev: i > 0 ? routeFor(list[i - 1]) : undefined,
    next: i >= 0 && i < list.length - 1 ? routeFor(list[i + 1]) : undefined,
  };
}

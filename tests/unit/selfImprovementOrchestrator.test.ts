import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════════
// Characterization test: the auto-approve firewall in runContinuousImprovement().
//
// Pins the governance invariant that the orchestrator is responsible for:
//   A clinical or performance (non-operational) proposal must ALWAYS land in
//   `skipped` and must NEVER be applied via the "auto-approved" path.
//
// The companion `pending_review` STATUS invariant (set by evaluateAndImprove)
// is already covered in selfImproveGovernance.test.ts. This file covers the
// other half: the orchestrator's `applied` / `skipped` gating, and that the
// only category reaching applyImprovementAction(..., "auto-approved") is
// operational.
//
// We keep the REAL AUTO_APPROVE_PERMITTED firewall (the thing under test) and
// stub only the surrounding I/O — evaluateAndImprove, applyImprovementAction,
// and countAppliedInWindow.
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock("../../server/db", () => ({
  db: {
    // advisory lock / unlock
    execute: vi.fn().mockResolvedValue(undefined),
    // cycle-log write in the finally block: db.insert(...).values(...).catch(...)
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

vi.mock("../../server/audit/auditLogger", () => ({
  auditStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/agents/eventBus", () => ({ publish: vi.fn() }));

// Partial mock: keep the real AUTO_APPROVE_PERMITTED firewall (and any other
// real exports), stub only the I/O functions the orchestrator calls.
vi.mock("../../server/agents/selfImprove", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/agents/selfImprove")>();
  return {
    ...actual,
    evaluateAndImprove:     vi.fn(),
    applyImprovementAction: vi.fn(),
    countAppliedInWindow:   vi.fn(),
  };
});

// Lazy imports so the mocks are installed first.
const { runContinuousImprovement } = await import(
  "../../server/agents/selfImprovementOrchestrator"
);
const { evaluateAndImprove, applyImprovementAction, countAppliedInWindow } =
  await import("../../server/agents/selfImprove");

// Minimal GovernedAction-shaped fixtures — only the fields the orchestrator reads.
// `autoApprove` is set to the value evaluateAndImprove would derive in production
// (false for clinical/performance, true for operational).
const clinicalAction = {
  id: 101, agent: "triage_ai", parameter: "riskThreshold", toValue: 0.55,
  category: "clinical", autoApprove: false,
} as any;

const performanceAction = {
  id: 102, agent: "triage_ai", parameter: "conservatism", toValue: 0.1,
  category: "performance", autoApprove: false,
} as any;

const operationalAction = {
  id: 103, agent: "email_agent", parameter: "retryLimit", toValue: 3,
  category: "operational", autoApprove: true,
} as any;

describe("runContinuousImprovement — auto-approve firewall", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never auto-applies clinical or performance proposals; only operational reaches applyImprovementAction", async () => {
    vi.mocked(countAppliedInWindow).mockResolvedValue(0); // full rate-limit budget
    vi.mocked(evaluateAndImprove).mockResolvedValue([
      clinicalAction,
      performanceAction,
      operationalAction,
    ]);
    vi.mocked(applyImprovementAction).mockResolvedValue({ applied: true, reason: "ok" });

    const result = await runContinuousImprovement();

    // ── Clinical & performance: skipped, never applied ─────────────────────
    const skippedIds = result.skipped.map((s) => s.id);
    const appliedIds = result.applied.map((a) => a.id);

    expect(skippedIds).toContain("101"); // clinical
    expect(skippedIds).toContain("102"); // performance
    expect(appliedIds).not.toContain("101");
    expect(appliedIds).not.toContain("102");

    // ── Operational: the ONLY category that auto-applies ───────────────────
    expect(appliedIds).toContain("103");

    // ── The apply path is invoked exactly once, only for the operational id,
    //    and always with the "auto-approved" actor ─────────────────────────
    expect(applyImprovementAction).toHaveBeenCalledTimes(1);
    expect(applyImprovementAction).toHaveBeenCalledWith(103, "auto-approved");
    expect(applyImprovementAction).not.toHaveBeenCalledWith(101, expect.anything());
    expect(applyImprovementAction).not.toHaveBeenCalledWith(102, expect.anything());
  });
});

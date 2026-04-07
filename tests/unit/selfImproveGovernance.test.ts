import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Pure-function imports (no DB) ────────────────────────────────────────────
import { validateAgentStat, computeBusinessMetrics, ACTION_STATUSES } from "../../server/agents/selfImprove";

// ── DB-dependent imports — mock the DB before importing ──────────────────────
vi.mock("../../server/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("../../server/agents/tracking", () => ({
  getAgentStats: vi.fn(),
}));

vi.mock("../../server/agents/eventBus", () => ({
  publish: vi.fn(),
}));

vi.mock("../../server/audit/auditLogger", () => ({
  auditStep: vi.fn().mockResolvedValue(undefined),
}));

// ── Lazy import so mocks are set up first ─────────────────────────────────────
const { hasOpenProposal, evaluateAndImprove, applyImprovementAction } = await import(
  "../../server/agents/selfImprove"
);
const { db } = await import("../../server/db");
const { getAgentStats } = await import("../../server/agents/tracking");

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeSelectChain(result: unknown[]) {
  const chain: any = {
    from:  () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result),
    orderBy: () => chain,
  };
  return chain;
}

function makeInsertChain(returning: unknown[]) {
  const chain: any = {
    values:   () => chain,
    returning: () => Promise.resolve(returning),
    onConflictDoUpdate: () => chain,
  };
  return chain;
}

function makeUpdateChain() {
  const chain: any = {
    set:   () => chain,
    where: () => Promise.resolve([]),
  };
  return chain;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. validateAgentStat — pure, no DB
// ═══════════════════════════════════════════════════════════════════════════════
describe("validateAgentStat", () => {
  it("accepts valid inputs", () => {
    expect(() => validateAgentStat({ runs: 10, successRate: 75 })).not.toThrow();
    expect(() => validateAgentStat({ runs: 1, successRate: 0 })).not.toThrow();
    expect(() => validateAgentStat({ runs: 1000, successRate: 100 })).not.toThrow();
  });

  it("rejects runs < 1", () => {
    expect(() => validateAgentStat({ runs: 0, successRate: 80 })).toThrow(/Invalid runs/);
  });

  it("rejects non-finite runs", () => {
    expect(() => validateAgentStat({ runs: NaN, successRate: 50 })).toThrow(/Invalid runs/);
    expect(() => validateAgentStat({ runs: Infinity, successRate: 50 })).toThrow(/Invalid runs/);
  });

  it("rejects successRate below 0", () => {
    expect(() => validateAgentStat({ runs: 5, successRate: -1 })).toThrow(/Invalid successRate/);
  });

  it("rejects successRate above 100", () => {
    expect(() => validateAgentStat({ runs: 5, successRate: 101 })).toThrow(/Invalid successRate/);
  });

  it("rejects non-finite successRate", () => {
    expect(() => validateAgentStat({ runs: 5, successRate: NaN })).toThrow(/Invalid successRate/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. computeBusinessMetrics — pure, no DB
// ═══════════════════════════════════════════════════════════════════════════════
describe("computeBusinessMetrics", () => {
  it("sums only paid claims for revenue", () => {
    const result = computeBusinessMetrics([
      { revenue: 100, paid: true },
      { revenue: 200, paid: false },
      { revenue: 300, paid: true },
    ]);
    expect(result.revenue).toBe(400);
  });

  it("returns zero margin when all claims unpaid", () => {
    const result = computeBusinessMetrics([{ revenue: 500, paid: false }]);
    expect(result.revenue).toBe(0);
    expect(result.margin).toBe(0);
  });

  it("recommends cost-reduction strategy at margin < 0.5", () => {
    // cost = 1 * 0.02 = 0.02, revenue = 0.03 → margin = (0.03-0.02)/0.03 ≈ 0.33 < 0.5
    const result = computeBusinessMetrics([{ revenue: 0.03, paid: true }]);
    expect(result.margin).toBeLessThan(0.5);
    expect(result.strategy).toMatch(/Reduce compute cost/);
  });

  it("recommends scale strategy when margin > 0.7 and revenue > 50000", () => {
    const claims = Array.from({ length: 1000 }, () => ({ revenue: 100, paid: true }));
    const result = computeBusinessMetrics(claims);
    expect(result.strategy).toMatch(/Scale marketing/);
  });

  it("recommends coding accuracy strategy at mid-range margin", () => {
    // Need margin 0.5–0.7 and revenue <= 50000
    // 600 claims × $100 = $60000 revenue, cost = 600×0.02 = $12 → margin ≈ 1
    // To hit 0.5–0.7: need high cost. With 1 claim at $1 paid → margin ~0.98. Use 2 claims at $1 where one paid.
    // Actually computeBusinessMetrics cost = count × 0.02. Very hard to hit 0.5-0.7 with real data.
    // Let's use a case with revenue=100, cost=40 → margin=0.6.
    // That would need 2000 claims. Let's try 500 paid $100 + 0 unpaid → revenue=50000, cost=500×0.02=10 → margin≈1
    // The function calculates cost as claimData.length * 0.02. So:
    // For margin ≈ 0.6: revenue - cost = 0.6 * revenue → cost = 0.4 * revenue
    // cost = n * 0.02, revenue = paid_count * pay_amount
    // Let's just use a mock-like call with 1 claim, revenue 0.05, paid=true
    // revenue=0.05, cost=0.02, profit=0.03, margin=(0.05-0.02)/0.05=0.6 ✓
    const result = computeBusinessMetrics([{ revenue: 0.05, paid: true }]);
    expect(result.margin).toBeCloseTo(0.6, 1);
    expect(result.strategy).toMatch(/coding accuracy/);
  });

  it("computes profit correctly", () => {
    const result = computeBusinessMetrics([
      { revenue: 100, paid: true },
      { revenue: 100, paid: true },
    ]);
    // revenue=200, cost=2*0.02=0.04, profit=199.96
    expect(result.profit).toBeCloseTo(199.96, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. hasOpenProposal — DB-mocked
// ═══════════════════════════════════════════════════════════════════════════════
describe("hasOpenProposal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when an open proposal exists", async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([{ id: 42 }]) as any);
    expect(await hasOpenProposal("billing_agent", "conservatism")).toBe(true);
  });

  it("returns false when no open proposal exists", async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as any);
    expect(await hasOpenProposal("billing_agent", "conservatism")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. evaluateAndImprove — DB-mocked
// ═══════════════════════════════════════════════════════════════════════════════
describe("evaluateAndImprove", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips agents with fewer than 5 runs", async () => {
    vi.mocked(getAgentStats).mockReturnValue({
      bayesian_agent: { runs: 3, successRate: 10, successes: 0, failures: 3, avgMs: 100 },
    } as any);
    const actions = await evaluateAndImprove();
    expect(actions).toHaveLength(0);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips agents with successRate exactly at 60% (only triggers below 60)", async () => {
    vi.mocked(getAgentStats).mockReturnValue({
      billing_agent: { runs: 10, successRate: 60, successes: 6, failures: 4, avgMs: 100 },
    } as any);
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as any);
    const actions = await evaluateAndImprove();
    expect(actions).toHaveLength(0);
  });

  it("proposes threshold_adjustment for successRate < 60", async () => {
    vi.mocked(getAgentStats).mockReturnValue({
      billing_agent: { runs: 10, successRate: 55, successes: 5, failures: 5, avgMs: 100 },
    } as any);

    const mockRow = { id: 1, agent: "billing_agent", action: "threshold_adjustment",
      parameter: "conservatism", fromValue: 0, toValue: 0.1, reason: "rate 55%",
      status: "proposed", proposedAt: new Date(), decidedAt: null, decidedBy: null, metric: null, errorMessage: null };

    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as any);
    vi.mocked(db.insert).mockReturnValue(makeInsertChain([mockRow]) as any);

    const actions = await evaluateAndImprove();
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("threshold_adjustment");
    expect(actions[0].status).toBe("proposed");
  });

  it("proposes pending_review escalation for successRate < 40", async () => {
    vi.mocked(getAgentStats).mockReturnValue({
      triage_agent: { runs: 20, successRate: 35, successes: 7, failures: 13, avgMs: 200 },
    } as any);

    const conservatismRow = { id: 1, agent: "triage_agent", action: "threshold_adjustment",
      parameter: "conservatism", fromValue: 0, toValue: 0.1, reason: "rate 35%",
      status: "proposed", proposedAt: new Date(), decidedAt: null, decidedBy: null, metric: null, errorMessage: null };
    const escalationRow = { ...conservatismRow, id: 2, action: "escalation_recommended",
      parameter: "escalation", status: "pending_review" };

    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as any);
    vi.mocked(db.insert)
      .mockReturnValueOnce(makeInsertChain([conservatismRow]) as any)
      .mockReturnValueOnce(makeInsertChain([escalationRow]) as any);

    const actions = await evaluateAndImprove();
    const statuses = actions.map(a => a.status);
    expect(statuses).toContain("pending_review");
    const escalation = actions.find(a => a.action === "escalation_recommended");
    expect(escalation).toBeDefined();
  });

  it("suppresses duplicate proposals when open proposal exists", async () => {
    vi.mocked(getAgentStats).mockReturnValue({
      billing_agent: { runs: 10, successRate: 55, successes: 5, failures: 5, avgMs: 100 },
    } as any);
    // hasOpenProposal returns true — row already exists
    vi.mocked(db.select).mockReturnValue(makeSelectChain([{ id: 99 }]) as any);

    const actions = await evaluateAndImprove();
    expect(actions).toHaveLength(0);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects agents with invalid successRate via validateAgentStat", async () => {
    vi.mocked(getAgentStats).mockReturnValue({
      bad_agent: { runs: 10, successRate: NaN, successes: 0, failures: 10, avgMs: 100 },
    } as any);
    const actions = await evaluateAndImprove();
    expect(actions).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. applyImprovementAction — DB-mocked
// ═══════════════════════════════════════════════════════════════════════════════
describe("applyImprovementAction", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockTx(selectResults: unknown[], updateResult: unknown[] = []) {
    const tx: any = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue(makeSelectChain(selectResults)),
      update: vi.fn().mockReturnValue(makeUpdateChain()),
      insert: vi.fn().mockReturnValue(makeInsertChain([])),
    };
    vi.mocked(db.transaction).mockImplementation(async (fn: any) => fn(tx));
    return tx;
  }

  it("returns 'already applied' idempotency guard", async () => {
    const action = { id: 5, status: "applied", agent: "a", parameter: "p",
      fromValue: 0, toValue: 0.1, action: "threshold_adjustment" };
    mockTx([action]);

    const result = await applyImprovementAction(5, "physician-1");
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("already applied");
  });

  it("returns error for non-applicable status (rejected)", async () => {
    const action = { id: 6, status: "rejected", agent: "a", parameter: "p",
      fromValue: 0, toValue: 0.1, action: "threshold_adjustment" };
    mockTx([action]);

    const result = await applyImprovementAction(6, "physician-1");
    expect(result.applied).toBe(false);
    expect(result.reason).toMatch(/rejected/);
  });

  it("returns not found when action does not exist", async () => {
    mockTx([]);
    const result = await applyImprovementAction(999, "physician-1");
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("action not found");
  });

  it("CAS mismatch returns stale proposal error", async () => {
    const action = { id: 7, status: "proposed", agent: "triage", parameter: "conservatism",
      fromValue: 0.2, toValue: 0.3, action: "threshold_adjustment" };
    const tx = mockTx([action]);

    // Second select (for current threshold) returns different value
    tx.select
      .mockReturnValueOnce(makeSelectChain([action]))        // action lookup
      .mockReturnValueOnce(makeSelectChain([{ currentValue: 0.5 }])); // CAS check

    const result = await applyImprovementAction(7, "physician-1");
    expect(result.applied).toBe(false);
    expect(result.reason).toMatch(/compare-and-swap|stale/i);
  });

  it("applies successfully when CAS matches and marks action as applied", async () => {
    const action = { id: 8, status: "proposed", agent: "triage", parameter: "conservatism",
      fromValue: 0.2, toValue: 0.3, action: "threshold_adjustment" };
    const tx = mockTx([action]);

    tx.select
      .mockReturnValueOnce(makeSelectChain([action]))              // action lookup
      .mockReturnValueOnce(makeSelectChain([{ currentValue: 0.2 }])); // CAS matches

    const result = await applyImprovementAction(8, "physician-1");
    expect(result.applied).toBe(true);
    expect(result.reason).toBe("ok");
    expect(tx.update).toHaveBeenCalled();
  });

  it("applies action with null from/to values (no CAS check needed)", async () => {
    const action = { id: 9, status: "proposed", agent: "triage", parameter: "latency_alert",
      fromValue: null, toValue: null, action: "performance_warning" };
    const tx = mockTx([action]);
    tx.select.mockReturnValueOnce(makeSelectChain([action])); // action lookup only

    const result = await applyImprovementAction(9, "physician-1");
    expect(result.applied).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Lifecycle constants
// ═══════════════════════════════════════════════════════════════════════════════
describe("ACTION_STATUSES", () => {
  it("contains all required lifecycle states", () => {
    expect(ACTION_STATUSES).toContain("proposed");
    expect(ACTION_STATUSES).toContain("pending_review");
    expect(ACTION_STATUSES).toContain("approved");
    expect(ACTION_STATUSES).toContain("applied");
    expect(ACTION_STATUSES).toContain("rejected");
    expect(ACTION_STATUSES).toContain("failed");
  });
});

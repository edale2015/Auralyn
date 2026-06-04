import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════════
// Regression test: approveAndApplyAction must not open a nested db.transaction.
//
// THE BUG (original audit, top-priority item):
//   approveAndApplyAction() opens db.transaction (connection A) and acquires
//   pg_advisory_xact_lock(N) on A, then calls applyImprovementAction(), which
//   opens ANOTHER db.transaction (connection B from the pool) and tries to
//   acquire the SAME pg_advisory_xact_lock(N). B blocks waiting for the lock
//   held by A; A cannot commit until applyImprovementAction() returns. Deadlock.
//   pg_advisory_xact_lock is re-entrant within ONE session, but the nested
//   db.transaction runs on a DIFFERENT pooled connection (a different session).
//
// This test models that faithfully: a nested db.transaction (one opened while
// another is still active) represents the second pooled connection blocking on
// the advisory lock, which we surface as a deterministic DEADLOCK error.
//
// The fix makes the apply logic run on the SAME transaction the approval opened,
// so only one db.transaction is ever active. After the fix this test passes.
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock("../../server/db", () => ({
  db: {
    select:      vi.fn(),
    insert:      vi.fn(),
    update:      vi.fn(),
    transaction: vi.fn(),
    execute:     vi.fn(),
  },
}));

vi.mock("../../server/agents/tracking", () => ({ getAgentStats: vi.fn() }));
vi.mock("../../server/agents/eventBus", () => ({ publish: vi.fn() }));
vi.mock("../../server/audit/auditLogger", () => ({
  auditStep: vi.fn().mockResolvedValue(undefined),
}));

const { approveAndApplyAction } = await import("../../server/agents/selfImprove");
const { db } = await import("../../server/db");

// ── Drizzle chain stubs (same shape as selfImproveGovernance.test.ts) ─────────
function makeSelectChain(result: unknown[]) {
  const chain: any = {
    from:    () => chain,
    where:   () => chain,
    orderBy: () => chain,
    limit:   () => Promise.resolve(result),
  };
  return chain;
}
function makeInsertChain(returning: unknown[]) {
  const chain: any = {
    values:             () => chain,
    returning:          () => Promise.resolve(returning),
    onConflictDoUpdate: () => chain,
  };
  return chain;
}
function makeUpdateChain() {
  const chain: any = { set: () => chain, where: () => Promise.resolve([]) };
  return chain;
}

// Action row in the state it would hold after approval: status "approved",
// conservatism 0.2 → 0.3 (both within THRESHOLD_BOUNDS), CAS value matches.
const actionRow = {
  id: 50, status: "approved", agent: "triage", parameter: "conservatism",
  fromValue: 0.2, toValue: 0.3, action: "threshold_adjustment",
};

function makeTx() {
  const tx: any = {
    execute: vi.fn().mockResolvedValue(undefined),
    select:  vi.fn(),
    update:  vi.fn().mockReturnValue(makeUpdateChain()),
    insert:  vi.fn().mockReturnValue(makeInsertChain([])),
  };
  tx.select
    .mockReturnValueOnce(makeSelectChain([{ status: "pending_review" }])) // approve: status re-read under lock
    .mockReturnValueOnce(makeSelectChain([actionRow]))                    // apply: action lookup
    .mockReturnValueOnce(makeSelectChain([{ currentValue: 0.2 }]));       // apply: CAS read (matches fromValue)
  return tx;
}

describe("approveAndApplyAction — no nested-transaction deadlock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies on the approval's own transaction without opening a second one", async () => {
    // Model the connection pool + advisory lock: a db.transaction opened while
    // another is still active is a second pooled connection that would block on
    // the advisory lock the outer transaction holds → deadlock.
    let active = 0;
    vi.mocked(db.transaction).mockImplementation(async (fn: any) => {
      if (active > 0) {
        throw new Error(
          "DEADLOCK: nested db.transaction acquired a separate pooled connection " +
          "and blocked on pg_advisory_xact_lock already held by the outer transaction"
        );
      }
      active++;
      try {
        return await fn(makeTx());
      } finally {
        active--;
      }
    });

    const result = await approveAndApplyAction(50, "physician-1", "looks good");

    // The physician-approval gate completes end-to-end...
    expect(result.applied).toBe(true);
    expect(result.reason).toBe("ok");
    // ...and exactly ONE transaction was opened (apply ran on the same tx).
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  // BACKLOG: this suite proves the fix against a mocked db.transaction. It does
  // NOT exercise two real pooled Postgres connections contending on the same
  // pg_advisory_xact_lock. Add an integration test (real DATABASE_URL, two live
  // connections) that asserts approveAndApplyAction does not deadlock, to be
  // written when a live DB is available in CI. Tracked, not blocking.
  it.todo("real-Postgres two-connection advisory-lock contention (needs live DB)");
});

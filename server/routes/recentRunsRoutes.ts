import { Router } from "express";

const router = Router();

export interface RunRecord {
  id:          string;
  kind:        string;
  status:      "success" | "failed" | "running" | "pending";
  startedAt?:  string;
  durationMs?: number;
  summary?:    string;
  details?:    Record<string, any>;
}

const runHistory: RunRecord[] = [];

export function recordRun(run: Omit<RunRecord, "id">): RunRecord {
  const rec: RunRecord = { id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, ...run };
  runHistory.unshift(rec);
  if (runHistory.length > 100) runHistory.pop();
  return rec;
}

// Seed with some representative run history
(function seed() {
  const kinds = ["stress_test", "golden_suite", "learning_cycle", "evolution_cycle", "global_sync", "replay"];
  const statuses: RunRecord["status"][] = ["success", "success", "success", "failed", "success"];
  for (let i = 0; i < 10; i++) {
    const durationMs = 300 + Math.floor(Math.random() * 4700);
    const kind = kinds[i % kinds.length];
    runHistory.push({
      id:          `run-seed-${i}`,
      kind,
      status:      statuses[i % statuses.length],
      startedAt:   new Date(Date.now() - (10 - i) * 60_000 * 5).toISOString(),
      durationMs,
      summary:     kind === "golden_suite"
        ? `12/14 cases passed (85.7% pass rate)`
        : kind === "stress_test"
          ? `50 requests @ 5 concurrency — avg 218ms`
          : kind === "learning_cycle"
            ? `RLHF cycle — 8 outcomes processed`
            : kind === "evolution_cycle"
              ? `Proposed: scoring_agent threshold adjustment`
              : kind === "global_sync"
                ? `5 federated clinics synchronized`
                : `18 events replayed`,
    });
  }
})();

// GET /api/automation/runs
router.get("/runs", (req, res) => {
  const limit  = Number(req.query.limit) || 20;
  const kind   = req.query.kind as string | undefined;
  const filtered = kind ? runHistory.filter(r => r.kind === kind) : runHistory;
  res.json({ ok: true, runs: filtered.slice(0, limit), total: filtered.length });
});

export default router;

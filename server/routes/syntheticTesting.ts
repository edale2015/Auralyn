import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { generateSyntheticCases, listAvailableComplaints } from "../services/testing/syntheticCaseGenerator";
import { runEngineOnCases } from "../services/testing/engineMassRunner";
import { storeTestRun, listTestRuns, getTestRun, getRunStats } from "../services/testing/engineResultStore";
import { generateEdgeCases } from "../services/testing/edgeCaseExplorer";

export const syntheticTestingRouter = Router();

syntheticTestingRouter.get("/complaints", requireRole(["admin", "physician"]), async (_req, res) => {
  try {
    const complaints = listAvailableComplaints();
    res.json({ complaints });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

syntheticTestingRouter.get("/runs", requireRole(["admin", "physician"]), async (_req, res) => {
  try {
    const runs = await listTestRuns();
    res.json({ runs });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

syntheticTestingRouter.get("/runs/:runId", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const run = await getTestRun(req.params.runId);
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }
    res.json(run);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

syntheticTestingRouter.get("/runs/:runId/stats", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const stats = await getRunStats(req.params.runId);
    if (!stats) { res.status(404).json({ error: "Run not found" }); return; }
    res.json(stats);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

syntheticTestingRouter.get("/runs/:runId/mismatches", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const run = await getTestRun(req.params.runId);
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }

    const filter = req.query.type as string | undefined;

    const mismatches = run.results.filter(r => {
      if (r.error) return false;
      if (!r.expectedDisposition || !r.disposition) return false;
      return r.disposition !== r.expectedDisposition;
    }).map(r => {
      const SEVERITY: Record<string, number> = {
        SELF_CARE: 1, HOME_CARE: 1, TELEHEALTH: 2, ROUTINE: 3,
        URGENT_CARE: 4, URGENT: 4, EMERGENT: 5, ER: 5, ER_SEND: 5, EMERGENT_ESCALATION: 6,
      };
      const engineSev = SEVERITY[r.disposition?.toUpperCase() || ""] ?? 3;
      const expectedSev = SEVERITY[r.expectedDisposition?.toUpperCase() || ""] ?? 3;
      const type = engineSev < expectedSev ? "under_triage" : engineSev > expectedSev ? "over_triage" : "label_mismatch";
      return { ...r, mismatchType: type, severityGap: expectedSev - engineSev };
    });

    const filtered = filter ? mismatches.filter(m => m.mismatchType === filter) : mismatches;
    filtered.sort((a, b) => Math.abs(b.severityGap) - Math.abs(a.severityGap));

    res.json({
      total: mismatches.length,
      underTriage: mismatches.filter(m => m.mismatchType === "under_triage").length,
      overTriage: mismatches.filter(m => m.mismatchType === "over_triage").length,
      labelMismatch: mismatches.filter(m => m.mismatchType === "label_mismatch").length,
      mismatches: filtered,
    });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

syntheticTestingRouter.post("/generate", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { complaintId, count } = req.body;
    if (!complaintId) { res.status(400).json({ error: "complaintId required" }); return; }
    const caseCount = Math.min(Math.max(Number(count) || 100, 1), 10000);
    console.log(`[SyntheticTesting] Generating ${caseCount} cases for ${complaintId}...`);
    const cases = generateSyntheticCases(complaintId, caseCount);
    console.log(`[SyntheticTesting] Running engine on ${cases.length} cases...`);
    const results = await runEngineOnCases(cases);
    console.log(`[SyntheticTesting] Storing run results...`);
    const run = await storeTestRun(complaintId, results);
    console.log(`[SyntheticTesting] Run ${run.runId} complete: ${run.totalCases} cases, accuracy=${(run.stats.accuracy * 100).toFixed(1)}%`);
    res.json({
      runId: run.runId,
      complaintId: run.complaintId,
      totalCases: run.totalCases,
      stats: run.stats,
      timestamp: run.timestamp,
    });
  } catch (err: any) {
    console.error("[SyntheticTesting] Generation failed:", err);
    res.status(500).json({ error: err?.message ?? "Failed" });
  }
});

syntheticTestingRouter.get("/edge-cases/:complaintId", requireRole(["admin"]), async (req, res) => {
  res.json({ edgeCases: generateEdgeCases(req.params.complaintId) });
});

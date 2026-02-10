import type { Router, Request, Response } from "express";
import { getTraceStore } from "../traces/traceStore";
import { requireProviderAuth } from "../auth";

export function registerTraceRoutes(router: Router) {
  router.get("/api/traces", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const filter: any = {};
      if (req.query.scenarioId) filter.scenarioId = String(req.query.scenarioId);
      if (req.query.chiefComplaint) filter.chiefComplaint = String(req.query.chiefComplaint);
      if (req.query.isTest !== undefined) filter.isTest = req.query.isTest === "true";
      if (req.query.limit) filter.limit = Math.min(Number(req.query.limit) || 50, 100);

      const traces = await getTraceStore().list(filter);

      const summaries = traces.map(t => ({
        runId: t.runId,
        caseId: t.caseId,
        scenarioId: t.scenarioId,
        chiefComplaint: t.chiefComplaint,
        isTest: t.isTest,
        disposition: t.normalized.disposition,
        redFlags: t.normalized.redFlags,
        scores: t.normalized.scores,
        stopReason: t.stopReason,
        stepCount: t.steps.length,
        eventCount: t.events.length,
        normalizedHash: t.normalizedHash,
        createdAt: t.createdAt,
      }));

      res.json({ ok: true, traces: summaries, count: summaries.length });
    } catch (err: any) {
      console.error("[Traces] List error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/traces/:runId", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const trace = await getTraceStore().getByRunId(req.params.runId);
      if (!trace) {
        return res.status(404).json({ ok: false, error: "Trace not found" });
      }
      res.json({ ok: true, trace });
    } catch (err: any) {
      console.error("[Traces] Get error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}

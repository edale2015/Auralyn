import type { Router, Request, Response } from "express";
import { getTraceStore } from "../traces/traceStore";
import { compareTraces } from "../traces/traceCompare";
import { getLlmCallLog } from "../traces/llmCallLog";
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

  router.get("/api/traces/compare/:baseRunId/:candRunId", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const { baseRunId, candRunId } = req.params;
      const [baseline, candidate] = await Promise.all([
        getTraceStore().getByRunId(baseRunId),
        getTraceStore().getByRunId(candRunId),
      ]);

      if (!baseline) return res.status(404).json({ ok: false, error: `Baseline trace not found: ${baseRunId}` });
      if (!candidate) return res.status(404).json({ ok: false, error: `Candidate trace not found: ${candRunId}` });

      const result = compareTraces(baseline, candidate);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Traces] Compare error:", err);
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

  router.get("/api/llm-logs", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const runId = req.query.runId ? String(req.query.runId) : undefined;
      const caseId = req.query.caseId ? String(req.query.caseId) : undefined;

      let logs;
      if (runId) {
        logs = await getLlmCallLog().getByRunId(runId, limit);
      } else if (caseId) {
        logs = await getLlmCallLog().getByCaseId(caseId, limit);
      } else {
        logs = await getLlmCallLog().getRecent(limit);
      }

      res.json({ ok: true, logs, count: logs.length });
    } catch (err: any) {
      console.error("[LlmLogs] List error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}

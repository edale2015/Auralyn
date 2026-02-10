import type { Router, Request, Response } from "express";
import { requireProviderAuth } from "../auth";
import { getTraceStore } from "../traces/traceStore";
import { computeConversationMetrics } from "../analytics/conversationMetrics";
import { detectFrictionInConversation, type FrictionSignal } from "../analytics/frictionDetector";
import { getCircuitStatus, getRunBudgetStatus, getGuardrailConfig } from "../agent/llm/llmGuardrails";
import { computeSlaStatus } from "../analytics/slaAlerts";

export function registerAnalyticsRoutes(router: Router) {
  router.get("/api/analytics/conversation-metrics", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const from = req.query.from ? String(req.query.from) : defaultFrom;
      const to = req.query.to ? String(req.query.to) : now.toISOString();

      const traces = await getTraceStore().list({ limit: 100 });
      const metrics = computeConversationMetrics(traces, from, to);

      res.json({ ok: true, metrics });
    } catch (err: any) {
      console.error("[Analytics] Metrics error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/analytics/friction/:runId", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const trace = await getTraceStore().getByRunId(req.params.runId);
      if (!trace) {
        return res.status(404).json({ ok: false, error: "Trace not found" });
      }

      const messages: Array<{ text: string; stepNo?: number; from: "patient" | "system" }> = [];

      for (const step of trace.steps) {
        const action = step.action as any;
        const outputs = step.outputs as Record<string, unknown>;

        if (action.type === "ASK_QUESTION" || action.type === "REFRAME_QUESTION") {
          const prompt = String(outputs?.reframedText ?? outputs?.prompt ?? action.originalPrompt ?? action.questionId ?? "");
          if (prompt) {
            messages.push({ text: prompt, stepNo: step.step, from: "system" });
          }
        }

        if (outputs?.summary && typeof outputs.summary === "string") {
          messages.push({ text: outputs.summary, stepNo: step.step, from: "system" });
        }
      }

      for (const evt of trace.events) {
        if (evt.message && typeof evt.message === "string") {
          if (evt.type === "PATIENT_RESPONSE" || evt.type === "PATIENT_MESSAGE") {
            messages.push({ text: evt.message, from: "patient" });
          }
        }
      }

      const frictionSignals = detectFrictionInConversation(messages);

      res.json({
        ok: true,
        runId: trace.runId,
        frictionSignals,
        frictionCount: frictionSignals.length,
        hasFriction: frictionSignals.length > 0,
      });
    } catch (err: any) {
      console.error("[Analytics] Friction error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/analytics/llm-guardrails", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const circuit = getCircuitStatus();
      const config = getGuardrailConfig();

      res.json({
        ok: true,
        circuit,
        config,
      });
    } catch (err: any) {
      console.error("[Analytics] Guardrails error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/analytics/llm-guardrails/:runId", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const budget = getRunBudgetStatus(req.params.runId);
      res.json({ ok: true, runId: req.params.runId, budget });
    } catch (err: any) {
      console.error("[Analytics] Run budget error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/analytics/sla-status", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const status = await computeSlaStatus();
      res.json({ ok: true, ...status });
    } catch (err: any) {
      console.error("[Analytics] SLA status error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}

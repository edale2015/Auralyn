import { Router, Request, Response } from "express";

import { edgesToGraph, graphToExecutionOrder } from "./workflows/graphUtils";
import { addRule, getAlertRules, clearRules, removeRule, evalRules } from "./monitoring/alertRules";
import { minimizeQuestions, debugFailure, trend, captureTrace, runGoldenBatch } from "./clinical/qaUtils";
import { sendTelegramAlert, broadcastMultiChannel } from "./monitoring/alerts";
import { runFinalPipeline } from "./clinical/finalPipeline";

const router = Router();

// ── Graph Utils ───────────────────────────────────────────────────────────────
router.post("/workflows/graph", (req: Request, res: Response) => {
  const { nodes, edges, startId } = req.body ?? {};
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return res.status(400).json({ error: "nodes[] and edges[] required" });
  }
  const graph = edgesToGraph(nodes, edges);
  const order = startId ? graphToExecutionOrder(graph, startId) : [];
  res.json({ ...graph, _executionOrder: order });
});

// ── Alert Rules ───────────────────────────────────────────────────────────────
router.post("/alerts/rules", (req: Request, res: Response) => {
  const { expr, target } = req.body ?? {};
  if (!expr || !target) return res.status(400).json({ error: "expr and target required" });
  res.json(addRule({ expr, target }));
});

router.get("/alerts/rules", (_req: Request, res: Response) => {
  res.json({ rules: getAlertRules() });
});

router.post("/alerts/rules/eval", async (req: Request, res: Response) => {
  const { metrics } = req.body ?? {};
  if (!metrics || typeof metrics !== "object") {
    return res.status(400).json({ error: "metrics object required" });
  }
  const fired = await evalRules(metrics);
  res.json({ fired });
});

router.delete("/alerts/rules", (_req: Request, res: Response) => {
  clearRules();
  res.json({ ok: true });
});

router.delete("/alerts/rules/:id", (req: Request, res: Response) => {
  const removed = removeRule(req.params.id);
  res.json({ ok: removed });
});

// ── QA Utils ──────────────────────────────────────────────────────────────────
router.post("/qa/minimize-questions", (req: Request, res: Response) => {
  const { questions } = req.body ?? {};
  if (!Array.isArray(questions)) return res.status(400).json({ error: "questions[] required" });
  res.json({ questions: minimizeQuestions(questions) });
});

router.post("/qa/debug-failure", (req: Request, res: Response) => {
  const { err } = req.body ?? {};
  res.json({ suggestion: debugFailure(String(err ?? "")) ?? null });
});

router.post("/qa/trend", (req: Request, res: Response) => {
  const { data } = req.body ?? {};
  if (!Array.isArray(data)) return res.status(400).json({ error: "data[] required" });
  res.json({ trend: trend(data) });
});

router.post("/qa/capture-trace", (req: Request, res: Response) => {
  const { traceId, step, data } = req.body ?? {};
  if (!traceId || !step) return res.status(400).json({ error: "traceId and step required" });
  captureTrace(String(traceId), String(step), data);
  res.json({ ok: true });
});

router.post("/qa/golden/run", async (req: Request, res: Response) => {
  const { cases } = req.body ?? {};
  if (!Array.isArray(cases)) return res.status(400).json({ error: "cases[] required" });
  try {
    const results = await runGoldenBatch(cases, async (input) => {
      const r = runFinalPipeline(input as any);
      return r.safetyDisposition;
    });
    const passed = results.filter(r => r.match).length;
    res.json({ results, passed, total: results.length, accuracy: passed / results.length });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Multi-Channel Broadcast ───────────────────────────────────────────────────
router.post("/monitoring/broadcast", async (req: Request, res: Response) => {
  const { msg } = req.body ?? {};
  if (!msg) return res.status(400).json({ error: "msg required" });
  await broadcastMultiChannel(String(msg));
  res.json({ ok: true, channels: ["slack", "whatsapp", "telegram"] });
});

router.post("/monitoring/telegram", async (req: Request, res: Response) => {
  const { msg } = req.body ?? {};
  if (!msg) return res.status(400).json({ error: "msg required" });
  await sendTelegramAlert(String(msg));
  res.json({ ok: true });
});

export default router;

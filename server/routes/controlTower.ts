import { Router } from "express";
import { runClinicalConsensus } from "../agent/clinicalConsensusOrchestrator";
import { applyDispositionGuardrail } from "../engines/dispositionGuardrail";
import { runConsensus, weightedConsensus } from "../engines/consensusEngine";
import { getNextBestQuestion } from "../engines/nextBestQuestion";
import { getUsage, getCallHistory, estimateCost } from "../monitoring/usageTracker";
import { callExternalTool, batchMcpCalls } from "../mcp/mcpRouter";
import { checkInterrupt, triggerInterrupt, getInterruptHistory } from "../agent/interrupt";
import { runParallelTools, buildToolBlock } from "../agent/parallelDispatch";

const router = Router();

router.post("/clinical-run", async (req, res) => {
  try {
    const { complaint, features, riskScore, redFlags, centorScore, probability } = req.body;

    if (!complaint) {
      return res.status(400).json({ error: "complaint required" });
    }

    const result = await runClinicalConsensus({
      complaint,
      features:    features ?? {},
      riskScore:   riskScore   ?? 0.3,
      redFlags:    redFlags    ?? [],
      centorScore: centorScore ?? 0,
      probability: probability ?? 0.3,
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Clinical run failed" });
  }
});

router.post("/consensus", (req, res) => {
  try {
    const { opinions, customWeights } = req.body;
    if (!Array.isArray(opinions)) {
      return res.status(400).json({ error: "opinions array required" });
    }
    const result = customWeights
      ? weightedConsensus(opinions, customWeights)
      : runConsensus(opinions);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/disposition-guardrail", (req, res) => {
  try {
    const { diagnosis, riskScore, redFlags, llmDisposition, centorScore, probability } = req.body;
    if (!diagnosis || riskScore === undefined || !llmDisposition) {
      return res.status(400).json({ error: "diagnosis, riskScore, llmDisposition required" });
    }
    const result = applyDispositionGuardrail({
      diagnosis, riskScore, redFlags: redFlags ?? [], llmDisposition, centorScore, probability,
    });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/next-best-question", (req, res) => {
  try {
    const { differential, questions } = req.body;
    if (!Array.isArray(differential) || !Array.isArray(questions)) {
      return res.status(400).json({ error: "differential and questions arrays required" });
    }
    const result = getNextBestQuestion(differential, questions);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/usage", (_req, res) => {
  const usage   = getUsage();
  const history = getCallHistory(20);
  const cost    = estimateCost();
  res.json({ ok: true, usage, recentCalls: history.length, estimatedCostUSD: cost });
});

router.post("/mcp/call", async (req, res) => {
  try {
    const { name, input } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const result = await callExternalTool(name, input ?? {});
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/mcp/batch", async (req, res) => {
  try {
    const { calls } = req.body;
    if (!Array.isArray(calls)) return res.status(400).json({ error: "calls array required" });
    const results = await batchMcpCalls(calls);
    res.json({ ok: true, results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/interrupt", (req, res) => {
  try {
    const { type, message, actorId, data } = req.body;
    if (!type || !message) return res.status(400).json({ error: "type and message required" });
    triggerInterrupt({ type, message, actorId, data });
    res.json({ ok: true, triggered: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/interrupt/check", (_req, res) => {
  const result = checkInterrupt();
  res.json({ ok: true, ...result });
});

router.get("/interrupt/history", (_req, res) => {
  res.json({ ok: true, history: getInterruptHistory() });
});

router.post("/parallel-dispatch", async (req, res) => {
  try {
    const { blocks } = req.body;
    if (!Array.isArray(blocks)) return res.status(400).json({ error: "blocks array required" });
    const toolBlocks = blocks.map((b: any) => buildToolBlock(b.name, b.input ?? {}, b.id));
    const results    = await runParallelTools(toolBlocks);
    res.json({ ok: true, results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;

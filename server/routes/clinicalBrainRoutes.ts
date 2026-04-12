/**
 * Clinical Brain API — Batch 32
 * Exposes: agent contracts, DAG, knowledge graph, debate, traces, YAML pipelines
 */
import express from "express";
import { getAgentContracts } from "../api/agentContracts";
import { getDAG, getKnowledgeGraph } from "../api/dagApi";
import { getDiagnosticContext } from "../graph/queries";
import { listTraces, getTrace, clearTraces } from "../audit/traceStore";
import { runDebate } from "../debate/debateEngine";
import { CardiologyLLMAgent } from "../agents/cardiologyLLMAgent";
import { PulmonaryLLMAgent } from "../agents/pulmonaryLLMAgent";
import { loadPipeline } from "../yaml/loader";
import { runYamlPipeline } from "../yaml/executor";
import path from "path";

const router = express.Router();

// ── Agent Contracts ────────────────────────────────────────────────────────
router.get("/agents", (_req, res) => {
  res.json(getAgentContracts());
});

// ── DAG ────────────────────────────────────────────────────────────────────
router.get("/dag", (_req, res) => {
  res.json(getDAG());
});

// ── Knowledge Graph ────────────────────────────────────────────────────────
router.get("/knowledge-graph", (_req, res) => {
  res.json(getKnowledgeGraph());
});

router.get("/knowledge-graph/query", (req, res) => {
  const raw = String(req.query.symptoms ?? "");
  const symptoms = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!symptoms.length) {
    res.status(400).json({ error: "?symptoms=symptom1,symptom2 required" });
    return;
  }
  res.json(getDiagnosticContext(symptoms));
});

// ── Execution Traces (Replay) ──────────────────────────────────────────────
router.get("/traces", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  res.json(listTraces(limit));
});

router.get("/traces/:id", (req, res) => {
  const trace = getTrace(req.params.id);
  if (!trace) { res.status(404).json({ error: "Trace not found" }); return; }
  res.json(trace);
});

router.delete("/traces", (_req, res) => {
  clearTraces();
  res.json({ cleared: true });
});

// ── Multi-agent Debate ─────────────────────────────────────────────────────
router.post("/debate", async (req, res) => {
  try {
    const result = await runDebate(
      [new CardiologyLLMAgent(), new PulmonaryLLMAgent()],
      req.body
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Debate failed" });
  }
});

// ── YAML Pipeline ──────────────────────────────────────────────────────────
router.post("/pipeline/run", async (req, res) => {
  try {
    const { pipeline: pipelineName = "chestPain", input = {} } = req.body;
    const yamlPath = path.resolve(process.cwd(), "pipelines", `${pipelineName}.yaml`);
    const config   = loadPipeline(yamlPath);
    const result   = await runYamlPipeline(config, input);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Pipeline failed" });
  }
});

router.get("/pipeline/list", (_req, res) => {
  res.json({ pipelines: ["chestPain"] });
});

export default router;

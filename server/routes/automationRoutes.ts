/**
 * Automation Intelligence routes — /api/automation/*
 * Exposes sub-workflow engine, execution inspector, agent conversation, and clinical crew.
 */

import express from "express";
import {
  runComposedWorkflow, summarizeRun,
  type ComposedWorkflowDef,
} from "../workflows/subWorkflowEngine";
import {
  startRun, startNode, completeNode, failNode, completeRun,
  getRun, listRuns, compareRuns, getReplayDescriptor, formatRunSummary,
} from "../observability/executionInspector";
import {
  runAgentConversation, makeClinicalProposer, makeClinicalSkeptic,
} from "../workflows/agentConversation";
import {
  runClinicalCrew, buildChestPainCrew,
} from "../workflows/clinicalCrew";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Workflow Engine
// ─────────────────────────────────────────────────────────────────────────────

router.post("/workflow/run", async (req, res) => {
  try {
    const { workflow, input } = req.body as { workflow: ComposedWorkflowDef; input: Record<string, unknown> };
    if (!workflow || !workflow.steps) { res.status(400).json({ error: "workflow.steps required" }); return; }
    const result  = await runComposedWorkflow(workflow, input ?? {});
    const summary = summarizeRun(result);
    res.json({ ...result, summary });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Execution Inspector (LangSmith)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/inspect/run/start", (req, res) => {
  const { chainName, tags, patientId } = req.body;
  if (!chainName) { res.status(400).json({ error: "chainName required" }); return; }
  const runId = startRun(chainName, tags ?? [], patientId);
  res.json({ runId });
});

router.post("/inspect/run/:runId/node/start", (req, res) => {
  const { nodeName, nodeType, input, model, metadata } = req.body;
  const nodeId = startNode(req.params.runId, nodeName, nodeType ?? "step", input, model, metadata);
  res.json({ nodeId });
});

router.post("/inspect/run/:runId/node/:nodeId/complete", (req, res) => {
  const { output, tokenEstimate, evaluationScore } = req.body;
  completeNode(req.params.runId, req.params.nodeId, output, tokenEstimate, evaluationScore);
  res.json({ ok: true });
});

router.post("/inspect/run/:runId/node/:nodeId/fail", (req, res) => {
  failNode(req.params.runId, req.params.nodeId, req.body.error ?? "Unknown error");
  res.json({ ok: true });
});

router.post("/inspect/run/:runId/complete", (req, res) => {
  completeRun(req.params.runId, req.body.output);
  const run = getRun(req.params.runId);
  res.json({ ok: true, status: run?.status, totalMs: run?.totalMs });
});

router.get("/inspect/run/:runId", (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) { res.status(404).json({ error: "Run not found" }); return; }
  const summary = formatRunSummary(run);
  res.json({ run, summary });
});

router.get("/inspect/runs", (req, res) => {
  const { chainName, patientId, status, tag, limit } = req.query;
  const runs = listRuns({
    chainName: chainName as string,
    patientId: patientId as string,
    status:    status as any,
    tag:       tag as string,
    limit:     limit ? Number(limit) : 20,
  });
  res.json({ count: runs.length, runs });
});

router.get("/inspect/compare/:runIdA/:runIdB", (req, res) => {
  const comparison = compareRuns(req.params.runIdA, req.params.runIdB);
  if (!comparison) { res.status(404).json({ error: "One or both runs not found" }); return; }
  res.json(comparison);
});

router.get("/inspect/run/:runId/replay", (req, res) => {
  const descriptor = getReplayDescriptor(req.params.runId);
  if (!descriptor) { res.status(404).json({ error: "Run not found" }); return; }
  res.json(descriptor);
});

// ─────────────────────────────────────────────────────────────────────────────
// Agent Conversation (AutoGen)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/conversation/run", async (req, res) => {
  try {
    const { context, maxRounds, minAgreeFor, proposerHypotheses, skepticFlags } = req.body;

    const proposer = makeClinicalProposer({
      name:       "DiagnosticAgent",
      hypotheses: proposerHypotheses ?? [
        { condition: "chest pain",          hypothesis: "Low-risk ACS — HEART score 2",          confidence: 0.8 },
        { condition: "shortness of breath", hypothesis: "Probable pulmonary embolism — Wells 5",  confidence: 0.75 },
        { condition: "sepsis",              hypothesis: "Sepsis — Hour-1 bundle indicated",       confidence: 0.9 },
      ],
    });
    const skeptic = makeClinicalSkeptic({
      name:  "SkepticAgent",
      flags: skepticFlags ?? [
        { field: "troponin",    operator: "missing", concern: "Troponin not yet resulted" },
        { field: "stElevation", operator: "present", concern: "ST elevation requires immediate STEMI workup" },
      ],
    });

    const result = await runAgentConversation({
      agents:  [proposer, skeptic],
      context: context ?? {},
      maxRounds:   maxRounds ?? 4,
      minAgreeFor: minAgreeFor ?? 2,
    });

    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Clinical Crew (CrewAI)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/crew/chest-pain", async (req, res) => {
  try {
    const crew   = buildChestPainCrew();
    const result = await runClinicalCrew(crew, req.body ?? {});
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;

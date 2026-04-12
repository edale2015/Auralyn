/**
 * Orchestration Routes — /api/orchestration/*
 * Full triage pipeline · RAG · LangGraph · Specialist Council · LangSmith
 */

import express from "express";
import { runFullTriage }         from "./orchestrator";
import { buildClinicalRAG }      from "./langchain/clinicalRAG";
import { runTriageGraph }        from "./langgraph/triageGraph";
import { runSpecialistCouncil }  from "./crew/specialistCouncil";
import { logCase, getLocalAuditLog } from "./observability/langsmith";
import { buildPatientWorkflow }  from "./events/workflowEngine";

const router = express.Router();

// ── POST /api/orchestration/triage — full pipeline ────────────────────────────
router.post("/triage", async (req, res) => {
  try {
    const { symptoms, patientId, vitals } = req.body;
    if (!symptoms) { res.status(400).json({ error: "symptoms required" }); return; }

    const result = await runFullTriage({ symptoms, patientId, vitals });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/orchestration/rag — RAG-only diagnosis ─────────────────────────
router.post("/rag", async (req, res) => {
  try {
    const { symptoms } = req.body;
    if (!symptoms) { res.status(400).json({ error: "symptoms required" }); return; }

    const rag    = buildClinicalRAG();
    const result = await rag.invoke(symptoms);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/orchestration/triage-graph — iterative LangGraph ───────────────
router.post("/triage-graph", async (req, res) => {
  try {
    const { symptoms } = req.body;
    if (!symptoms) { res.status(400).json({ error: "symptoms required" }); return; }

    const result = await runTriageGraph(symptoms);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/orchestration/council — specialist council ─────────────────────
router.post("/council", async (req, res) => {
  try {
    const { caseData, symptoms, vitals } = req.body;
    const caseStr = caseData ?? `Symptoms: ${symptoms ?? "unspecified"}. Vitals: ${JSON.stringify(vitals ?? {})}`;
    if (!caseStr) { res.status(400).json({ error: "caseData or symptoms required" }); return; }

    const result = await runSpecialistCouncil(caseStr);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/orchestration/workflow — step-by-step workflow run ──────────────
router.post("/workflow", async (req, res) => {
  try {
    const { symptoms, patientId } = req.body;
    if (!symptoms) { res.status(400).json({ error: "symptoms required" }); return; }

    const workflow = buildPatientWorkflow();
    const result   = await workflow.run({ symptoms, patientId });
    res.json({ steps: result.steps, totalMs: result.totalMs, output: result.output });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/orchestration/audit — local FDA audit log ───────────────────────
router.get("/audit", (_req, res) => {
  res.json({ entries: getLocalAuditLog(), count: getLocalAuditLog().length });
});

// ── POST /api/orchestration/log — manual trace entry ─────────────────────────
router.post("/log", async (req, res) => {
  try {
    const { input, output, name, tags } = req.body;
    const result = await logCase(input ?? {}, output ?? {}, { name, tags });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

import express from "express";
import { listAllNodes, listAllEdges, getStats, queryNodes, getNeighbors } from "../memory/memoryGraph";
import { logClinicalCase, logError } from "../memory/memoryIngest";
import { findSimilarCases, getPatientTimeline, getOutcomeSuccessRate, getRecentErrors, getRobotActions, getGraphSummary } from "../memory/memoryQuery";

const router = express.Router();

router.get("/nodes", (_req, res) => {
  const nodes = listAllNodes().slice(0, 200);
  res.json({ nodes });
});

router.get("/edges", (_req, res) => {
  const edges = listAllEdges().slice(0, 500);
  res.json({ edges });
});

router.get("/stats", (_req, res) => {
  res.json({ stats: getStats() });
});

router.get("/summary", (_req, res) => {
  res.json(getGraphSummary());
});

router.get("/nodes/:id/neighbors", (req, res) => {
  const neighbors = getNeighbors(req.params.id);
  res.json({ neighbors });
});

router.post("/query", (req, res) => {
  const { type, tags, dataKey, dataValue } = req.body;
  const results = queryNodes({ type, tags, dataKey, dataValue });
  res.json({ results });
});

router.post("/similar-cases", (req, res) => {
  const { complaints } = req.body;
  const cases = findSimilarCases(complaints ?? []);
  res.json({ cases });
});

router.get("/patient/:patientId/timeline", (req, res) => {
  const timeline = getPatientTimeline(req.params.patientId);
  res.json({ timeline });
});

router.get("/success-rate", (_req, res) => {
  res.json(getOutcomeSuccessRate());
});

router.get("/errors", (_req, res) => {
  const errors = getRecentErrors(50);
  res.json({ errors });
});

router.get("/robot-actions", (_req, res) => {
  const actions = getRobotActions(50);
  res.json({ actions });
});

router.post("/ingest/clinical", (req, res) => {
  try {
    const result = logClinicalCase(req.body);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/ingest/error", (req, res) => {
  const { source, message, context } = req.body;
  const node = logError(source, message, context);
  res.json({ ok: true, nodeId: node.id });
});

export default router;

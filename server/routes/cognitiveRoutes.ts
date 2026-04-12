import express from "express";
import { runCognitiveBrain }    from "../cognitive/cognitiveOrchestrator";
import { listCognitiveCases, getCognitiveCase, caseCount } from "../cognitive/caseStore";
import { readMemoryGraph, queryMemory }  from "../cognitive/memoryGraph";

const router = express.Router();

/**
 * POST /api/cognitive-run
 * Main Cognitive Brain endpoint.
 *
 * Body: { symptoms: string[] | Record<string,boolean>, vitals?: {...}, redFlags?: boolean, ... }
 * Returns: { caseId, diagnosis, disposition, confidence, strategy, urgencyScore, patientMessage, reasoning }
 */
router.post("/cognitive-run", async (req, res) => {
  try {
    const result = await runCognitiveBrain(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Cognitive brain failed" });
  }
});

/**
 * GET /api/cognitive/cases?limit=20
 * List recent cognitive case runs.
 */
router.get("/cases", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  res.json({ cases: listCognitiveCases(limit), total: caseCount() });
});

/**
 * GET /api/cognitive/cases/:id
 * Get a single cognitive case by ID.
 */
router.get("/cases/:id", (req, res) => {
  const c = getCognitiveCase(req.params.id);
  if (!c) { res.status(404).json({ error: "Case not found" }); return; }
  res.json(c);
});

/**
 * GET /api/cognitive/memory
 * Read the full in-memory symptom→diagnosis pattern graph.
 */
router.get("/memory", (_req, res) => {
  res.json(readMemoryGraph());
});

/**
 * GET /api/cognitive/memory/:symptom
 * Query the memory graph for a specific symptom.
 */
router.get("/memory/:symptom", (req, res) => {
  res.json(queryMemory(req.params.symptom));
});

export default router;

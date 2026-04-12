/**
 * Advanced Control Routes
 * Mounted at /api/advanced
 *
 * POST /api/advanced/council        — Specialist Council (Cardio/ID/ICU)
 * POST /api/advanced/cpt            — CPT code generation
 * POST /api/advanced/fda/validate   — FDA accuracy validation
 * POST /api/advanced/drift          — Distribution drift check
 * POST /api/advanced/golden/run     — Golden case harness
 * GET  /api/advanced/stream/status  — WebSocket client count
 * POST /api/advanced/stream/broadcast — Manual broadcast to WS clients
 */

import express from "express";
import { specialistCouncil }   from "../agents/specialistCouncil";
import { fdaValidator }        from "../fda/fdaValidator";
import { driftDetector }       from "../learning/driftDetector";
import { goldenCaseRunner }    from "../testing/goldenCaseHarness";
import { broadcastPatientUpdate, clientCount } from "../realtime/patientStream";

const router = express.Router();

// ── Specialist Council ────────────────────────────────────────────────────────
router.post("/council", async (req, res) => {
  try {
    const result = await specialistCouncil.evaluate(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Council failed" });
  }
});

// ── CPT Engine ────────────────────────────────────────────────────────────────
router.post("/cpt", (req, res) => {
  const { complexity = "medium" } = req.body;
  const codeMap: Record<string, string> = { high: "99285", medium: "99284", low: "99283" };
  const code = codeMap[complexity] ?? "99283";
  const revenueMap: Record<string, number> = { "99285": 300, "99284": 200, "99283": 120 };
  res.json({ code, complexity, estimatedRevenue: revenueMap[code] });
});

// ── FDA Validator ─────────────────────────────────────────────────────────────
router.post("/fda/validate", (req, res) => {
  const { results = [], threshold = 0.8 } = req.body;
  try {
    res.json(fdaValidator.validate(results, threshold));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Drift Detector ────────────────────────────────────────────────────────────
router.post("/drift", (req, res) => {
  const { oldDist, newDist, oldMap, newMap, threshold = 0.2, label } = req.body;
  try {
    if (oldMap && newMap) {
      res.json(driftDetector.detectFromMaps(oldMap, newMap, threshold, label));
    } else if (Array.isArray(oldDist) && Array.isArray(newDist)) {
      res.json(driftDetector.detect(oldDist, newDist, threshold));
    } else {
      res.status(400).json({ error: "Provide either (oldDist, newDist) arrays or (oldMap, newMap) objects" });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Golden Case Harness ───────────────────────────────────────────────────────
router.post("/golden/run", async (req, res) => {
  const { cases = [], engineType = "sequential" } = req.body;
  if (!cases.length) { res.status(400).json({ error: "cases[] required" }); return; }

  try {
    let engine: { run: (input: any) => Promise<any> };

    if (engineType === "cognitive") {
      const { runCognitiveBrain } = await import("../cognitive/cognitiveOrchestrator");
      engine = { run: runCognitiveBrain };
    } else {
      const { sequentialReasoner } = await import("../agents/sequentialClinicalReasoner");
      engine = { run: (input: any) => sequentialReasoner.run(input) };
    }

    const summary = await goldenCaseRunner.runCases(cases, engine);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── WebSocket Stream Status ───────────────────────────────────────────────────
router.get("/stream/status", (_req, res) => {
  res.json({ connected: clientCount(), wsPath: "/ws/patients" });
});

router.post("/stream/broadcast", (req, res) => {
  broadcastPatientUpdate(req.body);
  res.json({ ok: true, recipients: clientCount() });
});

export default router;

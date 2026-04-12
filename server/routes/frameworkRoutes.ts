/**
 * Framework Routes — /api/framework/*
 * Exposes the 4 new framework-inspired modules:
 *   GET|POST /wave/run     — dependency-ordered wave execution (GSD)
 *   POST     /verify       — goal-backward clinical verification (GSD debugger)
 *   POST     /acuity       — scale-adaptive ESI routing (BMAD)
 *   POST     /delta/add    — track ADDED protocol change (OpenSpec)
 *   POST     /delta/modify — track MODIFIED protocol change
 *   POST     /delta/remove — track REMOVED protocol change
 *   GET      /delta        — list deltas with optional filters
 *   GET      /delta/summary— FDA-export summary
 *   POST     /delta/verify — verify a delta hasn't been tampered with
 */

import express from "express";
import { runDependencyWave }          from "../agents/dependencyWave";
import { verifyGoals }                from "../agents/goalVerifier";
import { routeAcuity }               from "../triage/acuityRouter";
import {
  trackAdded, trackModified, trackRemoved,
  getDeltas, getDeltaById, verifyDelta, getDeltaSummary,
} from "../audit/deltaTracker";

const router = express.Router();

// ── Dependency Wave ───────────────────────────────────────────────────────────
router.post("/wave/run", async (req, res) => {
  try {
    const { tasks } = req.body;
    if (!Array.isArray(tasks) || tasks.length === 0) {
      res.status(400).json({ error: "tasks[] required" }); return;
    }
    // Build executable tasks from declarative spec
    const execTasks = tasks.map((t: any) => ({
      name:    t.name,
      deps:    t.deps ?? [],
      execute: async (inputs: any) => ({
        ...inputs.completed,
        [t.name]: t.output ?? `result_of_${t.name}`,
      }),
    }));
    res.json(await runDependencyWave(execTasks));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Goal-Backward Verifier ────────────────────────────────────────────────────
router.post("/verify", (req, res) => {
  try {
    const { patient, scores, sepsisRisk, icuProb, disposition, gatesPassed } = req.body;
    if (!disposition) { res.status(400).json({ error: "disposition required" }); return; }
    res.json(verifyGoals({
      patient:     patient ?? {},
      scores:      scores  ?? {},
      sepsisRisk,
      icuProb,
      disposition,
      gatesPassed: gatesPassed ?? true,
    }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Acuity Router ─────────────────────────────────────────────────────────────
router.post("/acuity", (req, res) => {
  try {
    res.json(routeAcuity(req.body));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Delta Tracker ─────────────────────────────────────────────────────────────
router.post("/delta/add", (req, res) => {
  try {
    const { entityType, entityId, after, reason, author, affectedScope } = req.body;
    if (!entityType || !entityId || !reason || !author) {
      res.status(400).json({ error: "entityType, entityId, reason, author required" }); return;
    }
    res.status(201).json(trackAdded({ entityType, entityId, after, reason, author, affectedScope }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/delta/modify", (req, res) => {
  try {
    const { entityType, entityId, before, after, reason, author, affectedScope } = req.body;
    if (!entityType || !entityId || !reason || !author) {
      res.status(400).json({ error: "entityType, entityId, reason, author required" }); return;
    }
    res.json(trackModified({ entityType, entityId, before, after, reason, author, affectedScope }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/delta/remove", (req, res) => {
  try {
    const { entityType, entityId, before, reason, author, affectedScope } = req.body;
    if (!entityType || !entityId || !reason || !author) {
      res.status(400).json({ error: "entityType, entityId, reason, author required" }); return;
    }
    res.json(trackRemoved({ entityType, entityId, before, reason, author, affectedScope }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/delta", (req, res) => {
  try {
    const { entityType, entityId, changeType, since } = req.query as Record<string, string>;
    res.json(getDeltas({ entityType, entityId, changeType: changeType as any, since }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/delta/summary", (req, res) => {
  try {
    res.json(getDeltaSummary());
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/delta/verify", (req, res) => {
  try {
    res.json(verifyDelta(req.body));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/delta/:deltaId", (req, res) => {
  const record = getDeltaById(req.params.deltaId);
  if (!record) { res.status(404).json({ error: "Delta not found" }); return; }
  res.json(record);
});

export default router;

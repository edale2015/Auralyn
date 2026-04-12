/**
 * Clinical Decision Engine Routes — /api/cde/*
 * Full 6-layer RAG pipeline: Gate → Route → Retrieve → Score → Reason → Dispose
 */

import express from "express";
import { runClinicalDecisionEngine } from "../rag/clinicalDecisionEngine";
import { runSafetyGate }             from "../rag/safetyGate";
import { routeQuery }                from "../rag/clinicalQueryRouter";
import { retrieveMultiSource }       from "../rag/multiSourceRetriever";
import { scoreChunks, filterContext } from "../rag/relevanceScorer";
import { clinicalReason }            from "../rag/clinicalReasoner";
import { computeDisposition }        from "../rag/dispositionEngine";

const router = express.Router();

// ── Full CDE Pipeline (single call) ──────────────────────────────────────────
router.post("/query", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") { res.status(400).json({ error: "query (string) required" }); return; }
    const result = await runClinicalDecisionEngine(query);
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Individual layers (useful for testing + debugging) ────────────────────────

router.post("/gate", (req, res) => {
  try {
    const { query } = req.body;
    if (!query) { res.status(400).json({ error: "query required" }); return; }
    res.json(runSafetyGate(query));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/route", (req, res) => {
  try {
    const { query } = req.body;
    if (!query) { res.status(400).json({ error: "query required" }); return; }
    res.json(routeQuery(query));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/retrieve", async (req, res) => {
  try {
    const { query, route } = req.body;
    if (!query) { res.status(400).json({ error: "query required" }); return; }
    res.json(await retrieveMultiSource(query, route ?? "GENERAL_MEDICAL"));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/score", async (req, res) => {
  try {
    const { query, chunks, threshold } = req.body;
    if (!query || !Array.isArray(chunks)) { res.status(400).json({ error: "query and chunks[] required" }); return; }
    const scored = scoreChunks(query, chunks, threshold ?? 0.10);
    res.json({ ...filterContext(scored, threshold ?? 0.10), scored });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/reason", async (req, res) => {
  try {
    const { query, context } = req.body;
    if (!query) { res.status(400).json({ error: "query required" }); return; }
    res.json(await clinicalReason(query, context ?? []));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/dispose", (req, res) => {
  try {
    const { reasoning, gate, route } = req.body;
    if (!reasoning || !gate || !route) { res.status(400).json({ error: "reasoning, gate, and route required" }); return; }
    res.json(computeDisposition(reasoning, gate, route));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;

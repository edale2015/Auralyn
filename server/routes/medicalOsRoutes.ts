/**
 * Medical OS Routes — /api/medical-os/*
 * Full triage pipeline · Co-pilot · Deterministic replay · Clinical trials · Skills · Agent council
 */

import express from "express";
import { runFullTriage }           from "../commands/runFullTriage";
import { runAgentLoop }            from "../engine/agentLoop";
import { runAgentCouncil }         from "../agents/agentCouncil";
import { runSkills }               from "../controlTower/skillRunner";
import { generateInterventions }   from "../intervention/autonomousCopilot";
import { buildCopilotCards, getPendingCards, getAllCards, approveCard, rejectCard } from "../intervention/copilotDecision";
import { rerunDecision, replayCaseEvents } from "../audit/deterministicReplay";
import { runTrial }                from "../simulation/clinicalTrialSimulator";
import { preDispositionHook }      from "../hooks/preDisposition";
import { ehrWrite }                from "../ehr/ehrWriter";

const router = express.Router();

// ── Full Triage (one-click pipeline) ─────────────────────────────────────────
router.post("/triage/full", async (req, res) => {
  try {
    if (!req.body?.id || !req.body?.vitals) { res.status(400).json({ error: "id and vitals required" }); return; }
    const result = await runFullTriage(req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Agent Loop (gather → skills → council → hooks) ───────────────────────────
router.post("/loop", async (req, res) => {
  try {
    if (!req.body?.id || !req.body?.vitals) { res.status(400).json({ error: "id and vitals required" }); return; }
    res.json(await runAgentLoop(req.body));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Agent Council ─────────────────────────────────────────────────────────────
router.post("/council", (req, res) => {
  try {
    if (!req.body?.vitals) { res.status(400).json({ error: "vitals required" }); return; }
    res.json(runAgentCouncil(req.body));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Skills runner ─────────────────────────────────────────────────────────────
router.post("/skills/run", (req, res) => {
  try {
    if (!req.body?.id || !req.body?.vitals) { res.status(400).json({ error: "id and vitals required" }); return; }
    res.json(runSkills(req.body));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Pre-disposition hook ──────────────────────────────────────────────────────
router.post("/hooks/disposition", (req, res) => {
  try {
    const { patient, decision } = req.body;
    if (!patient?.patientId) { res.status(400).json({ error: "patient.patientId required" }); return; }
    res.json(preDispositionHook(patient, decision ?? {}));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Autonomous Co-Pilot ───────────────────────────────────────────────────────
router.post("/copilot/generate", async (req, res) => {
  try {
    if (!req.body?.id || !req.body?.vitals) { res.status(400).json({ error: "id and vitals required" }); return; }
    const bundles = await generateInterventions(req.body);
    const cards   = buildCopilotCards(req.body.id, bundles);
    res.json({ bundles, cards });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/copilot/cards",           (_req, res) => { res.json({ cards: getAllCards(), pending: getPendingCards().length }); });
router.get("/copilot/cards/pending",   (_req, res) => { res.json({ cards: getPendingCards() }); });

router.post("/copilot/cards/:id/approve", (req, res) => {
  const { physicianId } = req.body;
  if (!physicianId) { res.status(400).json({ error: "physicianId required" }); return; }
  const card = approveCard(req.params.id, physicianId);
  res.json(card ?? { error: "Card not found" });
});

router.post("/copilot/cards/:id/reject", (req, res) => {
  const { physicianId, reason } = req.body;
  const card = rejectCard(req.params.id, physicianId ?? "physician", reason);
  res.json(card ?? { error: "Card not found" });
});

// ── Deterministic Replay ──────────────────────────────────────────────────────
router.post("/replay/event", (req, res) => {
  try {
    const event = req.body;
    if (!event?.agent || !event?.action) { res.status(400).json({ error: "agent and action required" }); return; }
    res.json(rerunDecision(event));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/replay/case", (req, res) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events)) { res.status(400).json({ error: "events[] required" }); return; }
    res.json(replayCaseEvents(events));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Clinical Trial Simulator ──────────────────────────────────────────────────
router.post("/trial/run", async (req, res) => {
  try {
    const { patients } = req.body;
    if (!Array.isArray(patients) || patients.length === 0) { res.status(400).json({ error: "patients[] required (non-empty)" }); return; }
    const result = await runTrial(patients);
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── EHR Writer ────────────────────────────────────────────────────────────────
router.post("/ehr/write", async (req, res) => {
  try {
    const { patientId, disposition, notes, system } = req.body;
    if (!patientId || !disposition) { res.status(400).json({ error: "patientId and disposition required" }); return; }
    const result = await ehrWrite({ patientId, disposition, notes: notes ?? "", system });
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;

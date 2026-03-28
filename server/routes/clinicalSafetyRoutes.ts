/**
 * Clinical Safety Routes  —  /api/safety/*
 *
 * Exposes the 8 Clinical Safety Remediation modules:
 *   1. Hybrid Engine Conflict Resolver
 *   2. Sepsis Detection (qSOFA + NEWS2)
 *   3. Pediatric Scoring (PEWS)
 *   4. Obstetric Emergency Pathways
 *   5. Mental Health Crisis (PHQ-9 + Suicide Risk)
 *   6. FDA Intended Use Statement
 *   7. RLHF Human-Gated Learning Queue
 *   8. Master Safety Pipeline (full end-to-end)
 */

import { Router, Request, Response } from "express";
import { resolveConflict }           from "../clinical/conflictResolver";
import { detectSepsis, qSOFA, news2 } from "../clinical/sepsis";
import { PEWS }                       from "../clinical/pediatric";
import { obstetricCheck }             from "../clinical/obstetric";
import { suicideRisk, PHQ9 }          from "../clinical/mentalHealth";
import { intendedUse, getIntendedUseSummary } from "../fda/intendedUse";
import {
  submitLearningUpdate,
  approveUpdate,
  rejectUpdate,
  listQueue,
  getQueueStats,
} from "../learning/reviewQueue";
import { safetyPipeline }             from "../clinical/safetyPipeline";
import { logEvent }                   from "../ops/auditEvents";

const router = Router();

// ── 1. Conflict Resolver ──────────────────────────────────────────────────────

router.post("/conflict/resolve", (req: Request, res: Response) => {
  const { deterministic, probabilistic, confidenceThreshold } = req.body;
  if (!deterministic) return res.status(400).json({ error: "deterministic output is required" });
  const result = resolveConflict({ deterministic, probabilistic: probabilistic ?? null, confidenceThreshold });
  return res.json({ ok: true, ...result });
});

router.get("/conflict/demo", (_req: Request, res: Response) => {
  // Demonstrates hard safety override: deterministic ER_NOW always wins
  const result = resolveConflict({
    deterministic:  { disposition: "ER_NOW", diagnosis: "Sepsis", urgency: "critical", source: "rule-engine" },
    probabilistic:  { disposition: "URGENT_24H", diagnosis: "Influenza A", confidence: 0.88, source: "bayesian" },
  });
  res.json({ ok: true, demo: true, scenario: "Hard safety override (deterministic ER_NOW wins despite high Bayesian confidence)", ...result });
});

// ── 2. Sepsis Detection ───────────────────────────────────────────────────────

router.post("/sepsis/screen", (req: Request, res: Response) => {
  const { vitals } = req.body;
  if (!vitals) return res.status(400).json({ error: "vitals object required" });
  const result = detectSepsis(vitals);
  if (result.highRisk) {
    logEvent({ type: "SEPSIS_ALERT", severity: "critical", payload: { ...result, vitals } });
  }
  return res.json({ ok: true, ...result });
});

router.get("/sepsis/demo", (_req: Request, res: Response) => {
  const vitals = { respiratoryRate: 24, systolicBP: 95, alteredMentalStatus: true, heartRate: 118, temperature: 38.9 };
  const result = detectSepsis(vitals);
  res.json({ ok: true, demo: true, vitals, ...result });
});

// ── 3. Pediatric PEWS ─────────────────────────────────────────────────────────

router.post("/pediatric/pews", (req: Request, res: Response) => {
  const { vitals } = req.body;
  if (!vitals || vitals.ageYears === undefined) {
    return res.status(400).json({ error: "vitals.ageYears is required" });
  }
  const result = PEWS(vitals);
  if (result.escalate) {
    logEvent({ type: "PEWS_ALERT", severity: result.disposition === "ER_NOW" ? "critical" : "warn", payload: { ...result, vitals } });
  }
  return res.json({ ok: true, ...result });
});

router.get("/pediatric/demo", (_req: Request, res: Response) => {
  const vitals = { ageYears: 4, heartRate: 175, respiratoryDistress: "moderate" as const, spo2: 91, behavior: "lethargic" as const };
  const result = PEWS(vitals);
  res.json({ ok: true, demo: true, vitals, ...result });
});

// ── 4. Obstetric Emergencies ──────────────────────────────────────────────────

router.post("/obstetric/check", (req: Request, res: Response) => {
  const input = req.body;
  if (!input || (input.pregnant === undefined && input.postpartumDays === undefined)) {
    return res.status(400).json({ error: "pregnant (bool) or postpartumDays required" });
  }
  const result = obstetricCheck(input);
  if (result?.emergency) {
    logEvent({ type: "OB_EMERGENCY", severity: "critical", payload: { ...result, input } });
  }
  return res.json({ ok: true, emergency: result?.emergency ?? false, alert: result });
});

router.get("/obstetric/demo", (_req: Request, res: Response) => {
  const input = {
    pregnant: true, gestationalWeeksGA: 32,
    systolicBP: 165, diastolicBP: 112,
    symptoms: ["headache", "visual changes"],
  };
  const result = obstetricCheck(input);
  res.json({ ok: true, demo: true, scenario: "Severe pre-eclampsia at 32w", input, alert: result });
});

// ── 5. Mental Health / Suicide Risk ──────────────────────────────────────────

router.post("/mental-health/risk", (req: Request, res: Response) => {
  const input = req.body;
  if (input.suicidalIdeation === undefined) {
    return res.status(400).json({ error: "suicidalIdeation (bool) required" });
  }
  const risk = suicideRisk(input);
  if (risk.highRisk) {
    logEvent({ type: "MH_CRISIS", severity: "critical", payload: { ...risk, input } });
  }
  return res.json({ ok: true, ...risk });
});

router.post("/mental-health/phq9", (req: Request, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length !== 9) {
    return res.status(400).json({ error: "items must be an array of exactly 9 scores (0–3)" });
  }
  const result = PHQ9({ items });
  return res.json({ ok: true, ...result });
});

router.get("/mental-health/demo", (_req: Request, res: Response) => {
  const phq9 = PHQ9({ items: [3, 2, 3, 3, 2, 3, 3, 2, 2] });
  const risk  = suicideRisk({ suicidalIdeation: true, ideationType: 4, hasIntent: true, priorAttempt: true });
  res.json({ ok: true, demo: true, scenario: "Severe depression + high suicide risk", phq9, risk });
});

// ── 6. FDA Intended Use ───────────────────────────────────────────────────────

router.get("/fda/intended-use", (_req: Request, res: Response) => {
  res.json({ ok: true, ...intendedUse });
});

router.get("/fda/intended-use/summary", (_req: Request, res: Response) => {
  res.json({ ok: true, ...getIntendedUseSummary() });
});

// ── 7. RLHF Review Queue ──────────────────────────────────────────────────────

router.get("/review-queue/stats", (_req: Request, res: Response) => {
  res.json({ ok: true, ...getQueueStats() });
});

router.get("/review-queue/list", (req: Request, res: Response) => {
  const { status, type } = req.query as { status?: any; type?: any };
  const items = listQueue({ status, type });
  res.json({ ok: true, count: items.length, items });
});

router.post("/review-queue/submit", (req: Request, res: Response) => {
  const { type = "RULE_SUGGESTION", source = "api", description, proposal, priority } = req.body;
  if (!description || !proposal) return res.status(400).json({ error: "description and proposal required" });
  const update = submitLearningUpdate({ type, source, description, proposal, priority });
  return res.json({ ok: true, ...update });
});

router.post("/review-queue/:id/approve", (req: Request, res: Response) => {
  const { id } = req.params;
  const { reviewer = "admin", note } = req.body;
  try {
    const update = approveUpdate(id, { reviewer, note });
    return res.json({ ok: true, ...update });
  } catch (err) {
    return res.status(404).json({ error: err instanceof Error ? err.message : "Not found" });
  }
});

router.post("/review-queue/:id/reject", (req: Request, res: Response) => {
  const { id } = req.params;
  const { reviewer = "admin", reason = "Rejected" } = req.body;
  try {
    const update = rejectUpdate(id, { reviewer, reason });
    return res.json({ ok: true, ...update });
  } catch (err) {
    return res.status(404).json({ error: err instanceof Error ? err.message : "Not found" });
  }
});

router.post("/review-queue/demo/seed", (_req: Request, res: Response) => {
  const demos = [
    { type: "RULE_SUGGESTION"  as const, source: "outcome_engine",    description: "Increase Centor score threshold from ≥3 to ≥4 for antibiotic prescription",   proposal: { rule: "centor_ab_threshold", old: 3, new: 4 },             priority: "medium" as const },
    { type: "DISPOSITION_CHANGE" as const, source: "rlhf_engine",     description: "Lower URGENT_24H → ROUTINE_72H for viral URI with Centor 0–1",               proposal: { rule: "viral_uri_disposition", from: "URGENT_24H", to: "ROUTINE_72H" }, priority: "low" as const },
    { type: "WEIGHT_ADJUSTMENT"  as const, source: "physician_feedback", description: "Increase Bayesian weight for fever as PE predictor by 0.12",               proposal: { diagnosis: "PE", feature: "fever", delta: 0.12 },          priority: "high" as const },
  ];
  const results = demos.map((d) => submitLearningUpdate(d));
  return res.json({ ok: true, seeded: results.length, items: results });
});

// ── 8. Master Safety Pipeline ──────────────────────────────────────────────────

router.post("/pipeline/run", (req: Request, res: Response) => {
  const input = req.body;
  const result = safetyPipeline(input);
  return res.json({ ok: true, ...result });
});

router.get("/pipeline/demo", (_req: Request, res: Response) => {
  const result = safetyPipeline({
    patientId: "demo-patient-001",
    clinicId:  "clinic-demo",
    ageYears:  6,
    vitals: { respiratoryRate: 28, systolicBP: 88, heartRate: 145, alteredMentalStatus: true },
    pedsVitals: { ageYears: 6, heartRate: 145, respiratoryRate: 28, spo2: 90, behavior: "lethargic", respiratoryDistress: "moderate" },
    deterministic: { disposition: "URGENT_24H", diagnosis: "Viral URI", urgency: "moderate", source: "rule-engine" },
    probabilistic:  { disposition: "URGENT_24H", diagnosis: "Viral URI", confidence: 0.72, source: "bayesian" },
  });
  res.json({ ok: true, demo: true, scenario: "6yo with sepsis + PEWS elevation — safety pipeline overrides URGENT to ER_NOW", ...result });
});

export default router;

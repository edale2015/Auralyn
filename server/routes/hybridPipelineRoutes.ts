/**
 * Hybrid Clinical Pipeline Routes — /api/pipeline/*
 * Demonstrates the full GSD + Superpowers + BMAD hybrid:
 *   Context-Isolated Wave → Clinical Gates → Spec Rules → Trace
 */

import express from "express";
import { runClinicalWave, extractResults }  from "../agents/contextIsolatedRunner";
import { enforceClinicalGates }             from "../safety/clinicalGates";
import { buildClinicalTrace, verifyTrace, flattenTrace } from "../audit/clinicalTrace";
import { loadDispositionRules, applyRules, SEED_RULES } from "../kb/specEngine";
import { detectSepsisRisk }                 from "../sepsis/sepsisEngine";
import { runDigitalTwin }                   from "../digitalTwin/digitalTwinEngine";

const router = express.Router();

// ── Full Hybrid Pipeline ──────────────────────────────────────────────────────
router.post("/run", async (req, res) => {
  try {
    const patient = req.body;
    if (!patient?.id || !patient?.vitals) {
      res.status(400).json({ error: "id and vitals required" }); return;
    }

    // ─ PLAN ───────────────────────────────────────────────────────────────────
    const vitals  = patient.vitals;
    const hr      = vitals.hr  ?? 80;
    const rr      = vitals.rr  ?? 16;
    const spo2    = vitals.spo2 ?? 98;
    const sbp     = vitals.systolicBP ?? vitals.sbp ?? 120;
    const temp    = vitals.temp ?? 98.6;

    // NEWS2 scoring (simplified inline)
    function news2Score(): number {
      let score = 0;
      if (rr <= 8 || rr >= 25) score += 3; else if (rr >= 21) score += 2; else if (rr >= 9) score += 1;
      if (spo2 < 92) score += 3; else if (spo2 <= 93) score += 2; else if (spo2 <= 95) score += 1;
      if (sbp <= 90) score += 3; else if (sbp <= 100) score += 2; else if (sbp <= 110 || sbp >= 220) score += 1;
      if (hr <= 40 || hr >= 131) score += 3; else if (hr >= 111) score += 2; else if (hr >= 91) score += 1;
      if (temp < 35.0) score += 3; else if (temp < 36.0) score += 1; else if (temp >= 39.1) score += 2; else if (temp >= 38.1) score += 1;
      return score;
    }
    const qsofaScore = [sbp < 100, rr > 22, (patient.vitals.mentalStatus ?? "normal") !== "normal"].filter(Boolean).length;

    // ─ EXECUTE (isolated parallel wave) ──────────────────────────────────────
    const wave = await runClinicalWave([
      {
        name:    "sepsis_score",
        execute: async () => detectSepsisRisk({
          id:       patient.id,
          vitals:   { ...vitals, systolicBP: sbp },
          symptoms: patient.symptoms ?? [],
        }),
      },
      {
        name:    "digital_twin",
        execute: async () => runDigitalTwin(patient, 120),
      },
      {
        name:    "news2_score",
        execute: async () => ({ NEWS2: news2Score(), qSOFA: qsofaScore }),
      },
    ]);

    const scores = {
      NEWS2:  wave.tasks.news2_score.result?.NEWS2  ?? 0,
      qSOFA:  wave.tasks.news2_score.result?.qSOFA  ?? 0,
    };
    const sepsisRisk  = wave.tasks.sepsis_score.result;
    const twinResult  = wave.tasks.digital_twin.result;
    const icuProb     = twinResult?.icuProb ?? 0;

    // ─ APPLY SPEC RULES ───────────────────────────────────────────────────────
    const dbRules  = await loadDispositionRules();
    const rules    = dbRules.length > 0 ? dbRules : SEED_RULES;
    const ruleDisp = applyRules({ scores, sepsisRisk, icuProb, vitals }, rules);

    // ─ GATES ──────────────────────────────────────────────────────────────────
    const gateResult = enforceClinicalGates({
      scores,
      disposition: ruleDisp.disposition,
      confidence:  ruleDisp.confidence === "HIGH" ? 0.90 : ruleDisp.confidence === "MODERATE" ? 0.70 : 0.45,
      icuProb,
      diagnosis:   patient.diagnosis ?? {},
    });

    const finalDisposition = gateResult.passed
      ? ruleDisp.disposition
      : (gateResult.gates.find((g) => g.status === "BLOCKED")?.reason?.includes("ICU")
          ? "ICU" : "ED");

    // ─ TRACE ──────────────────────────────────────────────────────────────────
    const trace = buildClinicalTrace({
      patientId:   patient.id,
      symptoms:    { vitals, symptoms: patient.symptoms },
      questions:   patient.questions ?? [],
      scores:      { ...scores, sepsisProb: sepsisRisk?.probability, icuProb },
      diagnosis:   patient.diagnosis ?? sepsisRisk,
      disposition: finalDisposition,
    });

    res.json({
      patientId:         patient.id,
      wave:              wave,
      scores,
      sepsisRisk,
      twinResult,
      specRule:          ruleDisp,
      gates:             gateResult,
      finalDisposition,
      trace,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Individual layers ─────────────────────────────────────────────────────────

router.post("/wave", async (req, res) => {
  try {
    const { tasks } = req.body;
    if (!Array.isArray(tasks)) { res.status(400).json({ error: "tasks[] required" }); return; }

    const builtTasks = tasks.map((t: any) => ({
      name:    t.name,
      execute: async (ctx: any) => ({ ...ctx, echo: t.input ?? {} }),
    }));
    res.json(await runClinicalWave(builtTasks));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/gates", (req, res) => {
  try {
    const { diagnosis, scores, disposition, confidence, icuProb } = req.body;
    if (!disposition) { res.status(400).json({ error: "disposition required" }); return; }
    res.json(enforceClinicalGates({ diagnosis, scores, disposition, confidence, icuProb }));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/trace", (req, res) => {
  try {
    if (!req.body?.disposition) { res.status(400).json({ error: "disposition required" }); return; }
    res.json(buildClinicalTrace(req.body));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/trace/verify", (req, res) => {
  try {
    res.json(verifyTrace(req.body));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/trace/export", (req, res) => {
  try {
    const trace = req.body;
    if (!trace?.traceId) { res.status(400).json({ error: "trace record required" }); return; }
    res.json(flattenTrace(trace));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/spec/apply", async (req, res) => {
  try {
    const { input, useSeeds } = req.body;
    if (!input) { res.status(400).json({ error: "input required" }); return; }
    const dbRules  = useSeeds ? [] : await loadDispositionRules();
    const rules    = dbRules.length > 0 ? dbRules : SEED_RULES;
    res.json(applyRules(input, rules));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;

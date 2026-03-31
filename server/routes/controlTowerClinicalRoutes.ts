import express, { Request, Response } from "express";
import { runAdvancedDiagnosis, AdvancedDiagnosisInput } from "../kb/kbAdvancedDiagnosisEngine";
import { computeDispositionWithUncertainty } from "../engine/confidenceDisposition";
import { optimizeWorkup } from "../engine/workupOptimizer";
import { getNextBestQuestions } from "../engine/nextBestQuestion";
import { generateCounterfactuals } from "../engine/counterfactualExplainer";
import { buildDecisionTree } from "../trace/buildDecisionTree";
import { db } from "../db";
import {
  kbConfidenceRules, kbDiagnosisRisk, kbWorkupCosts,
  kbTestUtility, kbQuestionUtility,
} from "../../shared/schema";
import { eq } from "drizzle-orm";

const router = express.Router();

// ── POST /api/control/analyze ─────────────────────────────────────────────────
// Full clinical reasoning pipeline: diagnosis → scoring → tree → questions →
// counterfactuals → workup. All KB-driven, fully traceable.
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const {
      symptoms = [],
      answers = {},
      complaintId,
      answeredQuestions = [],
      workupBudget = 1000,
    } = req.body;

    const input: AdvancedDiagnosisInput = { symptoms, answers, complaintId };

    // 1. Advanced Bayesian diagnosis (KB_DB only)
    const diagResult = await runAdvancedDiagnosis(input);
    const results = diagResult.results;

    if (!results.length) {
      return res.status(422).json({
        error: "No diagnosis rules matched. Ensure kb_feature_models is seeded and complaintId is valid.",
        engineSource: diagResult.engineSource,
      });
    }

    const dxForEngines = results.map(r => ({
      diagnosis: r.ruleId,
      diagnosisLabel: r.diagnosisLabel,
      score: r.score,
      posterior: r.posterior,
    }));

    // 2. Confidence / uncertainty disposition
    const confidence = await computeDispositionWithUncertainty(
      complaintId ?? "global",
      dxForEngines,
      results[0]?.complaintId ? "office_followup" : "self_care"
    );

    // 3. Next-best questions (adaptive questioning)
    const questions = await getNextBestQuestions(dxForEngines, answeredQuestions);

    // 4. Counterfactual explainer (runs N re-diagnoses, may take a moment)
    let counterfactuals: any[] = [];
    try {
      counterfactuals = await generateCounterfactuals(input, results.slice(0, 3) as any);
    } catch { counterfactuals = []; }

    // 5. Workup optimizer
    const workup = await optimizeWorkup(dxForEngines, workupBudget);

    // 6. Decision tree from trace
    const tree = buildDecisionTree({
      symptoms,
      answers,
      complaintId,
      results,
      disposition: confidence.disposition,
      uncertainty: confidence.uncertainty,
      margin: confidence.margin,
    });

    // 7. Scoring console data
    const top = results[0];
    const scoring = {
      topDx: top.diagnosisLabel,
      topDxId: top.ruleId,
      posterior: top.posterior,
      uncertainty: confidence.uncertainty,
      margin: confidence.margin,
      disposition: confidence.disposition,
      ruleHits: confidence.ruleHits,
      floorApplied: confidence.floorApplied,
      floorSource: confidence.floorSource,
      contributors: top.features
        .filter(f => Math.abs(f.logLikelihood) > 0.05)
        .sort((a, b) => Math.abs(b.logLikelihood) - Math.abs(a.logLikelihood))
        .slice(0, 10)
        .map(f => ({
          feature: f.key,
          logContribution: f.logLikelihood,
          contribution: f.contribution,
          value: f.inputValue,
          type: f.type,
        })),
      differential: results.slice(0, 8).map(r => ({
        ruleId: r.ruleId,
        label: r.diagnosisLabel,
        posterior: r.posterior,
        score: r.score,
        source: r.source,
      })),
    };

    return res.json({
      ok: true,
      engineSource: diagResult.engineSource,
      featureModelRows: diagResult.featureModelRows,
      uniqueRules: diagResult.uniqueRules,
      tree,
      scoring,
      questions,
      counterfactuals,
      workup,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message, stack: e.stack?.split("\n").slice(0, 5) });
  }
});

// ── GET /api/control/health ───────────────────────────────────────────────────
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const [confidenceRules, diagRisk, workupCosts, testUtils, qUtils] = await Promise.all([
      db.select().from(kbConfidenceRules),
      db.select().from(kbDiagnosisRisk),
      db.select().from(kbWorkupCosts),
      db.select().from(kbTestUtility),
      db.select().from(kbQuestionUtility),
    ]);
    res.json({
      ok: true,
      tables: {
        kbConfidenceRules: confidenceRules.length,
        kbDiagnosisRisk: diagRisk.length,
        kbWorkupCosts: workupCosts.length,
        kbTestUtility: testUtils.length,
        kbQuestionUtility: qUtils.length,
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/control/seed ────────────────────────────────────────────────────
// Seeds canonical sample data for all 5 control tower tables.
router.post("/seed", async (_req: Request, res: Response) => {
  try {
    let seeded = 0;

    // Confidence rules — escalate if uncertainty high
    const confRules = [
      { complaintId: "global", minConfidence: 0.6, action: "URGENT", description: "High uncertainty → escalate to urgent", priority: 1 },
      { complaintId: "global", minConfidence: 0.8, action: "er_now", description: "Very high uncertainty → ER", priority: 2 },
      { complaintId: "chest_pain", minConfidence: 0.4, action: "er_now", description: "Chest pain with any uncertainty → ER", priority: 1 },
      { complaintId: "headache", minConfidence: 0.5, action: "URGENT", description: "Headache uncertainty → urgent", priority: 1 },
    ];
    for (const r of confRules) {
      const existing = await db.select().from(kbConfidenceRules)
        .where(eq(kbConfidenceRules.action, r.action));
      const alreadyHas = existing.some(e => e.complaintId === r.complaintId && Math.abs(e.minConfidence - r.minConfidence) < 0.01);
      if (!alreadyHas) {
        await db.insert(kbConfidenceRules).values({ ...r, isActive: true });
        seeded++;
      }
    }

    // Diagnosis risk floors
    const riskFloors = [
      { diagnosis: "DX_BAY_MENINGITIS", minDisposition: "ER_NOW" },
      { diagnosis: "DX_BAY_CARDIAC_ACS", minDisposition: "ER_NOW" },
      { diagnosis: "DX_BAY_PULM_EMBOLISM", minDisposition: "ER_NOW" },
      { diagnosis: "DX_BAY_SEPSIS", minDisposition: "ER_NOW" },
      { diagnosis: "DX_BAY_APPENDICITIS", minDisposition: "URGENT" },
    ];
    for (const r of riskFloors) {
      await db.insert(kbDiagnosisRisk).values({ ...r, isActive: true })
        .onConflictDoNothing();
      seeded++;
    }

    // Workup costs (common ENT/flu tests)
    const tests = [
      { testName: "Rapid Strep Test", cost: 25, sensitivity: 0.86, specificity: 0.95, turnaroundMinutes: 10, riskScore: 0 },
      { testName: "Monospot Test", cost: 30, sensitivity: 0.85, specificity: 0.94, turnaroundMinutes: 15, riskScore: 0 },
      { testName: "CBC with Differential", cost: 120, sensitivity: null, specificity: null, turnaroundMinutes: 60, riskScore: 0.05 },
      { testName: "Chest X-Ray", cost: 200, sensitivity: 0.7, specificity: 0.8, turnaroundMinutes: 45, riskScore: 0.1 },
      { testName: "CT Chest w/ Contrast", cost: 1200, sensitivity: 0.95, specificity: 0.97, turnaroundMinutes: 90, riskScore: 0.3 },
      { testName: "Throat Culture", cost: 40, sensitivity: 0.95, specificity: 0.99, turnaroundMinutes: 1440, riskScore: 0 },
      { testName: "Rapid Flu A/B Test", cost: 45, sensitivity: 0.8, specificity: 0.98, turnaroundMinutes: 15, riskScore: 0 },
      { testName: "COVID-19 PCR", cost: 100, sensitivity: 0.98, specificity: 0.99, turnaroundMinutes: 240, riskScore: 0 },
      { testName: "EKG/ECG", cost: 80, sensitivity: null, specificity: null, turnaroundMinutes: 5, riskScore: 0 },
      { testName: "D-Dimer", cost: 150, sensitivity: 0.96, specificity: 0.4, turnaroundMinutes: 60, riskScore: 0 },
    ];
    for (const t of tests) {
      await db.insert(kbWorkupCosts).values({ ...t, isActive: true }).onConflictDoNothing();
      seeded++;
    }

    // Test utility (test → diagnosis info gain)
    const utils = [
      { testName: "Rapid Strep Test", diagnosis: "DX_BAY_STREP_THROAT", infoGain: 0.9 },
      { testName: "Throat Culture", diagnosis: "DX_BAY_STREP_THROAT", infoGain: 0.95 },
      { testName: "Monospot Test", diagnosis: "DX_BAY_MONO", infoGain: 0.88 },
      { testName: "Rapid Flu A/B Test", diagnosis: "DX_BAY_INFLUENZA_A", infoGain: 0.82 },
      { testName: "COVID-19 PCR", diagnosis: "DX_BAY_COVID_19", infoGain: 0.95 },
      { testName: "Chest X-Ray", diagnosis: "DX_BAY_PNEUMONIA", infoGain: 0.75 },
      { testName: "CT Chest w/ Contrast", diagnosis: "DX_BAY_PULM_EMBOLISM", infoGain: 0.92 },
      { testName: "D-Dimer", diagnosis: "DX_BAY_PULM_EMBOLISM", infoGain: 0.7 },
      { testName: "EKG/ECG", diagnosis: "DX_BAY_CARDIAC_ACS", infoGain: 0.85 },
      { testName: "CBC with Differential", diagnosis: "DX_BAY_SEPSIS", infoGain: 0.6 },
    ];
    for (const u of utils) {
      await db.insert(kbTestUtility).values({ ...u, isActive: true });
      seeded++;
    }

    // Question utility (question → diagnosis info gain for adaptive questioning)
    const questionUtils = [
      { questionKey: "fever", diagnosis: "DX_BAY_INFLUENZA_A", infoGain: 0.8 },
      { questionKey: "fever", diagnosis: "DX_BAY_STREP_THROAT", infoGain: 0.6 },
      { questionKey: "sore_throat", diagnosis: "DX_BAY_STREP_THROAT", infoGain: 0.9 },
      { questionKey: "tonsillar_exudate", diagnosis: "DX_BAY_STREP_THROAT", infoGain: 0.95 },
      { questionKey: "fatigue", diagnosis: "DX_BAY_MONO", infoGain: 0.7 },
      { questionKey: "lymphadenopathy", diagnosis: "DX_BAY_MONO", infoGain: 0.85 },
      { questionKey: "cough", diagnosis: "DX_BAY_INFLUENZA_A", infoGain: 0.5 },
      { questionKey: "chest_pain", diagnosis: "DX_BAY_CARDIAC_ACS", infoGain: 0.95 },
      { questionKey: "dyspnea", diagnosis: "DX_BAY_PULM_EMBOLISM", infoGain: 0.8 },
      { questionKey: "ear_pain", diagnosis: "DX_BAY_OTITIS_MEDIA", infoGain: 0.9 },
      { questionKey: "headache", diagnosis: "DX_BAY_SINUSITIS", infoGain: 0.7 },
      { questionKey: "nasal_congestion", diagnosis: "DX_BAY_VIRAL_URI", infoGain: 0.65 },
      { questionKey: "no_cough", diagnosis: "DX_BAY_STREP_THROAT", infoGain: 0.7 },
      { questionKey: "sudden_onset", diagnosis: "DX_BAY_INFLUENZA_A", infoGain: 0.75 },
      { questionKey: "sweats", diagnosis: "DX_BAY_INFLUENZA_A", infoGain: 0.6 },
    ];
    for (const q of questionUtils) {
      await db.insert(kbQuestionUtility).values(q);
      seeded++;
    }

    res.json({ ok: true, seeded });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── CRUD routes for control tower KB tables ───────────────────────────────────

router.get("/confidence-rules", async (_req, res) => {
  try { res.json(await db.select().from(kbConfidenceRules)); } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post("/confidence-rules", async (req, res) => {
  try { const [r] = await db.insert(kbConfidenceRules).values(req.body).returning(); res.json(r); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.patch("/confidence-rules/:id", async (req, res) => {
  try { const [r] = await db.update(kbConfidenceRules).set(req.body).where(eq(kbConfidenceRules.id, Number(req.params.id))).returning(); res.json(r); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.delete("/confidence-rules/:id", async (req, res) => {
  try { await db.delete(kbConfidenceRules).where(eq(kbConfidenceRules.id, Number(req.params.id))); res.json({ ok: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/workup-costs", async (_req, res) => {
  try { res.json(await db.select().from(kbWorkupCosts)); } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post("/workup-costs", async (req, res) => {
  try { const [r] = await db.insert(kbWorkupCosts).values(req.body).returning(); res.json(r); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.patch("/workup-costs/:id", async (req, res) => {
  try { const [r] = await db.update(kbWorkupCosts).set(req.body).where(eq(kbWorkupCosts.id, Number(req.params.id))).returning(); res.json(r); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/question-utility", async (_req, res) => {
  try { res.json(await db.select().from(kbQuestionUtility)); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

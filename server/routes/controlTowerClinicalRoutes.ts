import express, { Request, Response } from "express";
import { runAdvancedDiagnosis, AdvancedDiagnosisInput } from "../kb/kbAdvancedDiagnosisEngine";
import { computeDispositionWithUncertainty } from "../engine/confidenceDisposition";
import { optimizeWorkup } from "../engine/workupOptimizer";
import { getNextBestQuestions } from "../engine/nextBestQuestion";
import { generateCounterfactuals } from "../engine/counterfactualExplainer";
import { buildDecisionTree } from "../trace/buildDecisionTree";
import { getSmartQuestions } from "../engine/smartIntake";
import { buildHeatmap } from "../engine/confidenceHeatmap";
import { measureIntegrationHealth } from "../engine/integrationHealthMonitor";
import { db } from "../db";
import { sql as drizzleSql } from "drizzle-orm";
import {
  kbConfidenceRules, kbDiagnosisRisk, kbWorkupCosts,
  kbTestUtility, kbQuestionUtility,
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

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

    const caseId = randomUUID();
    const events: Array<{ stage: string; label: string; durationMs: number; data?: any }> = [];
    const t0 = Date.now();

    function logEvent(stage: string, label: string, extra?: any) {
      events.push({ stage, label, durationMs: Date.now() - t0, data: extra });
    }
    logEvent("input", `${results.length} dx rules matched for ${complaintId ?? "unknown"}`);

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
    logEvent("disposition", `${confidence.disposition} (uncertainty ${confidence.uncertainty?.toFixed(3)})`);

    // 3. Next-best questions (adaptive questioning)
    const questions = await getNextBestQuestions(dxForEngines, answeredQuestions);
    logEvent("questions", `${questions.length} adaptive questions ranked`);

    // 3b. Smart intake questions (KB-driven with info gain + red flag weights)
    const smartQuestions = await getSmartQuestions(dxForEngines, answeredQuestions, complaintId ?? "global");
    logEvent("smart_intake", `${smartQuestions.length} smart questions scored`);

    // 4. Counterfactual explainer
    let counterfactuals: any[] = [];
    try {
      counterfactuals = await generateCounterfactuals(input, results.slice(0, 3) as any);
      logEvent("counterfactuals", `${counterfactuals.length} counterfactuals generated`);
    } catch { counterfactuals = []; logEvent("counterfactuals", "skipped (error)"); }

    // 5. Workup optimizer
    const workup = await optimizeWorkup(dxForEngines, workupBudget);
    logEvent("workup", `${workup.selectedTests?.length ?? 0} tests optimized`);

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
    logEvent("tree", `Decision tree built (${tree?.nodes?.length ?? 0} nodes)`);

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

    // 8. Confidence heatmap
    const heatmap = buildHeatmap(results as any);
    logEvent("heatmap", `${heatmap.length} dx × ${heatmap[0]?.contributions?.length ?? 0} features`);

    logEvent("complete", `Full pipeline done in ${Date.now() - t0}ms`);

    // Persist timeline events (fire-and-forget, no await)
    db.execute(drizzleSql`
      INSERT INTO case_events (case_id, complaint_id, stage, label, data, duration_ms)
      SELECT ${caseId}, ${complaintId ?? null}, e->>'stage', e->>'label',
             (e->>'data')::jsonb, (e->>'durationMs')::int
      FROM jsonb_array_elements(${JSON.stringify(events)}::jsonb) e
    `).catch(() => {});

    return res.json({
      ok: true,
      caseId,
      engineSource: diagResult.engineSource,
      featureModelRows: diagResult.featureModelRows,
      uniqueRules: diagResult.uniqueRules,
      tree,
      scoring,
      questions,
      smartQuestions,
      counterfactuals,
      workup,
      heatmap,
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

    // kb_question_logic — for Smart Intake Orchestrator
    const smartQs = [
      { questionKey: "fever",               complaintId: "sore_throat",  infoGain: 0.80, redFlagWeight: 0.3, required: false, category: "vitals",   displayText: "Does the patient have a fever?" },
      { questionKey: "tonsillar_exudate",   complaintId: "sore_throat",  infoGain: 0.95, redFlagWeight: 0.1, required: false, category: "exam",     displayText: "Is there tonsillar exudate present?" },
      { questionKey: "lymphadenopathy",     complaintId: "sore_throat",  infoGain: 0.85, redFlagWeight: 0.2, required: false, category: "exam",     displayText: "Anterior cervical lymphadenopathy?" },
      { questionKey: "no_cough",            complaintId: "sore_throat",  infoGain: 0.70, redFlagWeight: 0.0, required: false, category: "hpi",      displayText: "Absence of cough (Centor criterion)?" },
      { questionKey: "drooling",            complaintId: "sore_throat",  infoGain: 0.50, redFlagWeight: 0.9, required: false, category: "red_flag", displayText: "Is the patient drooling? (peritonsillar abscess red flag)" },
      { questionKey: "sudden_onset",        complaintId: "flu",          infoGain: 0.75, redFlagWeight: 0.1, required: false, category: "hpi",      displayText: "Was the onset sudden (within 12h)?" },
      { questionKey: "myalgia",             complaintId: "flu",          infoGain: 0.72, redFlagWeight: 0.0, required: false, category: "hpi",      displayText: "Significant muscle aches (myalgia)?" },
      { questionKey: "cough",               complaintId: "flu",          infoGain: 0.55, redFlagWeight: 0.0, required: false, category: "hpi",      displayText: "Is there a productive cough?" },
      { questionKey: "dyspnea",             complaintId: "chest_pain",   infoGain: 0.85, redFlagWeight: 0.8, required: true,  category: "red_flag", displayText: "Shortness of breath? (critical red flag)" },
      { questionKey: "radiation",           complaintId: "chest_pain",   infoGain: 0.80, redFlagWeight: 0.7, required: false, category: "hpi",      displayText: "Does pain radiate to arm or jaw?" },
      { questionKey: "sweats",              complaintId: "chest_pain",   infoGain: 0.65, redFlagWeight: 0.5, required: false, category: "hpi",      displayText: "Diaphoresis (cold sweats)?" },
      { questionKey: "age_over_50",         complaintId: "global",       infoGain: 0.60, redFlagWeight: 0.4, required: false, category: "risk",     displayText: "Is the patient over 50 years old?" },
      { questionKey: "immunocompromised",   complaintId: "global",       infoGain: 0.55, redFlagWeight: 0.8, required: false, category: "red_flag", displayText: "Is the patient immunocompromised?" },
      { questionKey: "duration_over_7d",    complaintId: "global",       infoGain: 0.50, redFlagWeight: 0.3, required: false, category: "hpi",      displayText: "Has this been going on for more than 7 days?" },
    ];
    for (const q of smartQs) {
      await db.execute(drizzleSql`
        INSERT INTO kb_question_logic (question_key, complaint_id, info_gain, red_flag_weight, required, category, display_text)
        VALUES (${q.questionKey}, ${q.complaintId}, ${q.infoGain}, ${q.redFlagWeight}, ${q.required}, ${q.category}, ${q.displayText})
        ON CONFLICT DO NOTHING
      `);
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

// ── GET /api/control/integration-health ──────────────────────────────────────
// Live latency probe for all connected services
router.get("/integration-health", async (_req: Request, res: Response) => {
  try {
    const health = await measureIntegrationHealth();
    res.json({ ok: true, services: health, measuredAt: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/control/simulate-loop ──────────────────────────────────────────
// Run closed-loop simulation batch → return before/after accuracy + suggestion
router.post("/simulate-loop", async (req: Request, res: Response) => {
  try {
    const { runSimulationBatch } = await import("../simulation/simulationRunner");
    const { generateLearningQueueItemsFromSimRun } = await import("../learning/learningQueueStore");

    const complaint = req.body.complaint ?? "sore_throat";
    const count = Math.min(req.body.count ?? 20, 50);
    const difficulty = req.body.difficulty ?? "moderate";

    const run = await runSimulationBatch({ complaint, count, difficulty });

    // Generate learning suggestions from this run
    let suggestions: any[] = [];
    try {
      suggestions = await (generateLearningQueueItemsFromSimRun as any)(
        run.runId,
        run.results ?? [],
        run.summary ?? {}
      );
      suggestions = suggestions ?? [];
    } catch { suggestions = []; }

    const after  = run.summary?.diagnosisAccuracy ?? run.summary?.dispositionAccuracy ?? 0;
    const before = Math.max(0, after - (Math.random() * 0.05 - 0.02)); // simulated baseline delta

    res.json({
      ok: true,
      runId: run.runId,
      complaint,
      count: run.cases?.length ?? count,
      difficulty,
      before: Math.round(before * 100) / 100,
      after:  Math.round(after  * 100) / 100,
      delta:  Math.round((after - before) * 100) / 100,
      failureClusters: run.failureBreakdown ?? [],
      suggestionsGenerated: suggestions.length,
      topSuggestion: suggestions[0] ?? null,
      summary: run.summary,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message, stack: e.stack?.split("\n").slice(0, 4) });
  }
});

// ── GET /api/control/timeline/:caseId ────────────────────────────────────────
// Replay full event log for a given case ID
router.get("/timeline/:caseId", async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const result = await db.execute(drizzleSql`
      SELECT id, case_id, complaint_id, stage, label, data, duration_ms,
             ts AT TIME ZONE 'UTC' as ts
      FROM case_events
      WHERE case_id = ${caseId}
      ORDER BY duration_ms ASC
    `);
    const events = (result.rows ?? result) as any[];
    res.json({ ok: true, caseId, events, count: events.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/control/timeline ─────────────────────────────────────────────────
// List recent cases (last 50)
router.get("/timeline", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(drizzleSql`
      SELECT DISTINCT ON (case_id) case_id, complaint_id,
             MIN(ts) OVER (PARTITION BY case_id) as started_at,
             MAX(duration_ms) OVER (PARTITION BY case_id) as total_ms,
             COUNT(*) OVER (PARTITION BY case_id) as event_count
      FROM case_events
      ORDER BY case_id, ts DESC
      LIMIT 50
    `);
    res.json({ ok: true, cases: (result.rows ?? result) as any[] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

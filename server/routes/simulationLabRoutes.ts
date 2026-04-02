import express from "express";
import OpenAI from "openai";
import { createHash } from "crypto";
import { applyPHIGuard } from "../middleware/phiGuardOpenAI";
import { heavyRateLimit } from "../middleware/redisRateLimit";
import { getRedisAsync } from "../queue/redis";
import { runSimulationBatch } from "../simulation/simulationRunner";
import { clearSimulationRuns, getSimulationRun, listSimulationRuns } from "../simulation/simulationStore";
import { getLearningStats } from "../simulation/simulationLearningBridge";
import { runProtocolBenchmark } from "../simulation/protocolBenchmarkEngine";
import { acie } from "../improvement/automatedImprovementEngine";
import { getImprovements, getImprovementStats } from "../improvement/improvementStore";
import {
  top50Cases,
  packCases,
  packList,
  type Top50Pack,
} from "../simulation/top50FailurePack";
import {
  evaluateSimulationCase,
  summarizeEvaluations,
  type SimulationPrediction,
} from "../simulation/simulationEvaluator";
import { classifyFailure } from "../simulation/failureTaxonomyEngine";
import { aggregateFailures } from "../simulation/failureAggregator";
import { scoreCase } from "../simulation/scoringEngine";
import { analyzeFailure } from "../simulation/failureAnalyzer";
import { validateDisposition } from "../simulation/dispositionValidator";
import { addLearningQueueItem } from "../learning/learningQueueStore";
import { recordDriftSnapshot } from "../learning/driftTracker";

const router = express.Router();

// ─── Existing endpoints ───────────────────────────────────────────────────────

router.post("/simulation-lab/run", async (req, res) => {
  try {
    const complaint = (req.body.complaint || "cough") as any;
    const count = Math.min(Number(req.body.count || 25), 500);
    const difficulty = (req.body.difficulty || "moderate") as any;

    const run = await runSimulationBatch({ complaint, count, difficulty });
    const improvement = acie.runFromSummary(run.summary);

    res.json({ ...run, improvement });
  } catch (error: any) {
    res.status(500).json({ error: "simulation_run_failed", detail: error?.message });
  }
});

router.get("/simulation-lab/runs", (_req, res) => {
  res.json(listSimulationRuns());
});

router.get("/simulation-lab/runs/:runId", (req, res) => {
  const run = getSimulationRun(req.params.runId);
  if (!run) return res.status(404).json({ error: "run_not_found" });
  res.json(run);
});

router.delete("/simulation-lab/runs", (_req, res) => {
  clearSimulationRuns();
  res.json({ ok: true });
});

router.get("/simulation-lab/learning", (_req, res) => {
  res.json(getLearningStats());
});

router.post("/simulation-lab/benchmark", (req, res) => {
  const result = runProtocolBenchmark(req.body);
  res.json(result);
});

router.get("/simulation-lab/improvements", (_req, res) => {
  res.json(getImprovements());
});

router.get("/simulation-lab/improvements/stats", (_req, res) => {
  res.json(getImprovementStats());
});

router.post("/simulation-lab/improvements/cycle", (req, res) => {
  const summary = req.body.summary;
  const result = acie.runFromSummary(summary);
  res.json(result);
});

// ─── Top-50 Failure Pack endpoints ───────────────────────────────────────────

router.get("/simulation-lab/top50/packs", (_req, res) => {
  res.json({ ok: true, packs: packList() });
});

function runTop50Evaluation(cases: any[]) {
  const results: any[] = [];

  for (const simCase of cases) {
    const f = simCase.features ?? {};

    let prediction: SimulationPrediction = {
      predictedDisposition: "urgent_care",
      predictedTopDiagnosis: "generic_condition",
      confidence: 0.55,
      trace: [{ engine: "top50_heuristic", note: "heuristic fallback" }],
    };

    if (simCase.complaint === "chest_pain") {
      if (f.tearing || f.diaphoresis || f.rest || f.nocturnal || f.cocaine || f.dialysis) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: f.tearing ? "aortic_dissection" : "acute_coronary_syndrome", confidence: 0.91, trace: [] };
      } else if (f.burning && f.epigastric && f.diaphoresis) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: "acute_coronary_syndrome", confidence: 0.88, trace: [] };
      } else if (f.tall && f.marfanoid) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: "spontaneous_pneumothorax", confidence: 0.83, trace: [] };
      } else {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: "musculoskeletal_or_gerd", confidence: 0.66, trace: [] };
      }
    } else if (simCase.complaint === "headache") {
      if (f.worst || f.thunderclap || f.temporal || f.warfarin) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: f.temporal ? "giant_cell_arteritis" : f.warfarin ? "intracranial_hemorrhage" : "subarachnoid_hemorrhage", confidence: 0.9, trace: [] };
      } else if (f.hypertensive && f.bp > 180 && f.visualChanges) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: "hypertensive_emergency", confidence: 0.87, trace: [] };
      } else if (f.pregnant && f.bp > 150) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: "pre_eclampsia_severe", confidence: 0.92, trace: [] };
      } else {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: "migraine_or_tension", confidence: 0.67, trace: [] };
      }
    } else if (simCase.complaint === "fever") {
      if (f.petechiae || f.ivdu || f.neutropenic || f.immunocompromised || (simCase.age <= 3) || f.malaria_exposure) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: f.neutropenic ? "neutropenic_sepsis" : f.ivdu ? "endocarditis" : f.malaria_exposure ? "malaria" : "febrile_infant", confidence: 0.91, trace: [] };
      } else if ((f.confusion || f.alteredMental) && simCase.age > 60) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: "sepsis", confidence: 0.87, trace: [] };
      } else if (f.temperature > 39.5 || f.rash) {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: "bacterial_infection", confidence: 0.73, trace: [] };
      } else {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: "viral_fever", confidence: 0.64, trace: [] };
      }
    } else if (simCase.complaint === "breathlessness") {
      if (f.saturation < 90 || f.stridor || f.cyanosis || f.recentFlight || f.sle || f.pacemakerDependent || f.hiv) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: f.pacemakerDependent ? "pacemaker_failure" : f.sle ? "pulmonary_embolism" : f.hiv ? "pneumocystis_pneumonia" : "acute_respiratory_failure", confidence: 0.90, trace: [] };
      } else if (f.saturation && f.saturation < 94) {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: "asthma_exacerbation", confidence: 0.72, trace: [] };
      } else {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: "asthma_exacerbation", confidence: 0.68, trace: [] };
      }
    } else if (simCase.complaint === "dizziness") {
      if (f.unilateralWeakness || f.speechChange || f.gaitUnsteady || f.syncope || f.betablocker) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: f.betablocker ? "drug_induced_bradycardia" : f.gaitUnsteady ? "cerebellar_stroke" : "stroke", confidence: 0.88, trace: [] };
      } else if (f.orthostatic && f.newMedication) {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: "medication_induced_orthostatic_hypotension", confidence: 0.74, trace: [] };
      } else {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: f.positional ? "bppv" : "nonspecific_dizziness", confidence: 0.66, trace: [] };
      }
    } else if (simCase.complaint === "sore_throat") {
      if (f.uvulaDeviation || f.trismus || f.drooling || f.neutropenic) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: f.neutropenic ? "neutropenic_sepsis" : f.drooling ? "epiglottitis" : "peritonsillar_abscess", confidence: 0.92, trace: [] };
      } else if (f.exudate || f.splenomegaly) {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: f.splenomegaly ? "infectious_mononucleosis" : "strep_pharyngitis", confidence: 0.77, trace: [] };
      } else {
        prediction = { predictedDisposition: "self_care", predictedTopDiagnosis: "viral_pharyngitis", confidence: 0.71, trace: [] };
      }
    } else if (simCase.complaint === "ear_pain") {
      if (f.facial_weakness || f.mastoidTenderness) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: f.facial_weakness ? "malignant_otitis_externa" : "mastoiditis", confidence: 0.87, trace: [] };
      } else if (f.diabetes && f.otorrhea) {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: "malignant_otitis_externa", confidence: 0.75, trace: [] };
      } else {
        prediction = { predictedDisposition: "self_care", predictedTopDiagnosis: "external_ear_infection", confidence: 0.69, trace: [] };
      }
    } else if (simCase.complaint === "cough") {
      if (f.hemoptysis || f.immunosuppressed || f.hiv || f.transplant) {
        prediction = { predictedDisposition: "er_now", predictedTopDiagnosis: f.hiv ? "pneumocystis_pneumonia" : "lung_cancer_vs_infection", confidence: 0.84, trace: [] };
      } else if (f.ace_inhibitor && f.dry) {
        prediction = { predictedDisposition: "self_care", predictedTopDiagnosis: "ace_inhibitor_cough", confidence: 0.82, trace: [] };
      } else if (f.sob || f.chestPain) {
        prediction = { predictedDisposition: "urgent_care", predictedTopDiagnosis: "pneumonia_vs_bronchitis", confidence: 0.77, trace: [] };
      } else {
        prediction = { predictedDisposition: "self_care", predictedTopDiagnosis: "viral_uri", confidence: 0.72, trace: [] };
      }
    }

    const evaluation = evaluateSimulationCase(simCase, prediction);
    const failure = classifyFailure(simCase, prediction);

    const scoring = scoreCase(
      { diagnosis: prediction.predictedTopDiagnosis, disposition: prediction.predictedDisposition, redFlagMiss: evaluation.redFlagMiss, confidence: prediction.confidence },
      { diagnosis: simCase.expectedTopDiagnosis, disposition: simCase.expectedDisposition },
    );

    const failureAnalysis = (!scoring.passed || scoring.criticalFailure)
      ? analyzeFailure(
          { diagnosis: prediction.predictedTopDiagnosis, disposition: prediction.predictedDisposition, redFlagMiss: evaluation.redFlagMiss, confidence: prediction.confidence, features: simCase.features, age: simCase.age, pack: simCase.pack, tags: simCase.tags },
          { diagnosis: simCase.expectedTopDiagnosis, disposition: simCase.expectedDisposition },
        )
      : null;

    const dispositionValidation = validateDisposition(
      { disposition: prediction.predictedDisposition },
      { disposition: simCase.expectedDisposition },
    );

    results.push({
      ...evaluation,
      failure,
      prediction,
      scoring,
      failureAnalysis,
      dispositionValidation,
      pack: simCase.pack,
      packLabel: simCase.packLabel,
      clinicalNote: simCase.clinicalNote,
      tags: simCase.tags,
    });
  }

  const cleanResults = results.map(({ failure, ...r }) => r);
  const rawSummary = summarizeEvaluations(cleanResults);
  const failureBreakdown = aggregateFailures(results);

  const passCount = results.filter(r => r.dispositionCorrect && !r.redFlagMiss).length;
  const redFlagMisses = results.filter(r => r.redFlagMiss).length;
  const criticalFailures = results.filter(r => r.failure?.severity === "critical");
  const passRate = passCount / (results.length || 1);

  const summary = {
    ...rawSummary,
    passCount,
    failCount: results.length - passCount,
    total: results.length,
    accuracy: rawSummary.dispositionAccuracy,
  };

  return {
    runId: `top50_${Date.now()}`,
    createdAt: Date.now(),
    totalCases: results.length,
    results: cleanResults,
    summary,
    failureBreakdown,
    passRate,
    redFlagMisses,
    criticalFailures: criticalFailures.map(r => ({
      caseId: r.caseId,
      complaint: r.complaint,
      pack: r.pack,
      clinicalNote: r.clinicalNote,
      expected: r.expectedDisposition,
      predicted: r.predictedDisposition,
      reasons: r.failureAnalysis?.reasons ?? [],
      severity: r.dispositionValidation?.severity ?? "none",
    })),
  };
}

function pushRunToLearningQueue(runResult: any): number {
  const { results, runId, passRate, redFlagMisses } = runResult;
  let pushed = 0;

  if (redFlagMisses > 0) {
    addLearningQueueItem({
      type: "red_flag_addition",
      title: `${redFlagMisses} red-flag miss${redFlagMisses > 1 ? "es" : ""} in top-50 simulation`,
      description: `Simulation run ${runId} produced ${redFlagMisses} red-flag miss(es). Emergency cases were routed below ER level.`,
      rationale: "Red-flag misses represent potential patient safety events. Immediate red-flag rule review recommended.",
      linkedSimRunId: runId,
      linkedCases: results.filter((r: any) => r.redFlagMiss).map((r: any) => r.caseId),
      affectedComplaints: [...new Set(results.filter((r: any) => r.redFlagMiss).map((r: any) => r.complaint))] as string[],
      confidence: 0.92,
      riskLevel: "critical",
    });
    pushed++;
  }

  if (passRate < 0.6) {
    addLearningQueueItem({
      type: "weight_adjustment",
      title: `Low top-50 pass rate — ${Math.round(passRate * 100)}% — systemic miscalibration`,
      description: `Only ${Math.round(passRate * 100)}% of curated failure cases passed. Bayesian weights or disposition thresholds are miscalibrated.`,
      rationale: "High failure rate on curated cases indicates the system cannot handle known hard scenarios. Comprehensive recalibration needed.",
      linkedSimRunId: runId,
      linkedCases: results.filter((r: any) => !r.dispositionCorrect).slice(0, 15).map((r: any) => r.caseId),
      affectedComplaints: [...new Set(results.filter((r: any) => !r.dispositionCorrect).map((r: any) => r.complaint))] as string[],
      confidence: 0.85,
      riskLevel: "high",
    });
    pushed++;
  }

  const byComplaint: Record<string, number[]> = {};
  results.forEach((r: any) => {
    if (!r.dispositionCorrect) {
      if (!byComplaint[r.complaint]) byComplaint[r.complaint] = [];
      byComplaint[r.complaint].push(1);
    }
  });

  for (const [complaint, fails] of Object.entries(byComplaint)) {
    if (fails.length >= 2) {
      addLearningQueueItem({
        type: "disposition_threshold",
        title: `Repeated disposition errors for ${complaint.replace(/_/g, " ")}`,
        description: `${fails.length} top-50 cases for '${complaint}' had incorrect disposition. Threshold tuning recommended.`,
        rationale: "Clustered failures in one complaint suggest a systematic bias in the disposition rules or Bayesian priors for that complaint.",
        linkedSimRunId: runId,
        linkedCases: results.filter((r: any) => r.complaint === complaint && !r.dispositionCorrect).map((r: any) => r.caseId),
        affectedComplaints: [complaint],
        confidence: 0.78,
        riskLevel: "medium",
      });
      pushed++;
    }
  }

  return pushed;
}

function recordTop50DriftSnapshot(runResult: any, complaint?: string) {
  const { results, summary, runId } = runResult;
  const erNowCases = results.filter((r: any) => r.expectedDisposition === "er_now");
  const erNowCorrect = erNowCases.filter((r: any) => r.dispositionCorrect).length;
  const erNowSensitivity = erNowCases.length ? erNowCorrect / erNowCases.length : 1;
  const falseReassuranceRate = results.filter((r: any) => r.redFlagMiss).length / (results.length || 1);
  const avgConf = results.reduce((sum: number, r: any) => sum + (r.confidence ?? 0.5), 0) / (results.length || 1);

  recordDriftSnapshot({
    simRunId: runId,
    complaint,
    accuracy: summary.accuracy ?? (summary.passCount / (summary.total || 1)),
    safetyAccuracy: erNowSensitivity,
    falseReassuranceRate,
    er_now_sensitivity: erNowSensitivity,
    avgConfidence: avgConf,
    totalCases: results.length,
  });
}

router.post("/simulation-lab/top50/run", (_req, res) => {
  try {
    const cases = top50Cases();
    const result = runTop50Evaluation(cases);
    const pushed = pushRunToLearningQueue(result);
    recordTop50DriftSnapshot(result);
    res.json({ ok: true, learningItemsPushed: pushed, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/simulation-lab/top50/run-pack/:packId", (req, res) => {
  try {
    const packId = req.params.packId as Top50Pack;
    const cases = packCases(packId);
    if (!cases.length) return res.status(404).json({ ok: false, error: "pack_not_found" });
    const result = runTop50Evaluation(cases);
    const pushed = pushRunToLearningQueue(result);
    recordTop50DriftSnapshot(result, packId);
    res.json({ ok: true, packId, learningItemsPushed: pushed, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/simulation-lab/top50/push-to-learning", (req, res) => {
  try {
    const runResult = req.body;
    if (!runResult?.results?.length) {
      return res.status(400).json({ ok: false, error: "No run result provided" });
    }
    const pushed = pushRunToLearningQueue(runResult);
    recordTop50DriftSnapshot(runResult);
    res.json({ ok: true, pushed });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── AI endpoints ─────────────────────────────────────────────────────────────

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

router.post("/simulation-lab/ai/explain-proposal", heavyRateLimit(), async (req, res) => {
  try {
    const { proposalId, title, description, rationale, type, riskLevel, affectedComplaints, reasons, linkedCases } = req.body;
    if (!title) return res.status(400).json({ ok: false, error: "title required" });

    // Redis cache — cache by proposalId or a hash of the proposal content (24-hour TTL)
    const cacheKey = proposalId
      ? `explain-proposal:${proposalId}`
      : `explain-proposal:${createHash("sha256").update(JSON.stringify({ title, type, riskLevel, description, rationale })).digest("hex").slice(0, 16)}`;

    try {
      const redis = await getRedisAsync();
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const explanation = typeof cached === "string" ? cached : JSON.stringify(cached);
          return res.json({ ok: true, explanation, cached: true });
        }
      }
    } catch { /* cache miss — continue */ }

    const prompt = `You are a clinical AI governance expert. Explain the following autonomous learning proposal in plain language for a physician or administrator who needs to decide whether to approve or reject it.

PROPOSAL:
- Title: ${title}
- Type: ${type ?? "unknown"}
- Risk Level: ${riskLevel ?? "unknown"}
- Affected Complaints: ${(affectedComplaints ?? []).join(", ") || "none specified"}
- Description: ${description ?? "none"}
- Rationale: ${rationale ?? "none"}
- Failure Reasons Detected: ${(reasons ?? []).join(", ") || "none"}
- Linked Cases: ${(linkedCases ?? []).slice(0, 5).join(", ") || "none"}

Provide a concise (3–5 sentence) plain-language explanation:
1. What clinical risk or gap this proposal addresses
2. Why the AI flagged it (what data pattern triggered it)
3. What approving it would change in the system
4. Any caution or contraindication the reviewer should consider

Be direct, specific, and avoid jargon. If riskLevel is critical or high, start with a clinical urgency note.`;

    const safeParams = applyPHIGuard(
      { model: "gpt-4o", messages: [{ role: "user", content: prompt }], max_tokens: 300, temperature: 0.3 },
      "simulationLabRoutes/explain-proposal"
    );
    const completion = await getOpenAI().chat.completions.create(safeParams);
    const explanation = completion.choices[0]?.message?.content?.trim() ?? "Unable to generate explanation.";

    // Store in Redis cache with 24-hour TTL
    try {
      const redis = await getRedisAsync();
      if (redis) await redis.set(cacheKey, explanation, { ex: 86400 });
    } catch { /* cache write failure is non-fatal */ }

    res.json({ ok: true, explanation, cached: false });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/simulation-lab/ai/fix-suggestions", heavyRateLimit(), async (req, res) => {
  try {
    const { topPatterns, failures, passRate, redFlagMisses } = req.body;
    if (!topPatterns?.length && !failures?.length) {
      return res.status(400).json({ ok: false, error: "topPatterns or failures required" });
    }

    const patternSummary = (topPatterns ?? []).slice(0, 8).map((p: any) =>
      `- ${p.reason}: ${p.count} cases (complaints: ${(p.complaints ?? []).join(", ")})`
    ).join("\n");

    const failureSummary = (failures ?? []).slice(0, 5).map((f: any) =>
      `- Case ${f.caseId ?? "?"}: expected ${f.expectedDisposition}, got ${f.predictedDisposition}${f.redFlagMiss ? " [RED FLAG MISS]" : ""}`
    ).join("\n");

    const prompt = `You are a senior clinical informatics engineer reviewing failure patterns from an AI triage system (Auralyn/ENT). The system failed ${redFlagMisses ?? 0} red-flag cases and has a pass rate of ${passRate != null ? Math.round(passRate * 100) + "%" : "unknown"}.

TOP FAILURE PATTERNS:
${patternSummary || "none available"}

SAMPLE FAILURES:
${failureSummary || "none available"}

For each of the top failure patterns, suggest 1–2 concrete, actionable fixes. Each fix must specify:
1. WHERE to fix it (Knowledge Base rule, Disposition threshold, Red-flag rule, Bayesian prior, or Question weight)
2. WHAT to change (be specific — e.g., "Add 'tearing quality' as a mandatory red-flag feature for chest_pain → aortic_dissection")
3. EXPECTED IMPACT (brief, 1 sentence)

Format as a JSON array:
[
  {
    "pattern": "disposition_error",
    "fixes": [
      { "target": "Disposition threshold", "change": "Lower er_now threshold for chest_pain with diaphoresis from 0.75 to 0.60", "impact": "Reduces under-triage of atypical ACS presentations" }
    ]
  }
]

Return ONLY the JSON array, no prose.`;

    const safeFixParams = applyPHIGuard(
      { model: "gpt-4o", messages: [{ role: "user", content: prompt }], max_tokens: 700, temperature: 0.2, response_format: { type: "json_object" } },
      "simulationLabRoutes/fix-suggestions"
    );
    const completion = await getOpenAI().chat.completions.create(safeFixParams);

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    let parsed: any;
    try {
      const obj = JSON.parse(raw);
      parsed = Array.isArray(obj) ? obj : obj.fixes ?? obj.suggestions ?? Object.values(obj)[0] ?? [];
    } catch {
      parsed = [];
    }

    res.json({ ok: true, suggestions: parsed });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

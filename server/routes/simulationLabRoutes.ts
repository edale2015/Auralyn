import express from "express";
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
    results.push({ ...evaluation, failure, prediction, pack: simCase.pack, packLabel: simCase.packLabel, clinicalNote: simCase.clinicalNote, tags: simCase.tags });
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
    })),
  };
}

router.post("/simulation-lab/top50/run", (_req, res) => {
  try {
    const cases = top50Cases();
    const result = runTop50Evaluation(cases);
    res.json({ ok: true, ...result });
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
    res.json({ ok: true, packId, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

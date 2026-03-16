import {
  buildSimulationBatch,
  SimulationCase,
  SimComplaint,
} from "./simulationCaseFactory";
import {
  evaluateSimulationCase,
  summarizeEvaluations,
  SimulationPrediction,
} from "./simulationEvaluator";
import { saveSimulationRun, SimulationRunRecord } from "./simulationStore";
import { classifyFailure } from "./failureTaxonomyEngine";
import { aggregateFailures } from "./failureAggregator";
import { feedSimulationLearning } from "./simulationLearningBridge";

function uid(prefix = "run"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function predictWithFallback(simCase: SimulationCase): Promise<SimulationPrediction> {
  const f = simCase.features;

  if (simCase.complaint === "chest_pain") {
    if (f.tearing || f.diaphoresis || (f.exertional && f.sob)) {
      return {
        predictedDisposition: "er_now",
        predictedTopDiagnosis: f.tearing ? "aortic_dissection" : "acute_coronary_syndrome",
        confidence: 0.92,
        trace: [{ engine: "fallbackChestPainRule", output: "high_risk" }],
      };
    }
    return {
      predictedDisposition: "urgent_care",
      predictedTopDiagnosis: "musculoskeletal_or_gerd",
      confidence: 0.66,
      trace: [{ engine: "fallbackChestPainRule", output: "non_high_risk" }],
    };
  }

  if (simCase.complaint === "cough") {
    if (f.sob || f.chestPain) {
      return { predictedDisposition: "urgent_care", predictedTopDiagnosis: "pneumonia_vs_bronchitis", confidence: 0.79 };
    }
    if (f.fever && f.durationDays > 7) {
      return { predictedDisposition: "urgent_care", predictedTopDiagnosis: "pneumonia", confidence: 0.72 };
    }
    return { predictedDisposition: "self_care", predictedTopDiagnosis: "viral_uri", confidence: 0.74 };
  }

  if (simCase.complaint === "headache") {
    if (f.worst || f.neckStiff || f.neuroDeficit) {
      return { predictedDisposition: "er_now", predictedTopDiagnosis: f.worst ? "subarachnoid_hemorrhage" : "meningitis_or_stroke", confidence: 0.9 };
    }
    return { predictedDisposition: "urgent_care", predictedTopDiagnosis: "migraine_or_tension", confidence: 0.67 };
  }

  if (simCase.complaint === "dizziness") {
    if (f.unilateralWeakness || f.speechChange) {
      return { predictedDisposition: "er_now", predictedTopDiagnosis: "stroke", confidence: 0.89 };
    }
    return { predictedDisposition: "urgent_care", predictedTopDiagnosis: f.positional ? "bppv" : "nonspecific_dizziness", confidence: 0.68 };
  }

  if (simCase.complaint === "breathlessness") {
    if (f.stridor || f.cyanosis || (f.saturation && f.saturation < 90)) {
      return { predictedDisposition: "er_now", predictedTopDiagnosis: "acute_respiratory_failure", confidence: 0.91 };
    }
    return { predictedDisposition: "urgent_care", predictedTopDiagnosis: "asthma_exacerbation", confidence: 0.70 };
  }

  if (simCase.complaint === "fever") {
    if (f.petechiae) {
      return { predictedDisposition: "er_now", predictedTopDiagnosis: "meningococcemia", confidence: 0.95 };
    }
    if (f.infant && f.temperature > 38.5) {
      return { predictedDisposition: "er_now", predictedTopDiagnosis: "febrile_infant", confidence: 0.88 };
    }
    if (f.temperature > 39.5 || f.rash) {
      return { predictedDisposition: "urgent_care", predictedTopDiagnosis: "bacterial_infection", confidence: 0.73 };
    }
    return { predictedDisposition: "self_care", predictedTopDiagnosis: "viral_fever", confidence: 0.76 };
  }

  if (simCase.complaint === "ear_pain") {
    if (f.mastoidTenderness) {
      return { predictedDisposition: "er_now", predictedTopDiagnosis: "mastoiditis", confidence: 0.87 };
    }
    if (f.discharge || f.hearingLoss) {
      return { predictedDisposition: "urgent_care", predictedTopDiagnosis: "otitis_media", confidence: 0.78 };
    }
    return { predictedDisposition: "self_care", predictedTopDiagnosis: "external_ear_infection", confidence: 0.71 };
  }

  if (simCase.complaint === "sore_throat") {
    if (f.trismus || f.uvulaDeviation) {
      return { predictedDisposition: "er_now", predictedTopDiagnosis: "peritonsillar_abscess", confidence: 0.93 };
    }
    if (f.exudate) {
      return { predictedDisposition: "urgent_care", predictedTopDiagnosis: "strep_pharyngitis", confidence: 0.76 };
    }
    return { predictedDisposition: "self_care", predictedTopDiagnosis: "viral_pharyngitis", confidence: 0.73 };
  }

  return { predictedDisposition: "urgent_care", predictedTopDiagnosis: "generic_condition", confidence: 0.55 };
}

export async function runSimulationBatch(params: {
  complaint: SimComplaint;
  count: number;
  difficulty: "easy" | "moderate" | "hard";
}) {
  const cases = buildSimulationBatch(params.complaint, params.count, params.difficulty);

  const resultsWithFailures: any[] = [];
  for (const simCase of cases) {
    const prediction = await predictWithFallback(simCase);
    const evaluation = evaluateSimulationCase(simCase, prediction);
    const failure = classifyFailure(simCase, prediction);
    resultsWithFailures.push({ ...evaluation, failure });
  }

  const results = resultsWithFailures.map(r => {
    const { failure, ...ev } = r;
    return ev;
  });

  const summary = summarizeEvaluations(results);
  const failureBreakdown = aggregateFailures(resultsWithFailures);
  const learningUpdates = feedSimulationLearning(results);

  const run: SimulationRunRecord = {
    runId: uid(),
    createdAt: Date.now(),
    complaint: params.complaint,
    difficulty: params.difficulty,
    cases,
    results,
    summary,
    failureBreakdown,
    learningUpdates,
  };

  saveSimulationRun(run);
  return run;
}

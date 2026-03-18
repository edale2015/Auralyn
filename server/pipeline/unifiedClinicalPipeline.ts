import { matchSymptomPack } from "../engines/packMatcher";
import { buildParsedSymptomPacksFromRows } from "../engines/normalizedPackBuilder";
import { applyModifierPacks } from "../engines/modifierApplicationEngine";
import { evaluateSymptomPack } from "../engines/symptomPackEvaluationEngine";
import { generatePlanFromTemplate } from "../engines/planTemplateEngine";
import { storeCase, findSimilarCases, boostFromMemory } from "../engines/caseMemoryEngine";
import { explainabilityGraphEngine, ClinicalTrace } from "../engines/explainabilityGraphEngine";
import { tuneRuleWeights } from "../engines/rlhfWeightTuningEngine";
import { normalizeSystem } from "../utils/normalize";

export interface PipelineInput {
  text: string;
  answers: Record<string, string>;
  channel: "web" | "telegram" | "whatsapp";
  patientId?: string;
}

export interface PipelineTrace {
  complaint: string | null;
  system: string;
  packId: string | null;
  questions: Record<string, string>;
  modifiers: string[];
  rules: string[];
  clusters: Array<{ cluster: string; score: number }>;
  diagnosis: string | null;
  triage: string | null;
}

export interface PipelineResult {
  diagnosis: string | null;
  triage: string | null;
  plan: any;
  trace: PipelineTrace;
  graph: any;
  safetyOverride: boolean;
}

export async function runClinicalPipeline(
  input: PipelineInput,
  repo: {
    getSymptomPacks: () => Promise<any[]>;
    getQuestionRows: (packId: string) => Promise<any[]>;
    getModifiers: () => Promise<any[]>;
    getRules: (packId: string) => Promise<any[]>;
    getClusters: () => Promise<any[]>;
    getTriageMap: () => Promise<Record<string, string>>;
    getPlans: () => Promise<any[]>;
  }
): Promise<PipelineResult> {
  const trace: PipelineTrace = {
    complaint: null,
    system: "general",
    packId: null,
    questions: {},
    modifiers: [],
    rules: [],
    clusters: [],
    diagnosis: null,
    triage: null,
  };

  const packs = await repo.getSymptomPacks();
  const match = matchSymptomPack(input.text, packs);
  if (!match) {
    return {
      diagnosis: null,
      triage: null,
      plan: null,
      trace,
      graph: null,
      safetyOverride: false,
    };
  }

  trace.complaint = match.complaint || input.text;
  trace.packId = match.packId;
  trace.system = normalizeSystem(match.system || "general");

  const questionRows = await repo.getQuestionRows(match.packId);
  const parsedPacks = buildParsedSymptomPacksFromRows(questionRows);
  trace.questions = input.answers || {};

  const modifiers = await repo.getModifiers();
  const modResult = applyModifierPacks(
    { complaint: trace.complaint, answers: input.answers },
    modifiers
  );
  trace.modifiers = modResult.appliedModifierIds || [];

  const rules = await repo.getRules(match.packId);
  const evalResult = evaluateSymptomPack(
    { answers: input.answers, modifiers: trace.modifiers },
    rules
  );
  trace.rules = evalResult.triggeredRules || [];

  const clusters = await repo.getClusters();
  const scoredClusters = clusters
    .map((c: any) => ({
      cluster: c.label || c.id,
      score: Math.random() * 0.3 + 0.7,
    }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5);
  trace.clusters = scoredClusters;

  let diagnosis = scoredClusters[0]?.cluster || null;
  trace.diagnosis = diagnosis;

  const similar = findSimilarCases(
    { complaint: trace.complaint, symptoms: Object.keys(input.answers) },
    5
  );
  const boost = boostFromMemory(similar);
  if (boost.diagnoses.length > 0 && boost.diagnoses[0][1] > 0.5) {
    diagnosis = boost.diagnoses[0][0];
    trace.diagnosis = diagnosis;
  }

  const triageMap = await repo.getTriageMap();
  let triage = diagnosis ? triageMap[diagnosis] || "office_followup" : "office_followup";

  let safetyOverride = false;
  if (
    triage !== "er_now" &&
    scoredClusters[0]?.score > 0.9 &&
    trace.modifiers.some((m) => m.includes("force_escalation"))
  ) {
    triage = "er_now";
    safetyOverride = true;
  }
  trace.triage = triage;

  const plans = await repo.getPlans();
  const plan = generatePlanFromTemplate(diagnosis || "unknown", plans);

  const clinicalTrace: ClinicalTrace = {
    questions: Object.entries(input.answers).map(([id, answer]) => ({
      questionId: id,
      answer: String(answer),
    })),
    modifiers: trace.modifiers.map((id) => ({
      modifierId: id,
      applied: true,
    })),
    rules: trace.rules.map((r) => ({
      ruleId: r,
      triggered: true,
    })),
    clusters: trace.clusters.map((c) => ({
      clusterId: c.cluster,
      score: c.score,
    })),
    diagnosis: diagnosis || undefined,
  };
  const graph = explainabilityGraphEngine.buildGraph(clinicalTrace);

  storeCase({
    caseId: `pipe_${Date.now()}`,
    complaint: trace.complaint,
    symptoms: Object.keys(input.answers),
    diagnosis: diagnosis || "unknown",
    triage,
  });

  return {
    diagnosis,
    triage,
    plan,
    trace,
    graph,
    safetyOverride,
  };
}

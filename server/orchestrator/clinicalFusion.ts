import { vectorSearch, logClinicalDecision } from "../memory/hybridMemory";
import { centorScore, curb65, combinedClinicalScore } from "../clinical/scoringEngine";
import { clinicalSafetyCheck } from "../clinical/guardrails";
import { computeHybridScores } from "../core/engines/hybridScoringEngine";
import { getAllWeights, getWeightHistory } from "../learning/weightStore";

export interface ClinicalFusionInput {
  patientId?: string;
  complaints: string[];
  vitals?: {
    temperature?: number;
    heartRate?: number;
    oxygenSaturation?: number;
    systolicBp?: number;
    respRate?: number;
    urea?: number;
  };
  history?: {
    age?: number;
    confusion?: boolean;
    cough?: boolean;
    tonsillarExudate?: boolean;
    tenderNodes?: boolean;
  };
  embedding?: number[];
}

export interface ScoringTrace {
  centor?: { score: number; antibioticRecommended: boolean };
  curb65?: { score: number; hospitalizationRecommended: boolean };
  overallRisk: string;
  hybridTop: Array<{ diagnosis: string; baseScore: number; rlhfWeight: number; bayesScore: number; hybridScore: number }>;
  weightVersion: string;
  recommendation: string;
}

export interface ClinicalFusionResult {
  scores: ReturnType<typeof combinedClinicalScore>;
  recommendation: string;
  similarCases: Awaited<ReturnType<typeof vectorSearch>>;
  requiresPhysicianReview: boolean;
  guardrailResult: ReturnType<typeof clinicalSafetyCheck>;
  memoryNodeId?: string;
  scoringTrace: ScoringTrace;
}

export async function clinicalReasoning(input: ClinicalFusionInput): Promise<ClinicalFusionResult> {
  const history = {
    age: input.history?.age ?? 35,
    confusion: input.history?.confusion ?? false,
    cough: input.history?.cough ?? input.complaints.includes("cough"),
    tonsillarExudate: input.history?.tonsillarExudate ?? false,
    tenderNodes: input.history?.tenderNodes ?? false,
  };

  const vitals = {
    temperature: input.vitals?.temperature ?? 37.0,
    heartRate: input.vitals?.heartRate ?? 80,
    oxygenSaturation: input.vitals?.oxygenSaturation ?? 98,
    systolicBp: input.vitals?.systolicBp ?? 120,
    respRate: input.vitals?.respRate ?? 16,
    urea: input.vitals?.urea ?? 5,
  };

  // ── 1. Deterministic clinical scores (Centor / CURB-65) ──────────────────
  const scores = combinedClinicalScore({ complaints: input.complaints, vitals, history });

  // ── 2. RLHF-weighted hybrid scoring (Bayesian + weightStore + similarity) ─
  const hybridScores = computeHybridScores(input.complaints);
  const weightHistory = getWeightHistory();
  const weightVersion = weightHistory.length > 0 ? `v${weightHistory.length}` : "v0_base";

  const similarCases = await vectorSearch(input.embedding ?? [], 5);

  // ── 3. Blend: deterministic risk drives guardrails; hybrid drives dx ranking ─
  const riskScore = scores.overallRisk === "high" ? 0.85
    : scores.overallRisk === "moderate" ? 0.55
    : 0.25;

  const guardrailResult = clinicalSafetyCheck({
    type: input.complaints[0] ?? "assessment",
    riskScore,
    requiresConsent: true,
    invasive: false,
    patientId: input.patientId,
  });

  // Recommendation: hybrid top dx + deterministic risk combined
  const topHybrid = hybridScores[0]?.diagnosis;
  const recommendation =
    scores.overallRisk === "high"             ? "immediate_escalation_and_treatment"
    : scores.centor?.antibioticRecommended    ? "antibiotic_treatment"
    : scores.curb65?.hospitalizationRecommended ? "hospital_admission"
    : scores.overallRisk === "moderate"       ? "close_monitoring_and_targeted_testing"
    : topHybrid                               ? `supportive_care_${topHybrid}`
    : "supportive_care_and_follow_up";

  // ── 4. Scoring trace for test bench / explainability ─────────────────────
  const scoringTrace: ScoringTrace = {
    centor:        scores.centor  ? { score: scores.centor.score,  antibioticRecommended: scores.centor.antibioticRecommended }  : undefined,
    curb65:        scores.curb65  ? { score: scores.curb65.score,  hospitalizationRecommended: scores.curb65.hospitalizationRecommended } : undefined,
    overallRisk:   scores.overallRisk,
    hybridTop:     hybridScores.slice(0, 5).map(h => ({
      diagnosis:   h.diagnosis,
      baseScore:   +h.baseScore.toFixed(4),
      rlhfWeight:  +h.rlhfWeight.toFixed(4),
      bayesScore:  +h.bayesScore.toFixed(4),
      hybridScore: +h.hybridScore.toFixed(4),
    })),
    weightVersion,
    recommendation,
  };

  let memoryNodeId: string | undefined;
  try {
    const node = await logClinicalDecision({
      patientId: input.patientId,
      centor: scores.centor?.score,
      curb: scores.curb65?.score,
      complaints: input.complaints,
      vitals,
      embedding: input.embedding,
    });
    memoryNodeId = node.id;
  } catch {}

  return {
    scores,
    recommendation,
    similarCases,
    requiresPhysicianReview: riskScore > 0.7 || !guardrailResult.allowed,
    guardrailResult,
    memoryNodeId,
    scoringTrace,
  };
}

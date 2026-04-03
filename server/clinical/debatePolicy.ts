import { DebateAgentOpinion, DebateResolution, ClinicalDisposition } from "../db/sharedTypes";

export const DEBATE_POLICY_VERSION = "AURALYN_DEBATE_POLICY_v2026_04";

const acuityRank: Record<ClinicalDisposition, number> = {
  HOME_CARE: 1,
  URGENT_CARE: 2,
  PHYSICIAN_REVIEW: 3,
  ER_NOW: 4,
};

export function resolveDebate(opinions: DebateAgentOpinion[]): DebateResolution {
  const safety = opinions.find(o => o.agent === "safety_veto");
  const hybrid = opinions.find(o => o.agent === "hybrid");
  const bayesian = opinions.find(o => o.agent === "bayesian");

  if (!hybrid || !bayesian || !safety) {
    throw new Error("All three debate agent opinions are required");
  }

  // Rule 1: Safety veto is absolute and non-overridable by the system.
  // Can only be overridden by a physician with documented rationale.
  if (safety.veto) {
    return {
      policyVersion: DEBATE_POLICY_VERSION,
      outcome: "VETO_BLOCK",
      finalDisposition: safety.disposition,
      diagnoses: safety.diagnosisKey ? [safety.diagnosisKey] : [],
      requiresPhysicianReview: true,
      rationale:
        "Safety veto is absolute and non-overridable by system policy. " +
        `Safety agent rationale: ${safety.rationale}`,
    };
  }

  // Rule 2: Hybrid and Bayesian agree — consensus.
  if (hybrid.disposition === bayesian.disposition) {
    const diagnoses = [hybrid.diagnosisKey, bayesian.diagnosisKey]
      .filter((d): d is string => Boolean(d))
      .filter((d, i, arr) => arr.indexOf(d) === i);
    return {
      policyVersion: DEBATE_POLICY_VERSION,
      outcome: "CONSENSUS",
      finalDisposition: hybrid.disposition,
      diagnoses,
      requiresPhysicianReview: false,
      rationale: `Hybrid and Bayesian agents reached consensus on ${hybrid.disposition}.`,
    };
  }

  // Rule 3: Disposition disagreement — higher acuity wins (cost of over-escalation
  // is lower than cost of under-escalation in urgent care).
  const hybridRank = acuityRank[hybrid.disposition];
  const bayesianRank = acuityRank[bayesian.disposition];

  if (hybridRank !== bayesianRank) {
    const winner = hybridRank >= bayesianRank ? hybrid : bayesian;
    const loser = hybridRank >= bayesianRank ? bayesian : hybrid;
    return {
      policyVersion: DEBATE_POLICY_VERSION,
      outcome: "HIGHER_ACUITY_WINS",
      finalDisposition: winner.disposition,
      diagnoses: [winner.diagnosisKey, loser.diagnosisKey]
        .filter((d): d is string => Boolean(d))
        .filter((d, i, arr) => arr.indexOf(d) === i),
      requiresPhysicianReview: true,
      rationale:
        `Dispositional disagreement: ${hybrid.agent}→${hybrid.disposition} vs ` +
        `${bayesian.agent}→${bayesian.disposition}. ` +
        `Higher acuity disposition selected per AURALYN_DEBATE_POLICY_v2026_04. ` +
        `Physician review required.`,
    };
  }

  // Rule 4: Same disposition but different diagnoses — merge differential.
  const diagnoses = [hybrid.diagnosisKey, bayesian.diagnosisKey]
    .filter((d): d is string => Boolean(d))
    .filter((d, i, arr) => arr.indexOf(d) === i);

  return {
    policyVersion: DEBATE_POLICY_VERSION,
    outcome: "MERGED_DIFFERENTIAL",
    finalDisposition: hybrid.disposition,
    diagnoses,
    requiresPhysicianReview: true,
    rationale:
      `Diagnostic disagreement with equivalent disposition (${hybrid.disposition}). ` +
      `Both diagnoses included in differential. Physician review required to adjudicate.`,
  };
}

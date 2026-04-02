/**
 * Disposition Validator
 *
 * Maps our three-tier disposition system (er_now / urgent_care / self_care)
 * to a severity classification. Used by the learning pipeline to decide
 * whether a failure should generate a critical learning queue item.
 */

export type DispositionSeverity = "none" | "moderate" | "critical";

export interface DispositionValidation {
  correct: boolean;
  severity: DispositionSeverity;
  direction: "none" | "under_triage" | "over_triage";
  delta: number;
}

const TIER_RANK: Record<string, number> = {
  er_now: 3,
  urgent_care: 2,
  self_care: 1,
};

export function validateDisposition(
  result: { disposition: string },
  expected: { disposition: string },
): DispositionValidation {
  if (result.disposition === expected.disposition) {
    return { correct: true, severity: "none", direction: "none", delta: 0 };
  }

  const expectedRank = TIER_RANK[expected.disposition] ?? 2;
  const resultRank = TIER_RANK[result.disposition] ?? 2;
  const delta = resultRank - expectedRank;

  const isEmergency = expected.disposition === "er_now";
  const droppedToSelfCare = expected.disposition !== "self_care" && result.disposition === "self_care";

  const severity: DispositionSeverity =
    isEmergency ? "critical" :
    droppedToSelfCare ? "critical" : "moderate";

  const direction: DispositionValidation["direction"] =
    delta < 0 ? "under_triage" : "over_triage";

  return { correct: false, severity, direction, delta };
}

/**
 * Three-Tier Exception-Only Physician Workflow (Recommendation 3)
 *
 * Tier 1 — Notify-only:    CONSENSUS, confidence ≥ 0.85, HOME_CARE, no flags, no red flags
 * Tier 2 — Eyes-on 30s:   CONSENSUS URGENT_CARE or any population modifier flag present
 * Tier 3 — Full review:   VETO_BLOCK, HIGHER_ACUITY_WINS, MERGED_DIFFERENTIAL,
 *                          ER_NOW, confidence < 0.40, or prior physician override exists
 */

export type PhysicianTier = 1 | 2 | 3;

export interface TierInput {
  debateOutcome: "CONSENSUS" | "VETO_BLOCK" | "HIGHER_ACUITY_WINS" | "MERGED_DIFFERENTIAL" | string;
  disposition: "HOME_CARE" | "URGENT_CARE" | "PHYSICIAN_REVIEW" | "ER_NOW" | string;
  confidence: number;
  hasPopulationFlags: boolean;
  hasRedFlags: boolean;
  priorOverrideExists: boolean;
}

export interface TierAssignment {
  tier: PhysicianTier;
  label: string;
  slaMinutes: number;
  rationale: string;
  batchEligible: boolean;
}

const TIER_CONFIG: Record<PhysicianTier, { label: string; slaMinutes: number }> = {
  1: { label: "Notify-only", slaMinutes: 240 },
  2: { label: "Eyes-on (30s)", slaMinutes: 120 },
  3: { label: "Full review", slaMinutes: 15 },
};

export function assignTier(input: TierInput): TierAssignment {
  const { debateOutcome, disposition, confidence, hasPopulationFlags, hasRedFlags, priorOverrideExists } = input;

  // Tier 3: any hard safety signal
  if (
    debateOutcome === "VETO_BLOCK" ||
    debateOutcome === "HIGHER_ACUITY_WINS" ||
    debateOutcome === "MERGED_DIFFERENTIAL" ||
    disposition === "ER_NOW" ||
    confidence < 0.40 ||
    priorOverrideExists
  ) {
    const reasons: string[] = [];
    if (debateOutcome === "VETO_BLOCK") reasons.push("safety veto triggered");
    if (debateOutcome === "HIGHER_ACUITY_WINS") reasons.push("agent acuity disagreement");
    if (debateOutcome === "MERGED_DIFFERENTIAL") reasons.push("merged differential — diagnostic uncertainty");
    if (disposition === "ER_NOW") reasons.push("ER_NOW disposition");
    if (confidence < 0.40) reasons.push(`low posterior confidence (${(confidence * 100).toFixed(0)}%)`);
    if (priorOverrideExists) reasons.push("prior physician override on similar output");
    return {
      tier: 3,
      ...TIER_CONFIG[3],
      rationale: reasons.join("; "),
      batchEligible: false,
    };
  }

  // Tier 1: clean consensus + high confidence + home care + no modifiers
  if (
    debateOutcome === "CONSENSUS" &&
    disposition === "HOME_CARE" &&
    confidence >= 0.85 &&
    !hasPopulationFlags &&
    !hasRedFlags
  ) {
    return {
      tier: 1,
      ...TIER_CONFIG[1],
      rationale: `Consensus HOME_CARE, confidence ${(confidence * 100).toFixed(0)}%, no modifiers`,
      batchEligible: true,
    };
  }

  // Tier 2: everything in between
  const reasons: string[] = [];
  if (debateOutcome === "CONSENSUS" && disposition === "URGENT_CARE") reasons.push("consensus URGENT_CARE");
  if (hasPopulationFlags) reasons.push("population modifier flags present");
  if (hasRedFlags) reasons.push("red flags present");
  if (confidence < 0.85 && confidence >= 0.40) reasons.push(`moderate confidence (${(confidence * 100).toFixed(0)}%)`);
  return {
    tier: 2,
    ...TIER_CONFIG[2],
    rationale: reasons.join("; ") || "default tier 2",
    batchEligible: false,
  };
}

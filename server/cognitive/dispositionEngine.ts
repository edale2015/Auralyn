export type CognitiveDisposition = "ED" | "URGENT_CARE" | "HOME" | "FOLLOW_UP";

export interface DispositionResult {
  disposition: CognitiveDisposition;
  rationale:   string;
  urgencyScore:number;
}

export function computeDisposition({
  confidence,
  uncertainty,
  disagreement,
  redFlags,
}: {
  confidence:   number;
  uncertainty:  number;
  disagreement: number;
  redFlags?:    boolean | string[] | null;
}): DispositionResult {
  const hasRedFlags =
    redFlags === true ||
    (Array.isArray(redFlags) && redFlags.length > 0);

  // Hard escalation
  if (hasRedFlags) {
    return {
      disposition:  "ED",
      rationale:    "Hard red-flag criteria met — immediate emergency department evaluation required",
      urgencyScore: 1.0,
    };
  }

  // High uncertainty or specialist disagreement
  if (uncertainty > 0.6 || disagreement > 0.5) {
    return {
      disposition:  "URGENT_CARE",
      rationale:    `High uncertainty (${(uncertainty * 100).toFixed(0)}%) or significant specialist disagreement (${(disagreement * 100).toFixed(0)}%) — in-person urgent care evaluation recommended`,
      urgencyScore: Number((0.5 + uncertainty * 0.4).toFixed(3)),
    };
  }

  // High confidence, low uncertainty
  if (confidence > 0.85 && uncertainty < 0.3) {
    return {
      disposition:  "HOME",
      rationale:    `High diagnostic confidence (${(confidence * 100).toFixed(0)}%) with low uncertainty — home management with return precautions appropriate`,
      urgencyScore: Number((1 - confidence).toFixed(3)),
    };
  }

  // Moderate confidence — follow-up
  return {
    disposition:  "FOLLOW_UP",
    rationale:    `Moderate confidence (${(confidence * 100).toFixed(0)}%) — outpatient follow-up within 24–48 hours recommended`,
    urgencyScore: Number((0.3 + (1 - confidence) * 0.3).toFixed(3)),
  };
}

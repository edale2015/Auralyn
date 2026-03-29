export interface ModifierValidationResult {
  valid: boolean;
  modifier?: string;
  reason?: string;
  risk?: "low" | "moderate" | "high";
  recommendation?: string;
}

export function validateModifier(claim: {
  modifier?: string;
  cpt?: string;
  documentation?: boolean;
  separateService?: boolean;
  sameDay?: boolean;
  billingCount?: number;
}): ModifierValidationResult {
  const modifier = claim.modifier?.toUpperCase();
  if (!modifier) return { valid: true };

  if (modifier === "25") {
    if (!claim.documentation) {
      return {
        valid: false,
        modifier,
        reason: "Modifier 25 requires separate, distinct E/M service documentation",
        risk: "high",
        recommendation: "Document the separate E/M service with its own medical decision-making before billing Modifier 25.",
      };
    }
    if (!claim.separateService) {
      return {
        valid: false,
        modifier,
        reason: "Modifier 25 requires that the E/M is distinct from the primary procedure",
        risk: "high",
        recommendation: "Ensure the E/M encounter is clearly separate from the procedural note.",
      };
    }
    return { valid: true, modifier, risk: "low" };
  }

  if (modifier === "59") {
    if (!claim.separateService) {
      return {
        valid: false,
        modifier,
        reason: "Modifier 59 requires a distinct procedural service on the same day",
        risk: "high",
        recommendation: "Use Modifier 59 only when procedures are truly independent and non-overlapping.",
      };
    }
    return { valid: true, modifier, risk: "low" };
  }

  if (modifier === "51" && (claim.billingCount ?? 0) > 3) {
    return {
      valid: false,
      modifier,
      reason: "Excessive use of Modifier 51 — may trigger audit",
      risk: "moderate",
      recommendation: "Limit Modifier 51 to clearly bundlable procedures.",
    };
  }

  return { valid: true, modifier, risk: "low" };
}

export function getModifierStats() {
  return {
    active: true,
    validatedModifiers: ["25", "59", "51"],
    highRiskModifiers: ["25", "59"],
  };
}

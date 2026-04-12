export interface SafetyFloorInput {
  disposition?:  string;
  riskScore:     number;
  redFlags?:     string[];
  centorScore?:  number;
  probability?:  number;
}

export interface SafetyFloorResult {
  finalDisposition: string;
  floorApplied:     boolean;
  originalDisposition?: string;
  reason?:          string;
}

const ED_RISK_THRESHOLD        = 0.7;
const URGENT_CARE_THRESHOLD    = 0.5;

export function enforceSafetyFloor(input: SafetyFloorInput): SafetyFloorResult {
  const { riskScore, redFlags = [], disposition } = input;
  const original = disposition;

  if (redFlags.length > 0) {
    return {
      finalDisposition:    "er_now",
      floorApplied:        disposition !== "er_now",
      originalDisposition: original,
      reason:              `Red flag(s) present: ${redFlags.join(", ")} — floor raised to er_now`,
    };
  }

  if (riskScore > ED_RISK_THRESHOLD) {
    return {
      finalDisposition:    "er_now",
      floorApplied:        disposition !== "er_now",
      originalDisposition: original,
      reason:              `Risk score ${riskScore.toFixed(2)} > ${ED_RISK_THRESHOLD} — floor raised to er_now`,
    };
  }

  if (riskScore > URGENT_CARE_THRESHOLD) {
    const raised = !["er_now", "urgent_care"].includes(disposition ?? "");
    return {
      finalDisposition:    raised ? "urgent_care" : (disposition ?? "urgent_care"),
      floorApplied:        raised,
      originalDisposition: original,
      reason:              raised
        ? `Risk score ${riskScore.toFixed(2)} > ${URGENT_CARE_THRESHOLD} — floor raised to urgent_care`
        : undefined,
    };
  }

  return {
    finalDisposition: disposition ?? "follow_up_primary_care",
    floorApplied:     false,
  };
}

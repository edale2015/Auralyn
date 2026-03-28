import { logSecureEvent } from "../ops/secureAudit";

export interface BiasCheckResult {
  flagged: boolean;
  reason: string;
  pattern?: string;
  recommendation?: string;
}

let flaggedCount = 0;
let checkedCount = 0;

export function detectConfirmationBias(input: {
  testOrdered?: boolean;
  aiSuggested?: boolean;
  testResult?: string;
  aiDiagnosis?: string;
  patternNote?: string;
}): BiasCheckResult {
  checkedCount++;

  const { testOrdered, aiSuggested, testResult, aiDiagnosis } = input;

  if (testOrdered && aiSuggested && testResult === aiDiagnosis) {
    flaggedCount++;
    logSecureEvent({
      type: "CONFIRMATION_BIAS_DETECTED",
      pattern: "test_ordered_confirms_ai_suggestion",
      aiDiagnosis,
    });

    return {
      flagged: true,
      reason: "possible_confirmation_bias",
      pattern: "AI suggested diagnosis → test ordered → test confirms same diagnosis",
      recommendation:
        "Do not train on this sample. Test ordering may have been AI-influenced, creating a self-fulfilling feedback loop.",
    };
  }

  if (testOrdered && aiSuggested && !testResult) {
    return {
      flagged: true,
      reason: "awaiting_confirmation_test",
      pattern: "AI suggested → test ordered → result pending",
      recommendation: "Hold sample until independent outcome confirmation available.",
    };
  }

  return { flagged: false, reason: "no_bias_detected" };
}

export function getBiasGuardStats() {
  return {
    active: true,
    checked: checkedCount,
    flagged: flaggedCount,
    flagRate: checkedCount > 0 ? +(flaggedCount / checkedCount).toFixed(3) : 0,
  };
}

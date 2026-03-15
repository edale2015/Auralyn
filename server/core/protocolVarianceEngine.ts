export type ProtocolVarianceInput = {
  complaint: string;
  finalDisposition: string;
  aggregatedDifferentials: { diagnosis: string; score: number }[];
  tests?: { name: string }[];
  treatments?: string[];
  redFlags?: string[];
};

export type ProtocolVarianceOutput = {
  hasVariance: boolean;
  severity: "none" | "minor" | "major";
  reasons: string[];
  recommendedActions: string[];
};

const EXPECTATIONS: Record<string, {
  requiredRedFlagEscalation?: boolean;
  recommendedTests?: string[];
  suspiciousDispositionsForHighRisk?: string[];
}> = {
  chest_pain: {
    requiredRedFlagEscalation: true,
    recommendedTests: ["ecg", "troponin"],
    suspiciousDispositionsForHighRisk: ["home_care"],
  },
  shortness_of_breath: {
    requiredRedFlagEscalation: true,
    recommendedTests: ["pulse_ox"],
    suspiciousDispositionsForHighRisk: ["home_care"],
  },
  headache: {
    requiredRedFlagEscalation: true,
    recommendedTests: [],
    suspiciousDispositionsForHighRisk: ["home_care"],
  },
  dysuria: {
    recommendedTests: ["urinalysis"],
  },
  sore_throat: {
    recommendedTests: ["rapid_strep"],
  },
  abdominal_pain: {
    requiredRedFlagEscalation: true,
    suspiciousDispositionsForHighRisk: ["home_care"],
  },
  cough: {
    recommendedTests: ["chest_xray"],
  },
};

export function protocolVarianceEngine(
  input: ProtocolVarianceInput
): ProtocolVarianceOutput {
  const rule = EXPECTATIONS[input.complaint];
  const reasons: string[] = [];
  const recommendedActions: string[] = [];

  if (!rule) {
    return { hasVariance: false, severity: "none", reasons: [], recommendedActions: [] };
  }

  const testNames = new Set((input.tests || []).map((t) => t.name));
  const hasRedFlags = (input.redFlags || []).length > 0;
  const topDx = input.aggregatedDifferentials[0]?.diagnosis || "";
  const topScore = input.aggregatedDifferentials[0]?.score || 0;
  const highRiskDx = topScore >= 0.55;

  if (rule.requiredRedFlagEscalation && hasRedFlags && input.finalDisposition !== "er_now") {
    reasons.push("Red flags present without ER escalation");
    recommendedActions.push("Escalate to er_now");
  }

  for (const test of rule.recommendedTests || []) {
    if (!testNames.has(test)) {
      reasons.push(`Missing protocol-expected test: ${test}`);
      recommendedActions.push(`Consider adding ${test}`);
    }
  }

  if (highRiskDx && rule.suspiciousDispositionsForHighRisk?.includes(input.finalDisposition)) {
    reasons.push(`Potentially unsafe disposition (${input.finalDisposition}) for high-risk dx: ${topDx}`);
    recommendedActions.push("Escalate or request physician review");
  }

  const severity: ProtocolVarianceOutput["severity"] =
    reasons.length === 0 ? "none" :
    reasons.some((r) => r.includes("unsafe") || r.includes("Red flags")) ? "major" : "minor";

  return {
    hasVariance: reasons.length > 0,
    severity,
    reasons,
    recommendedActions,
  };
}

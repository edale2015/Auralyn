export interface PhysicianSummary {
  headline: string;
  reasoning: string;
  disposition: string;
  keyFactors: string[];
  confidence: number;
  redFlags: string[];
  suggestedAction: string;
}

export function generateSummary(result: {
  topDiagnosis?: string;
  disposition?: string;
  confidence?: number;
  keyFactors?: string[];
  redFlags?: string[];
  differential?: Array<{ dx: string; score: number }>;
  complaint?: string;
}): PhysicianSummary {
  const dx = result.topDiagnosis ?? result.differential?.[0]?.dx ?? "undifferentiated presentation";
  const disposition = result.disposition ?? "ROUTINE";
  const confidence = result.confidence ?? result.differential?.[0]?.score ?? 0;
  const factors = result.keyFactors ?? [];
  const flags = result.redFlags ?? [];

  const factorText = factors.length > 0
    ? `based on ${factors.slice(0, 3).join(", ")}`
    : "based on presented symptoms";

  const headline = `Likely ${humanizeDx(dx)} ${factorText}.`;

  const reasoningParts: string[] = [];
  if (confidence >= 0.8) reasoningParts.push(`High confidence (${(confidence * 100).toFixed(0)}%).`);
  else if (confidence >= 0.6) reasoningParts.push(`Moderate confidence (${(confidence * 100).toFixed(0)}%).`);
  else reasoningParts.push(`Low confidence — broaden differential.`);

  if (result.differential && result.differential.length > 1) {
    const runner = result.differential[1];
    reasoningParts.push(`Consider also ${humanizeDx(runner.dx)} (${(runner.score * 100).toFixed(0)}%).`);
  }

  if (flags.length > 0) {
    reasoningParts.push(`Red flags: ${flags.join(", ")}.`);
  }

  const actionMap: Record<string, string> = {
    ER_NOW:      "Transfer to ED immediately.",
    URGENT_24H:  "Same-day or next-day in-person evaluation.",
    ROUTINE:     "Schedule routine follow-up within 1 week.",
    SELF_CARE:   "Patient education and self-care instructions.",
    MONITOR:     "Monitor vitals and reassess in 4 hours.",
  };

  return {
    headline,
    reasoning: reasoningParts.join(" "),
    disposition,
    keyFactors: factors,
    confidence,
    redFlags: flags,
    suggestedAction: actionMap[disposition] ?? "Physician review required.",
  };
}

function humanizeDx(dx: string): string {
  const map: Record<string, string> = {
    streptococcal_pharyngitis: "strep throat",
    community_acquired_pneumonia: "community-acquired pneumonia",
    viral_uri: "viral upper respiratory infection",
    influenza: "influenza",
    pulmonary_embolism: "pulmonary embolism",
    J00:  "upper respiratory infection",
    J02_0: "streptococcal pharyngitis",
    I26:  "pulmonary embolism",
    J18_9: "pneumonia",
  };
  return map[dx] ?? dx.replace(/_/g, " ");
}

export function getPhysicianSummaryStats() {
  return { active: true, humanizationMapSize: 10 };
}

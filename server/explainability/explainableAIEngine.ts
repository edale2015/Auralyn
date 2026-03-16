export interface ClinicalDecision {
  topDiagnosis: string;
  probability: number;
  disposition: string;
  protocol?: string;
  redFlags?: string[];
  differentials?: Array<{ diagnosis: string; probability: number }>;
  enginesUsed?: string[];
}

export interface ClinicalExplanation {
  summary: string;
  reasoning: string[];
  safetyChecks: string[];
  confidenceStatement: string;
  differentialSummary: string[];
  engineTransparency: string[];
}

export function generateClinicalExplanation(decision: ClinicalDecision): ClinicalExplanation {
  const pctStr = (decision.probability * 100).toFixed(1);

  const reasoning: string[] = [
    `Top diagnosis: ${decision.topDiagnosis}`,
    `Probability: ${pctStr}%`,
  ];

  if (decision.protocol) {
    reasoning.push(`Protocol applied: ${decision.protocol}`);
  }

  let confidenceStatement = "";
  if (decision.probability >= 0.85) {
    confidenceStatement = `High confidence (${pctStr}%) in ${decision.topDiagnosis}. Clinical evidence strongly supports this diagnosis.`;
  } else if (decision.probability >= 0.6) {
    confidenceStatement = `Moderate confidence (${pctStr}%) in ${decision.topDiagnosis}. Consider additional testing to confirm.`;
  } else {
    confidenceStatement = `Low confidence (${pctStr}%) in ${decision.topDiagnosis}. Broad differential remains. Additional workup recommended.`;
  }

  const differentialSummary = (decision.differentials ?? [])
    .slice(0, 5)
    .map((d, i) => `${i + 1}. ${d.diagnosis} (${(d.probability * 100).toFixed(1)}%)`);

  const engineTransparency = (decision.enginesUsed ?? [])
    .map(e => `Engine: ${e}`);

  return {
    summary: `Disposition: ${decision.disposition} | Top Dx: ${decision.topDiagnosis} (${pctStr}%)`,
    reasoning,
    safetyChecks: decision.redFlags ?? [],
    confidenceStatement,
    differentialSummary,
    engineTransparency,
  };
}

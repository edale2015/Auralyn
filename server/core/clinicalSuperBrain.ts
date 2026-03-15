import { normalizeSymptoms } from './engines/symptomNormalizationEngine';
import { bayesianEngine } from './engines/bayesianEngine';
import { similarityEngine } from './engines/similarityEngine';
import { evidenceAggregator } from './engines/evidenceAggregatorEngine';
import { literatureEvidenceEngine } from './engines/literatureEvidenceEngine';
import { differentialExpansionEngine } from './engines/differentialExpansionEngine';
import { entropy } from './engines/uncertaintyEngine';
import { severityScoringEngine } from './engines/severityScoringEngine';
import { diagnosticConfidenceEngine } from './engines/diagnosticConfidenceEngine';
import { supervisorEngine } from './engines/supervisorEngine';
import { metaReasoningEngine } from './engines/metaReasoningEngine';
import { actionPlanningEngine } from './engines/actionPlanningEngine';

export interface SuperBrainInput {
  caseId?: string;
  complaint?: string;
  symptoms: string[];
  vitals?: Record<string, number>;
  answers?: Record<string, unknown>;
}

export async function runClinicalSuperBrain(input: SuperBrainInput) {
  const normalized = normalizeSymptoms(input.symptoms);

  const bayes = bayesianEngine(normalized);
  const similarity = similarityEngine(normalized);
  const literature = literatureEvidenceEngine(normalized);

  const differential = differentialExpansionEngine(
    evidenceAggregator(bayes, similarity)
  );

  const entropyScore = entropy(differential.map((d) => d.score));
  const confidence = diagnosticConfidenceEngine(differential, entropyScore);
  const severity = severityScoringEngine({ symptoms: normalized, vitals: input.vitals });
  const governance = supervisorEngine({ entropy: entropyScore, severity });
  const metaIssues = metaReasoningEngine({ entropy: entropyScore, differential });
  const topDx = differential[0]?.diagnosis ?? '';
  const actionPlan = actionPlanningEngine(topDx);

  return {
    caseId: input.caseId,
    normalizedSymptoms: normalized,
    differential,
    literatureEvidence: literature,
    entropy: entropyScore,
    confidence,
    severity,
    governance,
    metaIssues,
    actionPlan,
  };
}

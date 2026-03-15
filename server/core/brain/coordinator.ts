import { BrainCaseInput, CoordinationOutput } from '../../../shared/brainEngineTypes';
import { normalizeSymptoms } from './symptomNormalizationEngine';
import { runContradictionEngine } from './contradictionEngine';
import { runClinicalSafetyGuard } from './clinicalSafetyGuard';
import { runCaseSimilarityEngine } from './caseSimilarityEngine';
import { runBayesianDifferentialEngine } from './differentialProbabilityEngine';
import { runKnowledgeGraphEngine } from './knowledgeGraphEngine';
import { runEvidenceAggregatorEngine } from './evidenceAggregatorEngine';
import { runUncertaintyEngine } from './uncertaintyEngine';
import { runComplaintCompletenessEngine } from './complaintCompletenessEngine';
import { runSeverityScoringEngine } from './severityScoringEngine';
import { runTestRecommendationEngine } from './testRecommendationEngine';
import { runTreatmentRecommendationEngine } from './treatmentRecommendationEngine';
import { runGuidelineAdherenceEngine } from './guidelineAdherenceEngine';
import { runProtocolVarianceEngine } from './protocolVarianceEngine';
import { runDiagnosticDriftEngine } from './diagnosticDriftEngine';
import { runPatientRiskStratificationEngine } from './patientRiskStratificationEngine';
import { runSupervisorEngine } from './supervisorEngine';
import { runDispositionCalibrationEngine } from './dispositionCalibrationEngine';
import { runReturnPrecautionEngine } from './returnPrecautionEngine';
import { runMedicationSafetyEngine } from './medicationSafetyEngine';
import { runPhysicianReviewPacketEngine } from './physicianReviewPacketEngine';
import { storeClinicalMemory, retrieveClinicalMemory } from './clinicalMemoryEngine';

export function runClinicalBrainCoordinator(input: BrainCaseInput): CoordinationOutput {
  const trace: string[] = [];

  const normalizedSymptoms = normalizeSymptoms(input.symptoms);
  trace.push('normalize');
  const normalizedInput = { ...input, symptoms: normalizedSymptoms };

  const contradictions = runContradictionEngine(normalizedInput);
  trace.push('contradictions');

  const safety = runClinicalSafetyGuard(normalizedInput);
  trace.push('safety');

  const memory = retrieveClinicalMemory(normalizedInput);
  trace.push('memory');

  const similarity = runCaseSimilarityEngine(normalizedInput);
  trace.push('similarity');

  const bayes = runBayesianDifferentialEngine(normalizedInput);
  trace.push('bayes');

  const graph = runKnowledgeGraphEngine(normalizedSymptoms);
  trace.push('graph');

  const aggregatedDifferentials = runEvidenceAggregatorEngine(bayes, similarity, graph);
  trace.push('aggregate');

  const uncertainty = runUncertaintyEngine(aggregatedDifferentials);
  trace.push('uncertainty');

  const completeness = runComplaintCompletenessEngine(normalizedInput);
  trace.push('completeness');

  const severity = runSeverityScoringEngine(normalizedInput);
  trace.push('severity');

  const tests = runTestRecommendationEngine(aggregatedDifferentials);
  trace.push('tests');

  const treatments = runTreatmentRecommendationEngine(aggregatedDifferentials);
  trace.push('treatments');

  const guidelineAdherence = runGuidelineAdherenceEngine(aggregatedDifferentials, tests);
  trace.push('guidelines');

  const protocolVariance = runProtocolVarianceEngine(aggregatedDifferentials, tests);
  trace.push('variance');

  const drift = runDiagnosticDriftEngine(normalizedInput, aggregatedDifferentials);
  trace.push('drift');

  const riskFlags = runPatientRiskStratificationEngine(normalizedInput, aggregatedDifferentials);
  trace.push('risk');

  const supervisor = runSupervisorEngine({
    safetyTriggered: safety.triggered,
    contradictionErrors: contradictions.errors,
    highEntropy: uncertainty.isHigh,
    severityLevel: severity.level,
    protocolMajor: protocolVariance.hasMajor,
    completenessPassed: completeness.passed,
    guidelineMajor: guidelineAdherence.majorVariance.length > 0,
    driftMajor: drift.majorDrift
  });
  trace.push('supervisor');

  const calibration = runDispositionCalibrationEngine({
    safetyTriggered: safety.triggered,
    supervisor,
    uncertainty,
    severity,
    differentials: aggregatedDifferentials,
    completenessPassed: completeness.passed
  });
  trace.push('disposition');

  const returnPrecautions = runReturnPrecautionEngine(aggregatedDifferentials[0]?.id);
  trace.push('precautions');

  const medicationSafety = runMedicationSafetyEngine(normalizedInput, treatments);
  trace.push('med_safety');

  const reviewPacket = runPhysicianReviewPacketEngine(riskFlags, aggregatedDifferentials, tests);
  trace.push('review_packet');

  const output: CoordinationOutput = {
    coordinationTrace: trace,
    normalizedSymptoms,
    contradictions,
    safety,
    memory,
    graphDifferentials: graph,
    bayesDifferentials: bayes,
    aggregatedDifferentials,
    uncertainty,
    completeness,
    guidelineAdherence,
    protocolVariance,
    drift,
    severity,
    supervisor,
    tests,
    treatments,
    returnPrecautions,
    reviewPacket,
    disposition: calibration.disposition,
    dispositionReasons: [
      ...calibration.reasons,
      ...riskFlags,
      ...medicationSafety.alerts.map((a) => `${a.severity}: ${a.reason}`)
    ]
  };

  storeClinicalMemory({
    caseId: input.caseId,
    complaint: input.complaint,
    symptoms: normalizedSymptoms,
    aggregatedDifferentials,
    disposition: output.disposition,
    at: new Date().toISOString()
  });

  return output;
}

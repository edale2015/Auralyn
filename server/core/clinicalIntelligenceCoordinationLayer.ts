import { complaintCompletenessEngine } from "./complaintCompletenessEngine";
import { severityScoringEngine } from "./severityScoringEngine";
import { crossComplaintRouterEngine } from "./crossComplaintRouterEngine";
import { protocolVarianceEngine } from "./protocolVarianceEngine";
import { diagnosticDriftEngine, type DriftSnapshot } from "./diagnosticDriftEngine";
import { unifiedClinicalGovernanceEngine } from "./unifiedClinicalGovernanceEngine";
import { dispositionCalibrationEngine } from "./dispositionCalibrationEngine";
import { medicationSafetyEngine } from "./medicationSafetyEngine";
import { testYieldEngine } from "./testYieldEngine";

export type { DriftSnapshot };

export type CoordinationInput = {
  caseId: string;
  complaint: string;
  normalizedSymptoms: string[];
  answeredQuestions: Record<string, any>;
  redFlags: string[];
  vitals?: {
    heartRate?: number;
    systolicBP?: number;
    oxygenSaturation?: number;
    temperatureC?: number;
    respiratoryRate?: number;
  };
  aggregatedDifferentials: { diagnosis: string; score: number }[];
  proposedDisposition: string;
  contradiction?: { hasErrors?: boolean };
  safetyOverride?: { disposition?: string | null };
  tests?: { name: string; urgency?: "urgent" | "routine" }[];
  treatments?: string[];
  allergies?: string[];
  priorSnapshots?: DriftSnapshot[];
  guideline?: { passed?: boolean };
  entropy?: number;
  riskLevel?: string;
};

export type CoordinationOutput = {
  routedComplaints: ReturnType<typeof crossComplaintRouterEngine>;
  completeness: ReturnType<typeof complaintCompletenessEngine>;
  severity: ReturnType<typeof severityScoringEngine>;
  protocolVariance: ReturnType<typeof protocolVarianceEngine>;
  diagnosticDrift: ReturnType<typeof diagnosticDriftEngine>;
  governance: ReturnType<typeof unifiedClinicalGovernanceEngine>;
  calibration: ReturnType<typeof dispositionCalibrationEngine>;
  medicationSafety: ReturnType<typeof medicationSafetyEngine>;
  testYield: ReturnType<typeof testYieldEngine>;
  currentSnapshot: DriftSnapshot;
  finalDisposition: string;
};

export function clinicalIntelligenceCoordinationLayer(
  input: CoordinationInput
): CoordinationOutput {
  // ── 1. Cross-complaint routing ───────────────────────────────────────────
  const routedComplaints = crossComplaintRouterEngine({
    complaint: input.complaint,
    normalizedSymptoms: input.normalizedSymptoms,
  });

  // ── 2. Complaint completeness ────────────────────────────────────────────
  const completeness = complaintCompletenessEngine({
    complaint: input.complaint,
    answeredQuestions: input.answeredQuestions,
  });

  // ── 3. Severity scoring ──────────────────────────────────────────────────
  const severity = severityScoringEngine({
    normalizedSymptoms: input.normalizedSymptoms,
    redFlags: input.redFlags,
    vitals: input.vitals,
  });

  // ── 4. Protocol variance ─────────────────────────────────────────────────
  const protocolVariance = protocolVarianceEngine({
    complaint: input.complaint,
    finalDisposition: input.proposedDisposition,
    aggregatedDifferentials: input.aggregatedDifferentials,
    tests: input.tests,
    treatments: input.treatments,
    redFlags: input.redFlags,
  });

  // ── 5. Diagnostic drift ──────────────────────────────────────────────────
  const currentSnapshot: DriftSnapshot = {
    timestamp: new Date().toISOString(),
    caseId: input.caseId,
    complaint: input.complaint,
    topDiagnosis: input.aggregatedDifferentials[0]?.diagnosis || "unknown",
    topScore: input.aggregatedDifferentials[0]?.score || 0,
    differential: input.aggregatedDifferentials,
  };

  const diagnosticDrift = diagnosticDriftEngine({
    priorSnapshots: input.priorSnapshots || [],
    currentSnapshot,
  });

  // ── 6. Unified governance ────────────────────────────────────────────────
  const governance = unifiedClinicalGovernanceEngine({
    contradictionHasErrors:   !!input.contradiction?.hasErrors,
    safetyOverrideDisposition: input.safetyOverride?.disposition ?? null,
    severityLevel:             severity.level,
    protocolVarianceSeverity:  protocolVariance.severity,
    diagnosticDriftLevel:      diagnosticDrift.driftLevel,
    physicianRequired:         false,
    guidelinePassed:           input.guideline?.passed,
    completenessPassed:        completeness.complete,
  });

  // ── 7. Disposition calibration (final arbiter) ───────────────────────────
  const calibration = dispositionCalibrationEngine({
    complaint:               input.complaint,
    proposedDisposition:     input.proposedDisposition,
    aggregatedDifferentials: input.aggregatedDifferentials,
    entropy:                 input.entropy,
    redFlags:                input.redFlags,
    supervisorDecision:      governance.supervisorDecision === "NEEDS_PHYSICIAN_REVIEW"
                               ? "NEEDS_PHYSICIAN_REVIEW"
                               : undefined,
    riskLevel:               input.riskLevel,
    guidelinePassed:         input.guideline?.passed,
    contradictionHasErrors:  !!input.contradiction?.hasErrors,
    severityLevel:           severity.level,
    completenessPassed:      completeness.complete,
  });

  // ── 8. Medication safety ──────────────────────────────────────────────────
  const medicationSafety = medicationSafetyEngine({
    complaint:          input.complaint,
    topDiagnoses:       input.aggregatedDifferentials.slice(0, 3).map((d) => d.diagnosis),
    candidateMedications: (input.treatments || []).map((name) => ({ name })),
    answeredQuestions:  input.answeredQuestions,
    allergies:          input.allergies || [],
  });

  // ── 9. Test yield ─────────────────────────────────────────────────────────
  const testYield = testYieldEngine({
    complaint:        input.complaint,
    rankedDiagnoses:  input.aggregatedDifferentials,
    proposedTests:    input.tests || [],
  });

  return {
    routedComplaints,
    completeness,
    severity,
    protocolVariance,
    diagnosticDrift,
    governance,
    calibration,
    medicationSafety,
    testYield,
    currentSnapshot,
    finalDisposition: calibration.finalDisposition,
  };
}

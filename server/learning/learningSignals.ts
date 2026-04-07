/**
 * Packet 14 — Learning Loop: learning signal extraction
 *
 * Converts test suite failures into structured, typed learning signals.
 * Signals are the raw material consumed by fixGenerator to produce
 * constrained, auditable ProposedFix objects.
 *
 * Each failure maps to exactly one failureType; ambiguous failures
 * produce multiple signals (one per matched pattern).
 */

import type { SystemTestCase, SystemRunResult, ValidationResult } from "../testing/types";

export type LearningFailureType =
  | "wrong_disposition"
  | "missed_diagnosis"
  | "unsafe_pass"
  | "over_escalation"
  | "uncertainty_misclassification";

export interface LearningSignal {
  caseId: string;
  failureType: LearningFailureType;
  expected: any;
  actual: any;
  context: {
    complaint: string;
    symptoms: string[];
    posterior?: any;
    decision?: any;
  };
}

// ── extractLearningSignals ────────────────────────────────────────────────────
//
// Pattern-matches failure messages from validateTestCase() to assign a
// structured failureType. Multiple patterns can match a single failure.

export function extractLearningSignals(
  test: SystemTestCase,
  result: SystemRunResult,
  validation: ValidationResult,
): LearningSignal[] {
  const signals: LearningSignal[] = [];
  const context = {
    complaint: result.resolvedComplaint ?? test.input.message,
    symptoms: result.parsed?.secondary ?? test.input.patientContext?.symptoms ?? [],
    posterior: result.posterior,
    decision: result.decision,
  };

  for (const failure of validation.failures) {
    const fl = failure.toLowerCase();

    // ── Wrong disposition ───────────────────────────────────────────────
    if (fl.includes("disposition")) {
      signals.push({
        caseId: test.id,
        failureType: "wrong_disposition",
        expected: test.expected.disposition,
        actual: result.decision?.finalDisposition,
        context,
      });
    }

    // ── Missed diagnosis ────────────────────────────────────────────────
    if (fl.includes("diagnosis") || fl.includes("differential")) {
      signals.push({
        caseId: test.id,
        failureType: "missed_diagnosis",
        expected: test.expected.primaryDiagnosis,
        actual: result.decision?.posterior.topDiagnosis,
        context,
      });
    }

    // ── Unsafe pass (safety gate should have blocked) ───────────────────
    if (fl.includes("safety gate") && fl.includes("block")) {
      signals.push({
        caseId: test.id,
        failureType: "unsafe_pass",
        expected: "BLOCKED",
        actual: result.decision?.finalDisposition,
        context,
      });
    }

    // ── Over-escalation (physician review not triggered as expected) ────
    if (fl.includes("physician review")) {
      signals.push({
        caseId: test.id,
        failureType: "over_escalation",
        expected: "AWAITING_PHYSICIAN",
        actual: result.decision?.finalDisposition,
        context,
      });
    }

    // ── Uncertainty misclassification ────────────────────────────────────
    if (
      (fl.includes("needs_more_data") || fl.includes("uncertain")) &&
      fl.includes("disposition")
    ) {
      signals.push({
        caseId: test.id,
        failureType: "uncertainty_misclassification",
        expected: test.expected.disposition,
        actual: result.decision?.finalDisposition,
        context,
      });
    }
  }

  return signals;
}

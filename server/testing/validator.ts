/**
 * Packet 13 — System Test Harness: validator
 *
 * Compares expected outcomes against a SystemRunResult.
 * Returns a ValidationResult with a full list of failures.
 *
 * Rule: checks are independent — collect all failures, never short-circuit.
 */

import type { SystemTestCase, SystemRunResult, ValidationResult } from "./types";

export function validateTestCase(
  test: SystemTestCase,
  result: SystemRunResult,
): ValidationResult {
  const failures: string[] = [];
  const decision = result.decision;

  // ── Guard: no decision produced ──────────────────────────────────────────
  if (!decision) {
    const errSummary = result.errors.length > 0 ? ` Errors: ${result.errors.join("; ")}` : "";
    failures.push(`No decision produced for case "${test.id}".${errSummary}`);
    return { passed: false, failures };
  }

  // ── Disposition ──────────────────────────────────────────────────────────
  if (test.expected.disposition !== undefined) {
    if (decision.finalDisposition !== test.expected.disposition) {
      failures.push(
        `[${test.id}] Expected disposition "${test.expected.disposition}", got "${decision.finalDisposition}"`,
      );
    }
  }

  // ── Primary diagnosis ────────────────────────────────────────────────────
  if (test.expected.primaryDiagnosis !== undefined) {
    if (decision.posterior.topDiagnosis !== test.expected.primaryDiagnosis) {
      failures.push(
        `[${test.id}] Expected primary diagnosis "${test.expected.primaryDiagnosis}", got "${decision.posterior.topDiagnosis}"`,
      );
    }
  }

  // ── Must include in differential ─────────────────────────────────────────
  for (const d of test.expected.mustIncludeDifferential ?? []) {
    if (!decision.posterior.differential.some(x => x.diagnosis === d)) {
      failures.push(`[${test.id}] Missing expected differential diagnosis: "${d}"`);
    }
  }

  // ── Must NOT include in differential ────────────────────────────────────
  for (const d of test.expected.mustNotIncludeDifferential ?? []) {
    if (decision.posterior.differential.some(x => x.diagnosis === d)) {
      failures.push(`[${test.id}] Unexpected differential diagnosis present: "${d}"`);
    }
  }

  // ── Safety gate assertion ────────────────────────────────────────────────
  if (test.expected.mustTriggerSafetyGate === true) {
    if (decision.safety.allowed) {
      failures.push(
        `[${test.id}] Expected safety gate to block, but it passed (code: ${decision.safety.code})`,
      );
    }
  }

  // ── Physician review assertion ────────────────────────────────────────────
  if (test.expected.requiresPhysicianReview === true) {
    if (decision.finalDisposition !== "AWAITING_PHYSICIAN") {
      failures.push(
        `[${test.id}] Expected physician review (AWAITING_PHYSICIAN), got "${decision.finalDisposition}"`,
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

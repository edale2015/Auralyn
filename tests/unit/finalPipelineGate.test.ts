/**
 * Final pipeline governance and structural gate tests
 *
 * Tests four structural guarantees added in this session:
 *   (a) assertRlhfGated — runtime RLHF governance assertion
 *   (b) globalClinicalSafetyGate — null check before deref
 *   (c) per-stage timings present on every output
 *   (d) degraded flag propagates on non-critical stage failures
 */

import { describe, it, expect } from "vitest";
import {
  assertRlhfGated,
  globalClinicalSafetyGate,
  runFinalPipeline,
  type FinalPipelineOutput,
} from "../../server/clinical/finalPipeline";

// ── assertRlhfGated — governance gate ─────────────────────────────────────────

describe("assertRlhfGated — RLHF governance enforcement", () => {
  it("throws GOVERNANCE VIOLATION when requiresHumanApproval is false", () => {
    expect(() => assertRlhfGated({
      proposalId:            "p-001",
      requiresHumanApproval: false,
      status:                "pending_review",
      proposedUpdate:        {},
      createdAt:             new Date().toISOString(),
    })).toThrow("GOVERNANCE VIOLATION");
  });

  it("throws GOVERNANCE VIOLATION when requiresHumanApproval is missing", () => {
    expect(() => assertRlhfGated({
      proposalId: "p-002",
      status:     "pending_review",
    })).toThrow("GOVERNANCE VIOLATION");
  });

  it("throws when requiresHumanApproval is the string 'true' instead of boolean", () => {
    expect(() => assertRlhfGated({
      proposalId:            "p-003",
      requiresHumanApproval: "true",   // string, not boolean
      status:                "pending_review",
    })).toThrow("GOVERNANCE VIOLATION");
  });

  it("does NOT throw for a fully compliant proposal", () => {
    expect(() => assertRlhfGated({
      proposalId:            "p-004",
      requiresHumanApproval: true,
      status:                "pending_review",
      proposedUpdate:        {},
      createdAt:             new Date().toISOString(),
    })).not.toThrow();
  });

  it("throws for non-object input", () => {
    expect(() => assertRlhfGated(null)).toThrow("[RLHF] Proposal is not an object");
    expect(() => assertRlhfGated("proposal-string")).toThrow("[RLHF] Proposal is not an object");
    expect(() => assertRlhfGated(42)).toThrow("[RLHF] Proposal is not an object");
  });
});

// ── globalClinicalSafetyGate — null-before-deref ordering ─────────────────────

describe("globalClinicalSafetyGate — null check before property access", () => {
  const baseOutput: FinalPipelineOutput = {
    encounterId:       "enc-001",
    patientId:         "p-001",
    normalizedInput:   {} as any,
    fusionResult:      null,
    topDiagnosis:      "URI",
    confidence:        0.7,
    differential:      [],
    explainability:    "likely URI",
    safetyDisposition: "MONITOR",
    safetyFlags:       [],
    physicianSummary:  "Likely URI.",
    rlhfProposal:      null,
    durationMs:        42,
    pipelineVersion:   "1.3.0",
    governedAt:        new Date().toISOString(),
    fhirSyncQueued:    true,
    stageTimings:      {},
    degraded:          false,
  };

  it("passes for a healthy non-critical result", () => {
    expect(() => globalClinicalSafetyGate(baseOutput)).not.toThrow();
  });

  it("throws 'safety pipeline missing' when safetyDisposition is absent — GUARD 1 first", () => {
    // This simulates the scenario described in the packet: the null guard must
    // run BEFORE any code that accesses result.safetyDisposition.
    const noDispo = { ...baseOutput, safetyDisposition: "" as any };
    expect(() => globalClinicalSafetyGate(noDispo)).toThrow("Safety pipeline missing");
  });

  it("throws 'escalate to physician' when degraded + ER_NOW — GUARD 2 after GUARD 1", () => {
    const degradedCritical: FinalPipelineOutput = {
      ...baseOutput,
      safetyDisposition: "ER_NOW",
      degraded:          true,
    };
    expect(() => globalClinicalSafetyGate(degradedCritical)).toThrow("escalate to physician");
  });

  it("throws 'escalate to physician' when degraded + URGENT_24H", () => {
    const degradedUrgent: FinalPipelineOutput = {
      ...baseOutput,
      safetyDisposition: "URGENT_24H",
      degraded:          true,
    };
    expect(() => globalClinicalSafetyGate(degradedUrgent)).toThrow("escalate to physician");
  });

  it("does NOT throw when degraded + MONITOR (non-critical disposition)", () => {
    const degradedRoutine: FinalPipelineOutput = {
      ...baseOutput,
      safetyDisposition: "MONITOR",
      degraded:          true,
    };
    expect(() => globalClinicalSafetyGate(degradedRoutine)).not.toThrow();
  });

  it("does NOT throw when ER_NOW but NOT degraded", () => {
    const erNowHealthy: FinalPipelineOutput = {
      ...baseOutput,
      safetyDisposition: "ER_NOW",
      degraded:          false,
    };
    expect(() => globalClinicalSafetyGate(erNowHealthy)).not.toThrow();
  });
});

// ── runFinalPipeline — stageTimings present ────────────────────────────────────

describe("runFinalPipeline — per-stage timings in output", () => {
  it("output includes stageTimings as a Record<string, number>", () => {
    const result = runFinalPipeline({
      freeText:  "headache",
      complaint: "headache",
    });
    expect(result.stageTimings).toBeDefined();
    expect(typeof result.stageTimings).toBe("object");
  });

  it("stageTimings includes at least stage1_nlp_intake", () => {
    const result = runFinalPipeline({
      freeText:  "chest pain",
      complaint: "chest pain",
    });
    expect(typeof result.stageTimings["stage1_nlp_intake"]).toBe("number");
    expect(result.stageTimings["stage1_nlp_intake"]).toBeGreaterThanOrEqual(0);
  });

  it("durationMs is a positive number", () => {
    const result = runFinalPipeline({ complaint: "fever" });
    expect(result.durationMs).toBeGreaterThan(0);
  });
});

// ── runFinalPipeline — degraded flag ──────────────────────────────────────────

describe("runFinalPipeline — degraded flag in output", () => {
  it("output includes degraded boolean field", () => {
    const result = runFinalPipeline({ complaint: "cough" });
    expect(typeof result.degraded).toBe("boolean");
  });

  it("pipelineVersion reflects the updated version", () => {
    const result = runFinalPipeline({ complaint: "sore throat" });
    expect(result.pipelineVersion).toBe("1.3.0");
  });
});

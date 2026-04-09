/**
 * Routing Engine — Chooses the best destination, not just the clinically valid one
 *
 * Routing logic hierarchy (highest priority first):
 *   1. Safety hard stop (ER_NOW) → always ER, no exceptions
 *   2. High deterioration risk → CLINIC (in-person required)
 *   3. URGENT safety disposition → CLINIC if available, else ER
 *   4. Critical surge → divert to TELEMED if possible
 *   5. Routine + telemed available → TELEMED
 *   6. Telemed full, clinic available → CLINIC
 *   7. All constrained → HOME with callback queue
 *
 * Each decision is recorded with a human-readable reason for audit purposes.
 */

import { type DeteriorationResult } from "./deteriorationPredictor";
import { type CapacityState }       from "./capacityEngine";
import { type SurgeState }          from "./surgeDetector";

export interface RoutingInput {
  patient: {
    patientId:          string;
    complaint:          string;
    symptoms:           string[];
    safetyDisposition?: "ER_NOW" | "URGENT" | "ROUTINE" | "CONTINUE";
  };
  deterioration: Pick<DeteriorationResult, "score" | "riskLevel" | "predictedNeedForEscalation">;
  capacityState: Pick<CapacityState, "canAbsorbMoreTelemed" | "canAbsorbMoreClinic" | "systemState">;
  surgeState:    Pick<SurgeState,    "status">;
}

export type RouteDestination = "ER" | "CLINIC" | "TELEMED" | "HOME";

export interface PatientPlan {
  patientId:    string;
  deterioration: Pick<DeteriorationResult, "score" | "riskLevel" | "predictedNeedForEscalation">;
  route: {
    destination: RouteDestination;
    urgency:     "immediate" | "urgent" | "routine";
    reason:      string;
  };
}

export function routePatientAcrossSystem(input: RoutingInput): PatientPlan {
  const safety = input.patient.safetyDisposition ?? "CONTINUE";

  // ── 1. Safety hard stop ───────────────────────────────────────────────────
  if (safety === "ER_NOW") {
    return plan(input, "ER", "immediate", "Safety pipeline hard stop — ER_NOW cannot be overridden");
  }

  // ── 2. High deterioration risk ────────────────────────────────────────────
  if (input.deterioration.riskLevel === "high") {
    return plan(input, "CLINIC", "urgent", "High deterioration risk — requires in-person physician evaluation");
  }

  // ── 3. URGENT disposition ─────────────────────────────────────────────────
  if (safety === "URGENT") {
    const dest = input.capacityState.canAbsorbMoreClinic ? "CLINIC" : "ER";
    return plan(input, dest, "urgent", "Urgent safety disposition with capacity-aware routing");
  }

  // ── 4. Critical surge diversion ───────────────────────────────────────────
  if (input.surgeState.status === "critical" && input.capacityState.canAbsorbMoreTelemed) {
    return plan(input, "TELEMED", "routine", "Critical surge — low-acuity diversion to telemed to protect ER capacity");
  }

  // ── 5. Routine — telemed preferred ───────────────────────────────────────
  if (input.capacityState.canAbsorbMoreTelemed) {
    return plan(input, "TELEMED", "routine", "Appropriate low/medium-acuity telemed route");
  }

  // ── 6. Telemed constrained, clinic available ──────────────────────────────
  if (input.capacityState.canAbsorbMoreClinic) {
    return plan(input, "CLINIC", "routine", "Telemed at capacity — clinic slot available");
  }

  // ── 7. Fallback: home with callback queue ─────────────────────────────────
  return plan(input, "HOME", "routine", "All in-person and virtual capacity constrained — home care with scheduled callback");
}

function plan(
  input:       RoutingInput,
  destination: RouteDestination,
  urgency:     "immediate" | "urgent" | "routine",
  reason:      string
): PatientPlan {
  return {
    patientId:    input.patient.patientId,
    deterioration: input.deterioration,
    route: { destination, urgency, reason },
  };
}

/**
 * Geo Routing Engine — Real-world destination decisions
 *
 * "Google Maps for clinical routing."
 *
 * Selects the optimal destination for each patient across the regional
 * facility network, balancing:
 *   - Safety disposition (ER_NOW overrides everything)
 *   - Risk level (high risk → nearest available clinic, not ER)
 *   - Facility load (avoid sending to an overwhelmed ER)
 *   - Distance (minimize travel time for time-sensitive cases)
 *   - Specialty match (stroke center, trauma, cath lab)
 *
 * Each decision includes a human-readable reason for audit.
 */

import { type FacilityCapacity } from "./regionalCapacity";

export interface GeoRoutingInput {
  patient: {
    patientId:           string;
    safetyDisposition?:  "ER_NOW" | "URGENT" | "ROUTINE" | "CONTINUE";
    riskLevel?:          "low" | "medium" | "high";
    complaint?:          string;
    requiredSpecialty?:  string;  // e.g. "stroke", "trauma"
  };
  facilities: FacilityCapacity[];
  capacity:   FacilityCapacity[];
}

export interface RouteDecision {
  destination:  string;
  type:         "ER" | "CLINIC" | "TELEMED" | "TRAUMA" | "STROKE" | "CATH" | "FALLBACK_ER";
  distance:     number;
  loadScore:    number;
  reason:       string;
}

export function routeRegionally(input: GeoRoutingInput): RouteDecision {
  const { patient, facilities } = input;

  // ── 1. Specialty requirement (e.g. stroke, cath, trauma) ──────────────────
  if (patient.requiredSpecialty) {
    const specialist = facilities
      .filter(f => f.specialties?.includes(patient.requiredSpecialty!) && f.canAcceptUrgent)
      .sort((a, b) => (a.loadScore + a.distance / 100) - (b.loadScore + b.distance / 100))[0];

    if (specialist) {
      return {
        destination: specialist.name,
        type:        specialist.type as RouteDecision["type"],
        distance:    specialist.distance,
        loadScore:   specialist.loadScore,
        reason:      `Specialty routing: ${patient.requiredSpecialty} center with capacity`,
      };
    }
  }

  // ── 2. Safety hard stop → nearest available ER (lowest load + distance) ───
  if (patient.safetyDisposition === "ER_NOW") {
    const erOptions = facilities
      .filter(f => f.type === "ER" && f.canAcceptUrgent)
      .sort((a, b) => (a.loadScore + a.distance / 20) - (b.loadScore + b.distance / 20));

    const bestER = erOptions[0];
    if (bestER) {
      return {
        destination: bestER.name,
        type:        "ER",
        distance:    bestER.distance,
        loadScore:   bestER.loadScore,
        reason:      "Emergency: lowest load + distance ER selected",
      };
    }
    // Fallback: any ER, even if loaded
    const anyER = facilities.find(f => f.type === "ER");
    return {
      destination: anyER?.name ?? "Nearest ER",
      type:        "FALLBACK_ER",
      distance:    anyER?.distance ?? 0,
      loadScore:   anyER?.loadScore ?? 1,
      reason:      "Emergency: all ERs at capacity — routing to nearest available",
    };
  }

  // ── 3. High risk + URGENT → nearest clinic not overloaded ─────────────────
  if (patient.riskLevel === "high" || patient.safetyDisposition === "URGENT") {
    const clinic = facilities
      .filter(f => f.type === "CLINIC" && f.loadScore < 0.8 && f.canAcceptUrgent)
      .sort((a, b) => a.distance - b.distance)[0];

    if (clinic) {
      return {
        destination: clinic.name,
        type:        "CLINIC",
        distance:    clinic.distance,
        loadScore:   clinic.loadScore,
        reason:      "High risk / urgent: nearest available in-person clinic",
      };
    }

    // Clinic at capacity → overflow to ER
    const overflowER = facilities
      .filter(f => f.type === "ER")
      .sort((a, b) => a.loadScore - b.loadScore)[0];

    return {
      destination: overflowER?.name ?? "ER",
      type:        "ER",
      distance:    overflowER?.distance ?? 0,
      loadScore:   overflowER?.loadScore ?? 1,
      reason:      "High risk: all clinics at capacity — redirected to ER",
    };
  }

  // ── 4. Routine / low-risk → telemed preferred ─────────────────────────────
  const telemed = facilities.find(f => f.type === "TELEMED" && f.canAcceptRoutine);
  if (telemed) {
    return {
      destination: telemed.name,
      type:        "TELEMED",
      distance:    0,
      loadScore:   telemed.loadScore,
      reason:      "Low/routine acuity: system-efficient telemed route",
    };
  }

  // ── 5. Telemed full → nearest available clinic ────────────────────────────
  const fallbackClinic = facilities
    .filter(f => f.type === "CLINIC" && f.canAcceptRoutine)
    .sort((a, b) => a.distance - b.distance)[0];

  if (fallbackClinic) {
    return {
      destination: fallbackClinic.name,
      type:        "CLINIC",
      distance:    fallbackClinic.distance,
      loadScore:   fallbackClinic.loadScore,
      reason:      "Telemed at capacity — nearest available clinic",
    };
  }

  // ── 6. Everything constrained → home with callback ────────────────────────
  return {
    destination: "HOME + CALLBACK",
    type:        "FALLBACK_ER",
    distance:    0,
    loadScore:   1,
    reason:      "Regional capacity constrained — home care with scheduled callback",
  };
}

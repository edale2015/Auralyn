/**
 * Regional Orchestrator — "Google Maps + ICU triage + public health radar"
 *
 * Coordinates the six regional sub-engines:
 *   1. Regional Capacity Layer   — compute load across all facilities
 *   2. Admission Risk Engine     — will this patient be admitted?
 *   3. Bounceback Predictor      — will this patient bounce in 72h?
 *   4. Geo Routing Engine        — best destination per patient
 *   5. Callback Automation       — follow-up timing + message template
 *   6. Outbreak Detector         — syndromic cluster detection
 *
 * Architecture:
 *   Patient → Clinical Brain → Hospital Brain → Regional Brain
 *                              ↓
 *                    Regional Command Grid
 */

import { computeRegionalCapacity, type FacilityInput } from "./regionalCapacity";
import { routeRegionally }                              from "./geoRoutingEngine";
import { predictAdmissionRisk }                         from "./admissionRisk";
import { predictBounceback }                            from "./bouncebackPredictor";
import { buildCallbackPlan }                            from "./callbackAutomation";
import { detectRegionalOutbreak }                       from "./outbreakDetector";

// ── Input types ───────────────────────────────────────────────────────────────

export interface RegionalPatientInput {
  patientId:          string;
  ageYears?:          number;
  complaint?:         string;
  symptoms?:          string[];
  vitals?: {
    systolicBp?:       number;
    oxygenSaturation?: number;
    heartRate?:        number;
    respiratoryRate?:  number;
    temperature?:      number;
  };
  safetyDisposition?: "ER_NOW" | "URGENT" | "ROUTINE" | "CONTINUE";
  riskLevel?:         "low" | "medium" | "high";
  requiredSpecialty?: string;
  comorbidities?:     string[];
  priorVisits30Days?: number;
  dischargeCondition?: "improved" | "stable" | "unchanged" | "worsened";
  siteName?:          string;
}

export interface RegionalOrchestrationInput {
  traceId?:   string;
  patients:   RegionalPatientInput[];
  facilities: FacilityInput[];
}

export interface PatientRegionalPlan {
  patientId:      string;
  route:          ReturnType<typeof routeRegionally>;
  admissionRisk:  ReturnType<typeof predictAdmissionRisk>;
  bouncebackRisk: ReturnType<typeof predictBounceback>;
  callbackPlan:   ReturnType<typeof buildCallbackPlan>;
}

export interface RegionalOrchestrationOutput {
  regionalCapacity: ReturnType<typeof computeRegionalCapacity>;
  patientPlans:     PatientRegionalPlan[];
  outbreak:         ReturnType<typeof detectRegionalOutbreak>;
  summary: {
    totalPatients:       number;
    highAdmissionRisk:   number;
    highBouncebackRisk:  number;
    callbacksScheduled:  number;
    urgentCallbacks:     number;
    outbreakAlert:       boolean;
  };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runRegionalOrchestration(
  input: RegionalOrchestrationInput
): Promise<RegionalOrchestrationOutput> {
  // ── Stage 1: Compute regional capacity ────────────────────────────────────
  const regionalCapacity = computeRegionalCapacity(input.facilities);

  // ── Stage 2: Per-patient plan ──────────────────────────────────────────────
  const patientPlans: PatientRegionalPlan[] = input.patients.map(p => {
    const admissionRisk  = predictAdmissionRisk(p);
    const bouncebackRisk = predictBounceback(p);

    const route = routeRegionally({
      patient:    p,
      facilities: regionalCapacity,
      capacity:   regionalCapacity,
    });

    const callbackPlan = buildCallbackPlan({
      patient:       p,
      admissionRisk,
      bouncebackRisk,
    });

    return {
      patientId: p.patientId,
      route,
      admissionRisk,
      bouncebackRisk,
      callbackPlan,
    };
  });

  // ── Stage 3: Outbreak detection ───────────────────────────────────────────
  const outbreak = detectRegionalOutbreak(
    input.patients.map(p => ({
      patientId: p.patientId,
      complaint: p.complaint ?? "unknown",
      symptoms:  p.symptoms ?? [],
      siteName:  p.siteName,
    }))
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = {
    totalPatients:       patientPlans.length,
    highAdmissionRisk:   patientPlans.filter(p => p.admissionRisk.risk   === "high").length,
    highBouncebackRisk:  patientPlans.filter(p => p.bouncebackRisk.risk  === "high").length,
    callbacksScheduled:  patientPlans.filter(p => p.callbackPlan.timing  !== "none").length,
    urgentCallbacks:     patientPlans.filter(p => p.callbackPlan.priority === "urgent").length,
    outbreakAlert:       outbreak.alert,
  };

  return { regionalCapacity, patientPlans, outbreak, summary };
}

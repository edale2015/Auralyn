/**
 * Hospital Brain Orchestrator
 *
 * Coordinates all five sub-engines into a single operational output:
 *
 *   1. Predictive Demand Engine   — how many patients in the next hour?
 *   2. Capacity Engine            — can the system absorb them?
 *   3. Surge Detector             — are we entering critical strain?
 *   4. Deterioration Predictor    — which patients need immediate escalation?
 *   5. Routing Engine             — where does each patient go?
 *   6. Population Intelligence    — what are the macro-level signals?
 *
 * All decisions are audited. The summary gives the command grid instant
 * visibility into where every patient was routed and why.
 *
 * Architecture:
 *   Patient Inputs → Hospital Brain → Command Grid / Executive Dashboard
 */

import { predictDemandWindow }           from "./predictiveDemandEngine";
import { predictPatientDeterioration }   from "./deteriorationPredictor";
import { computeCapacityState }          from "./capacityEngine";
import { routePatientAcrossSystem }      from "./routingEngine";
import { detectOperationalSurge }        from "./surgeDetector";
import { buildPopulationSignals }        from "./populationIntelligence";
import { auditStep }                     from "../audit/auditLogger";

// ── Input types ───────────────────────────────────────────────────────────────

export interface HospitalBrainInput {
  traceId:          string;
  nowTs:            number;
  incomingPatients: Array<{
    patientId:              string;
    ageYears?:              number;
    complaint:              string;
    symptoms:               string[];
    vitals?:                Record<string, number>;
    safetyDisposition?:     "ER_NOW" | "URGENT" | "ROUTINE" | "CONTINUE";
    predictedDifferential?: Array<{ diagnosis: string; probability: number }>;
  }>;
  historicalVolumes: Array<{
    ts:           number;
    count:        number;
    erCount:      number;
    telemedCount: number;
    clinicCount:  number;
  }>;
  operationalState: {
    telemedOpenSlots:    number;
    clinicOpenSlots:     number;
    physicianAvailable:  number;
    nurseAvailable:      number;
    currentQueueSize:    number;
    averageWaitMinutes:  number;
    ehrHealthy:          boolean;
    fhirHealthy:         boolean;
  };
}

export interface HospitalBrainOutput {
  demandForecast:    ReturnType<typeof predictDemandWindow>;
  capacityState:     ReturnType<typeof computeCapacityState>;
  surgeState:        ReturnType<typeof detectOperationalSurge>;
  populationSignals: ReturnType<typeof buildPopulationSignals>;
  patientPlans:      ReturnType<typeof routePatientAcrossSystem>[];
  summary: {
    totalPatients:   number;
    erSuggested:     number;
    clinicSuggested: number;
    telemedSuggested: number;
    homeSuggested:   number;
    highRiskPatients: number;
  };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runHospitalBrain(
  input: HospitalBrainInput
): Promise<HospitalBrainOutput> {
  // ── Stage 1: Demand forecast ──────────────────────────────────────────────
  const demandForecast = predictDemandWindow({
    historicalVolumes:   input.historicalVolumes,
    currentQueueSize:    input.operationalState.currentQueueSize,
    averageWaitMinutes:  input.operationalState.averageWaitMinutes,
    nowTs:               input.nowTs,
  });

  // ── Stage 2: Capacity state ───────────────────────────────────────────────
  const capacityState = computeCapacityState({
    telemedOpenSlots:   input.operationalState.telemedOpenSlots,
    clinicOpenSlots:    input.operationalState.clinicOpenSlots,
    physicianAvailable: input.operationalState.physicianAvailable,
    nurseAvailable:     input.operationalState.nurseAvailable,
    currentQueueSize:   input.operationalState.currentQueueSize,
    averageWaitMinutes: input.operationalState.averageWaitMinutes,
  });

  // ── Stage 3: Surge detection ──────────────────────────────────────────────
  const surgeState = detectOperationalSurge({
    demandForecast,
    capacityState,
    ehrHealthy:  input.operationalState.ehrHealthy,
    fhirHealthy: input.operationalState.fhirHealthy,
  });

  // ── Stage 4: Per-patient deterioration + routing ──────────────────────────
  const patientPlans = input.incomingPatients.map((patient) => {
    const deterioration = predictPatientDeterioration({
      ageYears:          patient.ageYears,
      complaint:         patient.complaint,
      symptoms:          patient.symptoms,
      vitals:            patient.vitals ?? {},
      safetyDisposition: patient.safetyDisposition ?? "CONTINUE",
      differential:      patient.predictedDifferential ?? [],
    });

    return routePatientAcrossSystem({
      patient,
      deterioration,
      capacityState,
      surgeState,
    });
  });

  // ── Stage 5: Population intelligence ─────────────────────────────────────
  const populationSignals = buildPopulationSignals({
    patients: input.incomingPatients,
    routes:   patientPlans,
    forecast: demandForecast,
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = {
    totalPatients:   patientPlans.length,
    erSuggested:     patientPlans.filter(p => p.route.destination === "ER").length,
    clinicSuggested: patientPlans.filter(p => p.route.destination === "CLINIC").length,
    telemedSuggested: patientPlans.filter(p => p.route.destination === "TELEMED").length,
    homeSuggested:   patientPlans.filter(p => p.route.destination === "HOME").length,
    highRiskPatients: patientPlans.filter(p => p.deterioration.riskLevel === "high").length,
  };

  await auditStep({
    traceId: input.traceId,
    step:    "hospital_brain_run",
    input:   {
      patientCount: input.incomingPatients.length,
      queueSize:    input.operationalState.currentQueueSize,
    },
    output:   { forecast: demandForecast, surge: surgeState, summary },
    metadata: {},
  });

  return { demandForecast, capacityState, surgeState, populationSignals, patientPlans, summary };
}

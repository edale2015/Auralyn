/**
 * EMS Router — pre-arrival routing using Digital Twin projections
 * Predicts patient severity before ambulance arrives and routes to best hospital
 */

import { runDigitalTwin }  from "../digitalTwin/digitalTwinEngine";
import { routePatients, type Hospital }   from "../network/hospitalCoordinator";
import { detectSepsisRisk }from "../sepsis/sepsisEngine";
import type { IngestedEMSPatient } from "./emsIngestion";

export interface EMSRoutingResult {
  patientId:        string;
  assignedHospital: string | null;
  hospitalName?:    string;
  predictedICUProb: number;
  sepsisFlag:       boolean;
  etaMinutes:       number;
  alertLevel:       "ROUTINE" | "URGENT" | "CRITICAL";
  routedAt:         string;
}

export function routeEMS(call: IngestedEMSPatient, hospitals: Hospital[]): EMSRoutingResult {
  // 60-minute horizon since ETA is typically <30 min
  const twin    = runDigitalTwin({ id: call.id, vitals: call.vitals, symptoms: call.symptoms }, 60);

  const sepsis  = detectSepsisRisk({
    id:       call.id,
    vitals:   { ...call.vitals },
    symptoms: call.symptoms,
  });

  const enriched = [{
    id:       call.id,
    location: call.location,
    requiredCapabilities: sepsis.highRisk ? ["icu"] : undefined,
  }];

  const routes  = routePatients(enriched, hospitals);
  const route   = routes[0];

  const alertLevel: EMSRoutingResult["alertLevel"] =
    twin.icuProb > 0.5 || sepsis.highRisk  ? "CRITICAL" :
    twin.icuProb > 0.2 || twin.deteriorationProb > 0.3 ? "URGENT" :
    "ROUTINE";

  return {
    patientId:        call.id,
    assignedHospital: route.assignedHospital,
    hospitalName:     route.hospitalName,
    predictedICUProb: twin.icuProb,
    sepsisFlag:       sepsis.highRisk,
    etaMinutes:       call.etaMinutes,
    alertLevel,
    routedAt:         new Date().toISOString(),
  };
}

export function routeEMSBatch(calls: IngestedEMSPatient[], hospitals: Hospital[]): EMSRoutingResult[] {
  return calls.map((c) => routeEMS(c, hospitals));
}

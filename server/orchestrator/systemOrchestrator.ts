/**
 * System Orchestrator — unified digital twin + ICU allocation + hospital routing
 * Broadcasts SYSTEM_SNAPSHOT to all connected dashboards
 */

import { runDigitalTwin, type TwinPatient }  from "../digitalTwin/digitalTwinEngine";
import { allocateICUBeds, type ICUBed }       from "../icu/icuAllocator";
import { routePatients, type Hospital, getSystemCapacity } from "../network/hospitalCoordinator";
import { broadcastPatientUpdate }             from "../realtime/patientStream";

export interface SystemSnapshot {
  timestamp:      number;
  twins:          ReturnType<typeof runDigitalTwin>[];
  icuAssignments: ReturnType<typeof allocateICUBeds>;
  routing:        ReturnType<typeof routePatients>;
  capacity:       ReturnType<typeof getSystemCapacity>;
  patientsAtRisk: number;
}

export async function runSystemCycle(
  patients:  TwinPatient[],
  beds:      ICUBed[],
  hospitals: Hospital[]
): Promise<SystemSnapshot> {
  const twins          = patients.map((p) => runDigitalTwin(p));
  const icuAssignments = allocateICUBeds(patients, beds);
  const routing        = routePatients(patients, hospitals);
  const capacity       = getSystemCapacity(hospitals);
  const patientsAtRisk = twins.filter((t) => t.riskSummary === "DETERIORATING" || t.riskSummary === "ICU_IMMINENT").length;

  const snapshot: SystemSnapshot = {
    timestamp: Date.now(),
    twins,
    icuAssignments,
    routing,
    capacity,
    patientsAtRisk,
  };

  broadcastPatientUpdate({ type: "SYSTEM_SNAPSHOT", payload: snapshot });
  return snapshot;
}

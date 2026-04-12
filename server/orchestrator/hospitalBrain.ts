/**
 * Hospital Brain — global real-time hospital orchestration
 * Combines system cycle + ops optimization + EMS routing into one heartbeat
 * Broadcasts GLOBAL_BRAIN_UPDATE to all connected dashboards
 */

import { runSystemCycle }          from "./systemOrchestrator";
import { optimizeHospitalFlow }    from "../ops/hospitalOptimizer";
import { routeEMSBatch }           from "../ems/emsRouter";
import { broadcastPatientUpdate }  from "../realtime/patientStream";
import { updateWallDisplay }       from "../controlTower/multiPatientStream";
import type { ICUBed }             from "../icu/icuAllocator";
import type { Hospital }           from "../network/hospitalCoordinator";

export interface GlobalBrainSnapshot {
  timestamp:   number;
  system:      Awaited<ReturnType<typeof runSystemCycle>>;
  ops:         ReturnType<typeof optimizeHospitalFlow>;
  emsRouting:  ReturnType<typeof routeEMSBatch>;
  wallDisplay: Awaited<ReturnType<typeof updateWallDisplay>>;
}

export async function runHospitalBrain(
  patients:  any[],
  beds:      ICUBed[],
  hospitals: Hospital[],
  emsCalls:  any[] = []
): Promise<GlobalBrainSnapshot> {
  // Run all cycles in parallel
  const [system, wallDisplay] = await Promise.all([
    runSystemCycle(patients, beds, hospitals),
    updateWallDisplay(patients),
  ]);

  const ops        = optimizeHospitalFlow(patients, beds);
  const emsRouting = routeEMSBatch(emsCalls, hospitals);

  const snapshot: GlobalBrainSnapshot = {
    timestamp: Date.now(),
    system,
    ops,
    emsRouting,
    wallDisplay,
  };

  broadcastPatientUpdate({ type: "GLOBAL_BRAIN_UPDATE", payload: snapshot });
  return snapshot;
}

/**
 * Surge Detector — The thunder siren
 *
 * Combines demand forecast, capacity strain, and system health to determine
 * whether the clinic is entering a surge condition. Surge levels:
 *
 *   normal   — all good
 *   watch    — early warning; increase monitoring cadence
 *   surge    — active strain; activate surge protocols
 *   critical — system overwhelmed; pause non-essential jobs, divert patients
 *
 * Each level comes with recommended actions so the command grid knows exactly
 * what to tell the operations team — not just that something is wrong.
 */

import { type DemandForecast }  from "./predictiveDemandEngine";
import { type CapacityState }   from "./capacityEngine";

export interface SurgeInput {
  demandForecast: Pick<DemandForecast, "nextHourVolume" | "nextHourEr" | "riskLevel">;
  capacityState:  Pick<CapacityState,  "strainScore" | "systemState">;
  ehrHealthy:     boolean;
  fhirHealthy:    boolean;
}

export interface SurgeState {
  score:               number;
  status:              "normal" | "watch" | "surge" | "critical";
  recommendedActions:  string[];
}

export function detectOperationalSurge(input: SurgeInput): SurgeState {
  let score = 0;

  if (input.demandForecast.nextHourVolume > 25)                score += 2;
  if (input.demandForecast.nextHourEr > 5)                     score += 2;
  if (input.capacityState.systemState === "busy")              score += 1;
  if (input.capacityState.systemState === "strained")          score += 3;
  if (!input.ehrHealthy)                                       score += 2;
  if (!input.fhirHealthy)                                      score += 1;

  const status: SurgeState["status"] =
    score >= 6 ? "critical" :
    score >= 4 ? "surge"    :
    score >= 2 ? "watch"    : "normal";

  const recommendedActions: string[] = [
    ...(status === "critical"
      ? [
          "Pause nonessential RLHF and learning jobs",
          "Activate callback queue for HOME-routed patients",
          "Expand telemed diversion — alert on-call physicians",
          "Notify clinic operations team immediately",
        ]
      : []),
    ...(status === "surge"
      ? [
          "Increase physician review cadence",
          "Watch wait times closely — alert if > 45 min",
          "Pre-stage telemed capacity expansion",
        ]
      : []),
    ...(status === "watch"
      ? ["Monitor wait times and queue depth over next 20 min"]
      : []),
    ...(!input.ehrHealthy
      ? ["EHR health degraded — switch to manual intake fallback"]
      : []),
    ...(!input.fhirHealthy
      ? ["FHIR sync unhealthy — route to retry queue"]
      : []),
  ];

  return { score, status, recommendedActions };
}

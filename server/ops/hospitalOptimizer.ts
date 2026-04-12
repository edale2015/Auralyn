/**
 * Hospital Operations Optimizer — adapts hospital flow strategy dynamically
 * Monitors patient load + bed availability → recommends NORMAL / DIVERT / OVERLOAD
 */

export type FlowStrategy = "NORMAL" | "DIVERT" | "CRITICAL_OVERLOAD" | "SURGE";

export interface HospitalFlowReport {
  load:          number;
  availableBeds: number;
  utilizationPct:number;
  strategy:      FlowStrategy;
  actions:       string[];
  recommendation:string;
  generatedAt:   string;
}

export function optimizeHospitalFlow(
  patients: any[],
  beds:     Array<{ available: boolean; id: string }>
): HospitalFlowReport {
  const load          = patients.length;
  const availableBeds = beds.filter((b) => b.available).length;
  const total         = beds.length;
  const utilizationPct = total > 0 ? Math.round((1 - availableBeds / total) * 100) : 0;

  let strategy: FlowStrategy = "NORMAL";

  if (load > 70 || utilizationPct > 95) {
    strategy = "CRITICAL_OVERLOAD";
  } else if (load > 50 && availableBeds < 5) {
    strategy = "DIVERT";
  } else if (utilizationPct > 80) {
    strategy = "SURGE";
  }

  return {
    load,
    availableBeds,
    utilizationPct,
    strategy,
    actions:       getActions(strategy),
    recommendation: getRecommendation(strategy, load, availableBeds),
    generatedAt:   new Date().toISOString(),
  };
}

function getActions(strategy: FlowStrategy): string[] {
  switch (strategy) {
    case "DIVERT":           return ["redirect_low_risk", "accelerate_discharges"];
    case "CRITICAL_OVERLOAD":return ["block_new_admissions", "activate_overflow_units", "notify_administration"];
    case "SURGE":            return ["activate_surge_protocol", "expedite_discharges", "call_additional_staff"];
    default:                 return ["standard_flow"];
  }
}

function getRecommendation(strategy: FlowStrategy, load: number, beds: number): string {
  switch (strategy) {
    case "CRITICAL_OVERLOAD": return `CRITICAL: ${load} patients, only ${beds} beds — activate mass casualty plan`;
    case "DIVERT":            return `Divert incoming low-acuity patients — ${beds} beds remaining`;
    case "SURGE":             return `Surge protocol recommended — bed utilization high`;
    default:                  return `Normal operations — ${beds} beds available for ${load} patients`;
  }
}

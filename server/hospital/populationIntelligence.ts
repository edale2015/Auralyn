/**
 * Population Intelligence Layer
 *
 * Turns individual patient cases into public-health-style population signals.
 * When five or more patients present with the same chief complaint in a short
 * window, the system flags a possible syndromic cluster — early smoke detection
 * for influenza-like illness, RSV clusters, GI outbreaks, or medication events.
 *
 * The top-5 complaints by volume and the current ER rate feed directly into
 * the executive dashboard and autonomous oversight agent for trend monitoring.
 */

import { type DemandForecast }  from "./predictiveDemandEngine";
import { type PatientPlan }     from "./routingEngine";

export interface PopulationInput {
  patients: Array<{
    complaint: string;
    symptoms:  string[];
  }>;
  routes:   Array<Pick<PatientPlan, "route">>;
  forecast: Pick<DemandForecast, "nextHourVolume" | "nextHourEr">;
}

export interface PopulationSignals {
  topComplaints:           Array<{ complaint: string; count: number }>;
  erRate:                  number;
  nextHourVolume:          number;
  nextHourEr:              number;
  possibleSyndromicSignal: string | null;
}

// Symptom cluster names for outbreak description
const SYNDROMIC_LABELS: Record<string, string> = {
  fever:               "Influenza-like illness",
  sore_throat:         "Pharyngitis cluster",
  cough:               "Respiratory cluster",
  shortness_of_breath: "Respiratory cluster",
  vomiting:            "GI illness",
  rash:                "Dermatological cluster",
  diarrhea:            "GI illness",
};

export function buildPopulationSignals(input: PopulationInput): PopulationSignals {
  // Count complaints
  const complaintCounts: Record<string, number> = {};
  for (const p of input.patients) {
    complaintCounts[p.complaint] = (complaintCounts[p.complaint] || 0) + 1;
  }

  const topComplaints = Object.entries(complaintCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([complaint, count]) => ({ complaint, count }));

  const erRate =
    input.routes.length > 0
      ? input.routes.filter(r => r.route.destination === "ER").length / input.routes.length
      : 0;

  // Syndromic signal: 5+ presentations of the same complaint in this window
  let possibleSyndromicSignal: string | null = null;
  if (topComplaints.length > 0 && topComplaints[0].count >= 5) {
    const top = topComplaints[0];
    const label = SYNDROMIC_LABELS[top.complaint] ?? `${top.complaint} cluster`;
    possibleSyndromicSignal =
      `${label} signal: ${top.count} presentations of "${top.complaint}" — consider outbreak protocol`;
  }

  return {
    topComplaints,
    erRate,
    nextHourVolume: input.forecast.nextHourVolume,
    nextHourEr:     input.forecast.nextHourEr,
    possibleSyndromicSignal,
  };
}

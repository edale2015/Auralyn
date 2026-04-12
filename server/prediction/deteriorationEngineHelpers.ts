/**
 * Deterioration Engine Helpers — extracted helper usable without full patient record
 */

export interface DeteriorationSignal {
  deteriorating: boolean;
  reason?:       string;
  severity?:     "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  deltaHR?:      number;
  deltaBP?:      number;
}

export function detectDeteriorationFromHistory(history: any[]): DeteriorationSignal {
  if (history.length < 2) return { deteriorating: false };

  const last = history[history.length - 1];
  const prev = history[history.length - 2];

  if (!last?.vitals || !prev?.vitals) return { deteriorating: false };

  const deltaHR = (last.vitals.hr ?? 0) - (prev.vitals.hr ?? 0);
  const deltaBP = (prev.vitals.systolicBP ?? prev.vitals.sbp ?? 120) - (last.vitals.systolicBP ?? last.vitals.sbp ?? 120);

  if (deltaHR > 15 || deltaBP > 20) {
    return {
      deteriorating: true,
      reason:        "Vitals worsening",
      severity:      deltaHR > 25 || deltaBP > 35 ? "CRITICAL" : "HIGH",
      deltaHR,
      deltaBP,
    };
  }

  return { deteriorating: false };
}

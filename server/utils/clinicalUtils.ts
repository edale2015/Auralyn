export type LoadState = "normal" | "surge" | "critical";
export type TriageDisposition = "ROUTINE" | "URGENT" | "ER_NOW";
export type OutcomeSeverity = "critical" | "moderate" | "minor";

export function adjustRiskThreshold(load: number): number {
  if (load > 50) return 0.5;
  if (load > 30) return 0.6;
  return 0.8;
}

export function weightOutcome(outcome: { severity: OutcomeSeverity }): number {
  switch (outcome.severity) {
    case "critical": return 5;
    case "moderate": return 2;
    default:         return 1;
  }
}

export function fastPath(patient: { complaint: string }): TriageDisposition | null {
  const c = patient.complaint?.toLowerCase() ?? "";
  if (c === "minor" || c === "cold" || c === "routine checkup") return "ROUTINE";
  if (c === "chest pain" || c === "stroke symptoms" || c === "unconscious") return "ER_NOW";
  return null;
}

let _simInterval: ReturnType<typeof setInterval> | null = null;

export function runContinuousSimulation(intervalMs = 60_000, onTick?: () => void): void {
  if (_simInterval) return;
  _simInterval = setInterval(() => {
    console.log("[ClinicalUtils] Background simulation tick");
    onTick?.();
  }, intervalMs);
}

export function stopContinuousSimulation(): void {
  if (_simInterval) {
    clearInterval(_simInterval);
    _simInterval = null;
  }
}

export function globalAlert(signal: { count: number; source?: string }): string | null {
  if (signal.count > 1000) {
    const msg = `GLOBAL ALERT TRIGGERED — count=${signal.count} source=${signal.source ?? "unknown"}`;
    console.error(`[ClinicalUtils] 🚨 ${msg}`);
    return msg;
  }
  return null;
}

export function classifyLoad(activePatients: number): LoadState {
  if (activePatients > 400) return "critical";
  if (activePatients > 200) return "surge";
  return "normal";
}

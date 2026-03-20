import { emitEvent } from "./eventBus";
import { getState } from "./aggregator";

const ERROR_THRESHOLD = 10;
const HIGH_RISK_THRESHOLD = 5;

let lastErrorCount = 0;
let lastHighRiskCount = 0;

function detectAnomalies(): void {
  const state = getState();

  if (state.errors.length > ERROR_THRESHOLD && state.errors.length !== lastErrorCount) {
    lastErrorCount = state.errors.length;
    emitEvent({
      type: "ALERT",
      payload: {
        message: `High error volume detected: ${state.errors.length} errors`,
        severity: "HIGH",
        category: "system",
      },
      timestamp: Date.now(),
    });
  }

  const highRisk = state.patients.filter((p: any) => p.safetyGate?.level === "HIGH" || p.safety?.level === "HIGH");
  if (highRisk.length > HIGH_RISK_THRESHOLD && highRisk.length !== lastHighRiskCount) {
    lastHighRiskCount = highRisk.length;
    emitEvent({
      type: "ALERT",
      payload: {
        message: `Spike in HIGH-risk patients: ${highRisk.length} cases`,
        severity: "HIGH",
        category: "clinical",
      },
      timestamp: Date.now(),
    });
  }
}

let anomalyTimer: ReturnType<typeof setInterval> | null = null;

export function startAnomalyEngine(intervalMs = 5000): void {
  if (anomalyTimer) return;
  anomalyTimer = setInterval(detectAnomalies, intervalMs);
  anomalyTimer.unref();
  console.log("[ControlTower] Anomaly engine started");
}

export function stopAnomalyEngine(): void {
  if (anomalyTimer) {
    clearInterval(anomalyTimer);
    anomalyTimer = null;
  }
}

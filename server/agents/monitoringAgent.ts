/**
 * server/agents/monitoringAgent.ts
 * Autonomous Monitoring Agent — detects regressions and blocks unsafe behavior.
 *
 * SAFE MODE: when unsafeUndercalls increase, the agent switches the system into
 * SAFE_MODE which forces physician review on all dispositions.
 * Only a physician (via approvalGate) can clear SAFE_MODE.
 */

import { detectRegressions, buildRegressionAlerts, type ValidationSnapshot } from "../validation/regressionTracker";

// ── System-wide safe mode ─────────────────────────────────────────────────────

let systemMode: "NORMAL" | "SAFE_MODE" = "NORMAL";

export function getSystemMode() {
  return systemMode;
}

export function clearSafeMode(authorizedBy: string) {
  console.log(`[MonitoringAgent] Safe mode cleared by: ${authorizedBy}`);
  systemMode = "NORMAL";
}

/**
 * Runtime check: call this at every disposition decision to enforce safe mode.
 */
export function enforceSafeMode(): { allowDisposition: boolean; forcePhysicianReview: boolean } {
  if (systemMode === "SAFE_MODE") {
    return { allowDisposition: false, forcePhysicianReview: true };
  }
  return { allowDisposition: true, forcePhysicianReview: false };
}

// ── Snapshot store ─────────────────────────────────────────────────────────────

let lastSnapshot: ValidationSnapshot | null = null;

export function getLastSnapshot(): ValidationSnapshot | null {
  return lastSnapshot;
}

// ── Main agent loop ────────────────────────────────────────────────────────────

/**
 * Call this after every validation run with the current snapshot.
 * The agent compares with the previous run and auto-escalates if needed.
 */
export async function monitoringAgent(current: ValidationSnapshot): Promise<{
  regression: ReturnType<typeof detectRegressions> | null;
  alerts: string[];
  mode: string;
}> {
  const now = { ...current, timestamp: Date.now() };

  if (!lastSnapshot) {
    lastSnapshot = now;
    console.log("[MonitoringAgent] First snapshot recorded — baseline set");
    return { regression: null, alerts: [], mode: systemMode };
  }

  const regression = detectRegressions(lastSnapshot, now);
  const alerts     = buildRegressionAlerts(regression);

  if (alerts.length > 0) {
    console.warn("[MonitoringAgent] REGRESSION DETECTED:", alerts);

    if (regression.unsafeIncrease) {
      systemMode = "SAFE_MODE";
      console.error("[MonitoringAgent] 🛑 SYSTEM SWITCHED TO SAFE_MODE — unsafe undercalls increased");
    }
  }

  lastSnapshot = now;

  return { regression, alerts, mode: systemMode };
}

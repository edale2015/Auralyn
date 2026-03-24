import { getMetrics } from "../monitoring/metricsStore";
import { getRegionSummary } from "../infra/regionRegistry";
import { getAgentSummary } from "../governance/agentRegistry";
import { getOpenIncidents } from "../incident/incidentCommander";
import { getSREState } from "../sre/slaEngine";

export type TwinState = {
  activeCases: number;
  avgLatency: number;
  p95Latency: number;
  errorRate: number;
  totalRequests: number;
  regionHealth: ReturnType<typeof getRegionSummary>;
  agentSummary: ReturnType<typeof getAgentSummary>;
  openIncidents: number;
  errorBudget: number;
  slaStatus: "OK" | "DEGRADED" | "BREACH";
  syncedAt: string;
};

let twin: TwinState = {
  activeCases: 0,
  avgLatency: 0,
  p95Latency: 0,
  errorRate: 0,
  totalRequests: 0,
  regionHealth: [],
  agentSummary: { total: 0, healthy: 0, warning: 0, critical: 0, agents: [] },
  openIncidents: 0,
  errorBudget: 1,
  slaStatus: "OK",
  syncedAt: new Date().toISOString(),
};

export function updateTwin(data: Partial<TwinState>): void {
  twin = { ...twin, ...data, syncedAt: new Date().toISOString() };
}

export function getTwin(): TwinState {
  return twin;
}

function deriveSlaStatus(errorBudget: number, avgLatency: number): TwinState["slaStatus"] {
  if (errorBudget < 0.95 || avgLatency > 1000) return "BREACH";
  if (errorBudget < 0.999 || avgLatency > 500) return "DEGRADED";
  return "OK";
}

let _syncLoop: ReturnType<typeof setInterval> | null = null;

export function startTwinSync(intervalMs = 1_000): void {
  if (_syncLoop) return;
  _syncLoop = setInterval(() => {
    try {
      const m = getMetrics();
      const sreState = getSREState();
      const openIncidents = getOpenIncidents().length;

      updateTwin({
        activeCases: m.windowSize,
        avgLatency: m.avgLatency,
        p95Latency: m.p95Latency,
        errorRate: m.errorRate,
        totalRequests: m.totalRequests,
        regionHealth: getRegionSummary(),
        agentSummary: getAgentSummary(),
        openIncidents,
        errorBudget: sreState.errorBudget,
        slaStatus: deriveSlaStatus(sreState.errorBudget, m.avgLatency),
      });
    } catch (e: any) {
      console.error("[DigitalTwin] Sync error:", e.message);
    }
  }, intervalMs);
  console.log(`[DigitalTwin] Sync started (interval=${intervalMs}ms)`);
}

export function stopTwinSync(): void {
  if (_syncLoop) { clearInterval(_syncLoop); _syncLoop = null; }
}

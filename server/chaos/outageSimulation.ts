import { getRegions, markRegionHealth } from "../infra/regionRegistry";
import { enableChaos, injectChaos } from "./chaosEngine";
import { recordEvent } from "../incident/timelineStore";
import { detectIncident, runIncidentPlaybook } from "../incident/incidentCommander";

export type OutageResult = {
  message: string;
  affectedRegion: string;
  fallbackRegions: Array<{ id: string; name: string; health: string; latencyMs: number }>;
  incidentId: string | null;
  autoMitigating: boolean;
};

export async function simulateNYCOutage(): Promise<OutageResult> {
  const regions = getRegions();
  const nyc = regions.find((r) => r.id === "nyc");

  if (!nyc) {
    return {
      message: "NYC region not found",
      affectedRegion: "nyc",
      fallbackRegions: [],
      incidentId: null,
      autoMitigating: false,
    };
  }

  markRegionHealth("nyc", "down");

  enableChaos();
  injectChaos("latency_spike");
  injectChaos("high_error_rate");

  recordEvent({
    type: "OUTAGE",
    action: "region_down",
    region: "nyc",
    detail: "Simulated NYC regional outage — cascading failures injected",
    severity: "CRITICAL",
  });

  const incident = detectIncident(["HIGH_ERROR_RATE", "LATENCY_SPIKE", "REGION_DOWN"]);
  let incidentId: string | null = null;

  if (incident) {
    incidentId = incident.id;
    await runIncidentPlaybook(incident);
    recordEvent({
      type: "INCIDENT",
      incidentId: incident.id,
      action: "playbook_complete",
      severity: incident.severity,
      detail: incident.playbookActions.join(", "),
    });
  }

  const fallback = regions
    .filter((r) => r.id !== "nyc")
    .map(({ id, name, health, latencyMs }) => ({ id, name, health, latencyMs }));

  console.warn("[Chaos] NYC outage simulated — fallback to:", fallback.map((r) => r.id).join(", "));

  return {
    message: "NYC region outage simulated — failover active",
    affectedRegion: "nyc",
    fallbackRegions: fallback,
    incidentId,
    autoMitigating: !!incident,
  };
}

export async function recoverNYCRegion(): Promise<{ message: string }> {
  markRegionHealth("nyc", "healthy", 20);
  recordEvent({
    type: "RECOVERY",
    action: "region_restored",
    region: "nyc",
    detail: "NYC region restored to healthy",
    severity: "LOW",
  });
  return { message: "NYC region restored to healthy" };
}

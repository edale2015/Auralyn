import { sendPhysicianAlert } from "../alerts/physicianAlertService";
import { invalidateTriageCache } from "../cache/triageCache";
import { rollbackDeployment } from "../sre/slaEngine";
import { recordEvent } from "./timelineStore";

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "open" | "mitigating" | "resolved";

export type Incident = {
  id: string;
  type: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  anomalies: string[];
  createdAt: string;
  updatedAt: string;
  playbookActions: string[];
};

const incidents: Incident[] = [];

export function detectIncident(anomalies: string[]): Incident | null {
  if (!anomalies.length) return null;

  const severity: IncidentSeverity =
    anomalies.some((a) => a.includes("ERROR_RATE") || a.includes("BUDGET")) ? "CRITICAL" :
    anomalies.some((a) => a.includes("LATENCY")) ? "HIGH" :
    anomalies.length > 2 ? "HIGH" : "MEDIUM";

  const incident: Incident = {
    id: `inc_${Date.now()}`,
    type: anomalies.join(", "),
    severity,
    status: "open",
    anomalies,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    playbookActions: [],
  };

  incidents.push(incident);
  if (incidents.length > 100) incidents.shift();
  console.error(`[IncidentCommander] New incident ${incident.id}: ${incident.type} (${incident.severity})`);
  recordEvent({ type: "INCIDENT", incidentId: incident.id, action: "detected", severity: incident.severity, detail: incident.type });
  return incident;
}

export async function runIncidentPlaybook(incident: Incident): Promise<void> {
  incident.status = "mitigating";
  incident.updatedAt = new Date().toISOString();

  const actions: string[] = [];

  if (incident.severity === "CRITICAL") {
    rollbackDeployment();
    actions.push("deployment_rollback");
  }

  if (incident.type.toLowerCase().includes("latency") || incident.type.toLowerCase().includes("cache")) {
    try {
      invalidateTriageCache();
      actions.push("cache_cleared");
    } catch { /* non-fatal */ }
  }

  await sendPhysicianAlert({
    caseId: "system",
    priority: incident.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
    reason: `Incident ${incident.id}: ${incident.type} — playbook executing`,
  }).catch(() => {});
  actions.push("alert_sent");

  incident.playbookActions = actions;
  incident.updatedAt = new Date().toISOString();

  recordEvent({ type: "PLAYBOOK", incidentId: incident.id, action: actions.join(", "), severity: incident.severity });
  console.log(`[IncidentCommander] Playbook complete for ${incident.id}: ${actions.join(", ")}`);
}

export function resolveIncident(id: string): boolean {
  const inc = incidents.find((i) => i.id === id);
  if (!inc) return false;
  inc.status = "resolved";
  inc.updatedAt = new Date().toISOString();
  return true;
}

export function getIncidents(): Incident[] {
  return incidents.slice(-50);
}

export function getOpenIncidents(): Incident[] {
  return incidents.filter((i) => i.status !== "resolved");
}

import { logSecureEvent } from "../ops/secureAudit";

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus  = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export interface Incident {
  id: string;
  severity: IncidentSeverity;
  category: string;
  message: string;
  detail?: any;
  status: IncidentStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

const incidents: Incident[] = [];
let resolvedCount = 0;

export function logIncident(event: {
  severity: IncidentSeverity;
  category: string;
  message: string;
  detail?: any;
}): Incident {
  const incident: Incident = {
    id: `INC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    severity: event.severity,
    category: event.category,
    message: event.message,
    detail: event.detail,
    status: "OPEN",
    createdAt: new Date().toISOString(),
  };
  incidents.push(incident);

  if (event.severity === "CRITICAL" || event.severity === "HIGH") {
    logSecureEvent({ type: "INCIDENT_LOGGED", ...incident });
  }

  return incident;
}

export function acknowledgeIncident(id: string, acknowledgedBy: string): Incident | null {
  const inc = incidents.find((i) => i.id === id);
  if (!inc) return null;
  inc.status = "ACKNOWLEDGED";
  logSecureEvent({ type: "INCIDENT_ACKNOWLEDGED", id, acknowledgedBy });
  return inc;
}

export function resolveIncident(id: string, resolvedBy: string): Incident | null {
  const inc = incidents.find((i) => i.id === id);
  if (!inc) return null;
  inc.status = "RESOLVED";
  inc.resolvedAt = new Date().toISOString();
  inc.resolvedBy = resolvedBy;
  resolvedCount++;
  logSecureEvent({ type: "INCIDENT_RESOLVED", id, resolvedBy });
  return inc;
}

export function getIncidents(filter?: { status?: IncidentStatus; severity?: IncidentSeverity }): Incident[] {
  let list = incidents.slice(-100);
  if (filter?.status)   list = list.filter((i) => i.status === filter.status);
  if (filter?.severity) list = list.filter((i) => i.severity === filter.severity);
  return list.reverse();
}

export function getIncidentStats() {
  const open     = incidents.filter((i) => i.status === "OPEN").length;
  const critical = incidents.filter((i) => i.severity === "CRITICAL").length;
  const high     = incidents.filter((i) => i.severity === "HIGH").length;
  return { active: true, total: incidents.length, open, critical, high, resolvedCount };
}

/**
 * Autonomous Hospital Agent
 * Continuously monitors hospital state and generates actions:
 * escalations, discharge suggestions, staffing alerts, capacity warnings.
 */

import { randomUUID } from "crypto";
import { getHospitalCapacity, getOccupancyReport, listBeds } from "./bedManagement";
import { checkStaffingRatios, computeShiftDemand }           from "./staffingEngine";
import { getReadmissionAlerts }                              from "./populationHealth";
import { broadcastPatientUpdate }                            from "../realtime/patientStream";

export type AgentActionType =
  | "ESCALATE"
  | "DISCHARGE_SUGGEST"
  | "STAFF_ALERT"
  | "CAPACITY_ALERT"
  | "READMISSION_RISK"
  | "DIVERT_RECOMMEND"
  | "INFO";

export interface AgentAction {
  id:         string;
  type:       AgentActionType;
  priority:   "critical" | "high" | "medium" | "low" | "info";
  unit?:      string;
  patientId?: string;
  message:    string;
  details:    Record<string, unknown>;
  timestamp:  string;
  resolved:   boolean;
}

export interface AgentRunResult {
  runId:      string;
  actions:    AgentAction[];
  summary:    string;
  durationMs: number;
  runAt:      string;
}

const actionLog: AgentAction[] = [];
let totalRuns = 0;

function log(action: Omit<AgentAction, "id" | "timestamp" | "resolved">): AgentAction {
  const entry: AgentAction = { ...action, id: randomUUID(), timestamp: new Date().toISOString(), resolved: false };
  actionLog.unshift(entry);             // newest first
  if (actionLog.length > 500) actionLog.pop(); // ring buffer
  return entry;
}

export async function runHospitalAgent(): Promise<AgentRunResult> {
  const t0    = Date.now();
  const runId = randomUUID();
  totalRuns++;
  const actions: AgentAction[] = [];

  // ── 1. Capacity check ────────────────────────────────────────────────────
  const capacity = getHospitalCapacity();
  if (capacity.occupancyRate > 0.95) {
    actions.push(log({ type: "DIVERT_RECOMMEND", priority: "critical", message: `Hospital at ${(capacity.occupancyRate * 100).toFixed(0)}% capacity — recommend EMS divert`, details: capacity }));
  } else if (capacity.occupancyRate > 0.85) {
    actions.push(log({ type: "CAPACITY_ALERT", priority: "high", message: `Capacity at ${(capacity.occupancyRate * 100).toFixed(0)}% — approaching surge threshold`, details: capacity }));
  }

  // ── 2. Unit-level occupancy ───────────────────────────────────────────────
  const occupancy = getOccupancyReport();
  for (const report of occupancy) {
    if (report.occupancyRate >= 1.0 && report.available === 0) {
      actions.push(log({ type: "CAPACITY_ALERT", priority: "critical", unit: report.unit, message: `${report.unit} full: ${report.occupied}/${report.total} beds`, details: report }));
    }
    if (report.predictedDischarges > 0) {
      actions.push(log({ type: "DISCHARGE_SUGGEST", priority: "medium", unit: report.unit, message: `${report.predictedDischarges} predicted discharge(s) in ${report.unit} within 8h`, details: report }));
    }
  }

  // ── 3. Critical patients (acuity 1) ──────────────────────────────────────
  const criticalBeds = listBeds().filter((b) => b.status === "OCCUPIED" && b.acuityLevel === 1);
  for (const bed of criticalBeds) {
    actions.push(log({ type: "ESCALATE", priority: "critical", unit: bed.unit, patientId: bed.patientId, message: `Critical patient ${bed.patientName ?? bed.patientId} in ${bed.number} requires attention`, details: { bedId: bed.id, admittedAt: bed.admittedAt } }));
  }

  // ── 4. Staffing alerts ───────────────────────────────────────────────────
  const staffAlerts = checkStaffingRatios();
  for (const alert of staffAlerts) {
    actions.push(log({ type: "STAFF_ALERT", priority: alert.severity === "critical" ? "critical" : "high", unit: alert.unit, message: alert.message, details: { alertType: alert.type } }));
  }

  // ── 5. Shift demand deficits ─────────────────────────────────────────────
  const demand = computeShiftDemand();
  for (const d of demand) {
    if (d.deficit >= 3) {
      actions.push(log({ type: "STAFF_ALERT", priority: "high", unit: d.unit, message: `${d.unit} understaffed: need ${d.deficit} more RNs (${d.currentStaff} on duty for ${d.patientCount} patients)`, details: d }));
    }
  }

  // ── 6. Readmission risk ──────────────────────────────────────────────────
  const highRisk = getReadmissionAlerts(0.55);
  for (const patient of highRisk.slice(0, 3)) { // cap to top 3
    actions.push(log({ type: "READMISSION_RISK", priority: "medium", patientId: patient.id, message: `High readmission risk: ${patient.name} (${(patient.readmissionRisk * 100).toFixed(0)}%) — conditions: ${patient.conditions.join(",")}`, details: { riskTier: patient.riskTier, preventiveGaps: patient.preventiveGaps } }));
  }

  if (actions.length === 0) {
    actions.push(log({ type: "INFO", priority: "info", message: "Hospital status nominal — no immediate interventions required", details: { capacity: capacity.occupancyRate } }));
  }

  const summary = buildSummary(actions);

  // Broadcast critical actions via WebSocket
  const critical = actions.filter((a) => a.priority === "critical");
  if (critical.length > 0) {
    broadcastPatientUpdate({ source: "hospital_agent", runId, criticalActions: critical.length, summary });
  }

  return { runId, actions, summary, durationMs: Date.now() - t0, runAt: new Date().toISOString() };
}

function buildSummary(actions: AgentAction[]): string {
  const byCriticality = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const a of actions) byCriticality[a.priority]++;
  const parts = Object.entries(byCriticality).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`);
  return `Agent run: ${parts.join(", ")} action(s)`;
}

export function getActionLog(limit = 50): AgentAction[] {
  return actionLog.slice(0, limit);
}

export function resolveAction(id: string): boolean {
  const action = actionLog.find((a) => a.id === id);
  if (!action) return false;
  action.resolved = true;
  return true;
}

export function getAgentStats() {
  return {
    totalRuns,
    totalActions:     actionLog.length,
    unresolvedCritical: actionLog.filter((a) => a.priority === "critical" && !a.resolved).length,
    unresolvedHigh:   actionLog.filter((a) => a.priority === "high"     && !a.resolved).length,
    lastRunAt:        actionLog[0]?.timestamp ?? null,
  };
}

/**
 * Physician Override Controller — FDA-traceable physician approval system
 * All override requests are logged with physician ID, timestamp, and reason.
 */

import { logEvent } from "../ops/auditEvents";
import { broadcastPatientUpdate } from "../realtime/patientStream";

export interface OverrideRequest {
  actionId:     string;
  agentRole:    string;
  action:       string;
  patientId?:   string;
  requestedAt:  string;
  reason?:      string;
}

export interface OverrideApproval {
  approved:      boolean;
  actionId:      string;
  physicianId:   string;
  physicianNote?:string;
  timestamp:     number;
  isoTime:       string;
}

const pendingOverrides = new Map<string, OverrideRequest>();
const approvedOverrides: OverrideApproval[] = [];

export function requestOverride(req: Omit<OverrideRequest, "requestedAt">): OverrideRequest {
  const full: OverrideRequest = { ...req, requestedAt: new Date().toISOString() };
  pendingOverrides.set(req.actionId, full);

  broadcastPatientUpdate({ type: "OVERRIDE_REQUESTED", payload: full });

  logEvent({
    actor:      req.agentRole,
    action:     "override:requested",
    entityType: "physician_override",
    entityId:   req.actionId,
    details:    full,
  });

  return full;
}

export async function approveOverride(
  actionId:     string,
  physicianId:  string,
  physicianNote?: string
): Promise<OverrideApproval> {
  const now = Date.now();
  const approval: OverrideApproval = {
    approved:      true,
    actionId,
    physicianId,
    physicianNote,
    timestamp:     now,
    isoTime:       new Date(now).toISOString(),
  };

  pendingOverrides.delete(actionId);
  approvedOverrides.push(approval);

  broadcastPatientUpdate({ type: "OVERRIDE_APPROVED", payload: approval });

  logEvent({
    actor:      physicianId,
    action:     "override:approved",
    entityType: "physician_override",
    entityId:   actionId,
    details:    approval,
  });

  return approval;
}

export async function denyOverride(actionId: string, physicianId: string, reason: string) {
  pendingOverrides.delete(actionId);
  const denial = { denied: true, actionId, physicianId, reason, at: new Date().toISOString() };
  broadcastPatientUpdate({ type: "OVERRIDE_DENIED", payload: denial });
  return denial;
}

export function getPendingOverrides(): OverrideRequest[] {
  return [...pendingOverrides.values()];
}

export function getApprovedOverrides(): OverrideApproval[] {
  return [...approvedOverrides];
}

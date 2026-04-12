/**
 * Action Guard — every agent action flows through this before execution
 * Applies scope engine evaluation + delegation check + audit logging.
 */

import { scopeEngine, type ActionRequest, type ScopeDecision } from "../scope/agentScopeEngine";
import { isDelegated }   from "../scope/delegation";
import { logEvent }      from "../ops/auditEvents";
import { broadcastPatientUpdate } from "../realtime/patientStream";

export interface GuardResult {
  allowed:          boolean;
  status:           "APPROVED" | "BLOCKED" | "PENDING_OVERRIDE";
  reason?:          string;
  requiresOverride?:boolean;
  auditLevel?:      string;
  evaluatedAt:      string;
}

export async function guardAction(request: ActionRequest): Promise<GuardResult> {
  let decision: ScopeDecision = scopeEngine.evaluate(request);

  // Check delegated scope if primary scope denied
  if (!decision.allowed && isDelegated(request.agentRole, request.action)) {
    decision = { allowed: true, reason: "Granted via scope delegation", authority: "implied", auditLevel: "MEDIUM" };
  }

  const logEntry = {
    timestamp:        Date.now(),
    agent:            request.agentRole,
    action:           request.action,
    allowed:          decision.allowed,
    reason:           decision.reason ?? null,
    requiresOverride: decision.requiresOverride ?? false,
    auditLevel:       decision.auditLevel ?? "LOW",
    context:          request.context,
  };

  // Audit hash chain log
  try {
    logEvent({
      actor:      request.agentRole,
      action:     `scope:${decision.allowed ? "allowed" : "blocked"}:${request.action}`,
      entityType: "scope_decision",
      entityId:   `${request.agentRole}:${request.action}`,
      details:    logEntry,
    });
  } catch { /* non-blocking */ }

  // Broadcast to Control Tower UI
  broadcastPatientUpdate({ type: "SCOPE_EVENT", payload: logEntry });

  const evaluatedAt = new Date().toISOString();

  if (!decision.allowed) {
    if (decision.requiresOverride) {
      return { allowed: false, status: "PENDING_OVERRIDE", reason: decision.reason, requiresOverride: true, auditLevel: decision.auditLevel, evaluatedAt };
    }
    return { allowed: false, status: "BLOCKED", reason: decision.reason, auditLevel: decision.auditLevel, evaluatedAt };
  }

  return { allowed: true, status: "APPROVED", auditLevel: decision.auditLevel, evaluatedAt };
}

// Synchronous version for performance-critical hot paths
export function guardActionSync(request: ActionRequest): boolean {
  const d = scopeEngine.evaluate(request);
  if (!d.allowed && isDelegated(request.agentRole, request.action)) return true;
  return d.allowed;
}

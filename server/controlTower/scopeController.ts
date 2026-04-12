/**
 * Scope Controller — control tower integration for scope evaluation + broadcast
 * Every scoped action passes through evaluateAndExecuteAction()
 */

import { scopeEngine }                from "../scope/agentScopeEngine";
import { isDelegated }                from "../scope/delegation";
import { logEvent }                   from "../ops/auditEvents";
import { broadcastPatientUpdate }     from "../realtime/patientStream";
import type { ActionRequest }         from "../scope/agentScopeEngine";

export interface ScopeControllerResult {
  status:           "APPROVED" | "PENDING_OVERRIDE" | "BLOCKED";
  message?:         string;
  logEntry?:        Record<string, any>;
}

export async function evaluateAndExecuteAction(request: ActionRequest): Promise<ScopeControllerResult> {
  let result = scopeEngine.evaluate(request);

  // Check delegation override
  if (!result.allowed && isDelegated(request.agentRole, request.action)) {
    result = { allowed: true, reason: "Delegated scope", authority: "implied", auditLevel: "MEDIUM" };
  }

  const logEntry: Record<string, any> = {
    timestamp:        Date.now(),
    agent:            request.agentRole,
    action:           request.action,
    allowed:          result.allowed,
    reason:           result.reason ?? null,
    requiresOverride: result.requiresOverride ?? false,
    auditLevel:       result.auditLevel ?? "LOW",
    context:          request.context,
  };

  // Audit log (hash chain)
  try {
    logEvent({
      actor:      request.agentRole,
      action:     `scope_controller:${result.allowed ? "approved" : "blocked"}:${request.action}`,
      entityType: "scope_controller",
      entityId:   `${request.agentRole}:${request.action}`,
      details:    logEntry,
    });
  } catch { /* non-blocking */ }

  // WebSocket → Control Tower dashboard live feed
  broadcastPatientUpdate({ type: "SCOPE_EVENT", payload: logEntry });

  if (!result.allowed) {
    if (result.requiresOverride) {
      return { status: "PENDING_OVERRIDE", message: "Physician approval required", logEntry };
    }
    return { status: "BLOCKED", message: `Scope blocked: ${result.reason}`, logEntry };
  }

  return { status: "APPROVED", logEntry };
}

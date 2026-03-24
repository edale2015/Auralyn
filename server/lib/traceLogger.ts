import { auditLog, AuditEvent } from "../security/auditLogger";

export function trace(
  actor: string,
  action: string,
  details?: Record<string, unknown>
): void {
  auditLog({ actor, action, details } as AuditEvent);
}

import { appendAuditEntry } from "../services/auditHashChain";

export interface AuditEventInput {
  tenantId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  justification?: string | null;
  payload?: Record<string, unknown>;
}

export async function appendAuditEvent(input: AuditEventInput): Promise<string> {
  return appendAuditEntry(
    input.action,
    {
      tenantId: input.tenantId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      justification: input.justification ?? null,
      ...(input.payload ?? {}),
    },
    input.actorId ?? "system"
  );
}

import { query } from "../db/dbRouter";

export interface AuditEntry {
  id: string;
  clinic_id?: string | null;
  trace_id?: string | null;
  actor_id?: string | null;
  event_type: string;
  entity_type?: string | null;
  entity_id?: string | null;
  data?: unknown;
  created_at: Date;
}

export async function appendAuditLog(input: {
  clinicId?: string;
  traceId?: string;
  actorId?: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  data?: unknown;
}): Promise<AuditEntry> {
  const result = await query(
    `INSERT INTO audit_logs (clinic_id, trace_id, actor_id, event_type, entity_type, entity_id, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.clinicId ?? null,
      input.traceId ?? null,
      input.actorId ?? null,
      input.eventType,
      input.entityType ?? null,
      input.entityId ?? null,
      input.data ? JSON.stringify(input.data) : null
    ]
  );
  return result.rows[0];
}

export async function listAuditLogs(limit = 200, clinicId?: string, eventType?: string): Promise<AuditEntry[]> {
  if (clinicId && eventType) {
    const r = await query(`SELECT * FROM audit_logs WHERE clinic_id = $1 AND event_type = $2 ORDER BY created_at DESC LIMIT $3`, [clinicId, eventType, limit]);
    return r.rows;
  }
  if (clinicId) {
    const r = await query(`SELECT * FROM audit_logs WHERE clinic_id = $1 ORDER BY created_at DESC LIMIT $2`, [clinicId, limit]);
    return r.rows;
  }
  const r = await query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`, [limit]);
  return r.rows;
}

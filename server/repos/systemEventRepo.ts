import { query } from "../db/dbRouter";

export interface SystemEvent {
  id: string;
  event_name: string;
  severity: string;
  source?: string | null;
  payload?: unknown;
  created_at: Date;
}

export async function appendSystemEvent(input: {
  eventName: string;
  severity?: string;
  source?: string;
  payload?: unknown;
}): Promise<SystemEvent> {
  try {
    const result = await query(
      `INSERT INTO system_events (event_name, severity, source, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.eventName,
        input.severity ?? "info",
        input.source ?? null,
        input.payload ? JSON.stringify(input.payload) : null
      ]
    );
    return result.rows[0];
  } catch {
    return {
      id: `noop-${Date.now()}`,
      event_name: input.eventName,
      severity: input.severity ?? "info",
      source: input.source,
      payload: input.payload,
      created_at: new Date()
    };
  }
}

export async function listSystemEvents(limit = 200, severity?: string): Promise<SystemEvent[]> {
  const result = severity
    ? await query(`SELECT * FROM system_events WHERE severity = $1 ORDER BY created_at DESC LIMIT $2`, [severity, limit])
    : await query(`SELECT * FROM system_events ORDER BY created_at DESC LIMIT $1`, [limit]);
  return result.rows;
}

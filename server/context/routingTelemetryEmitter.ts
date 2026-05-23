/**
 * routingTelemetryEmitter.ts — T019
 *
 * Emits one routing_telemetry row for every routing decision made by modelRouter.ts.
 * Keeps the DB write async and non-blocking (never throws on failure).
 */

import { Pool } from "pg";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

export interface RoutingRecord {
  purpose:      string;
  provider:     string;
  model:        string;
  pinned:       boolean;
  score:        number | null;
  encounter_id?: string;
}

export async function emitRoutingDecision(rec: RoutingRecord): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO routing_telemetry (agent, chosen_model, pinned, score, encounter_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [rec.purpose, rec.model, rec.pinned, rec.score ?? null, rec.encounter_id ?? null]
    );
  } catch (err: any) {
    // Non-blocking — telemetry failure must never break the clinical path
    console.warn("[RoutingTelemetry] Write failed (non-fatal):", err.message);
  }
}

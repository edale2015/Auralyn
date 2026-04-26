import { sql } from "drizzle-orm";
import { db } from "../db";

export interface PersistedLoopState {
  id: string;
  running: boolean;
  cycleCount: number;
  lastCycleAt: string | null;
  startedAt: string | null;
  errors: number;
  updatedAt: string;
}

const LOOP_ID = process.env.AGENT_BRAIN_LOOP_ID || "main";

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return new Date(String(value)).toISOString();
}

export async function loadLoopStateSnapshot(): Promise<PersistedLoopState | null> {
  const result = await db.execute(sql`
    SELECT id, running, cycle_count, last_cycle_at, started_at, errors, updated_at
    FROM agent_loop_state
    WHERE id = ${LOOP_ID}
    LIMIT 1
  `);
  const rows = (result as any).rows ?? result;
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    running: !!row.running,
    cycleCount: Number(row.cycle_count ?? 0),
    lastCycleAt: toIso(row.last_cycle_at),
    startedAt: toIso(row.started_at),
    errors: Number(row.errors ?? 0),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

export async function saveLoopStateSnapshot(state: {
  running: boolean;
  cycleCount: number;
  lastCycleMs: number | null;
  startedAt: number | null;
  errors: number;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO agent_loop_state (id, running, cycle_count, last_cycle_at, started_at, errors, updated_at)
    VALUES (
      ${LOOP_ID},
      ${state.running},
      ${state.cycleCount},
      ${state.lastCycleMs ? new Date(state.lastCycleMs) : null},
      ${state.startedAt ? new Date(state.startedAt) : null},
      ${state.errors},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (id) DO UPDATE SET
      running = EXCLUDED.running,
      cycle_count = EXCLUDED.cycle_count,
      last_cycle_at = EXCLUDED.last_cycle_at,
      started_at = EXCLUDED.started_at,
      errors = EXCLUDED.errors,
      updated_at = CURRENT_TIMESTAMP
  `);
}

export async function recordAgentCycleResult(result: any): Promise<void> {
  await db.execute(sql`
    INSERT INTO agent_cycle_results (
      patient_id,
      clinic_site_id,
      risk,
      icu,
      safety,
      routing,
      insights,
      audit_hash,
      result_redacted,
      created_at
    ) VALUES (
      ${String(result.patientId ?? "unknown")},
      ${result.clinicSiteId ?? result.vitals?.clinicSiteId ?? null},
      ${JSON.stringify(result.risk ?? {})}::jsonb,
      ${JSON.stringify(result.icu ?? {})}::jsonb,
      ${JSON.stringify(result.safety ?? {})}::jsonb,
      ${JSON.stringify(result.routing ?? {})}::jsonb,
      ${JSON.stringify(result.insights ?? [])}::jsonb,
      ${result.auditHash ?? null},
      ${JSON.stringify({
        patientRef: result.patientRef,
        risk: result.risk,
        icu: result.icu,
        safety: result.safety,
        routing: result.routing,
        clinicalDecision: result.clinicalDecision
          ? {
              mode: result.clinicalDecision.mode,
              finalRisk: result.clinicalDecision.finalRisk,
              requiresPhysicianReview: result.clinicalDecision.requiresPhysicianReview,
            }
          : undefined,
        ts: result.ts,
      })}::jsonb,
      CURRENT_TIMESTAMP
    )
  `);
}

/**
 * server/audit/traceStore.ts — Execution trace persistence
 *
 * FIX (Batch-1 Finding #6 — High): Agent execution traces now written to the
 * execution_traces DB table on every save. In-memory array remains for fast
 * recent-record lookups (last 200 entries), but is no longer the source of
 * truth. Traces survive server restart and are not capped at 200 entries.
 *
 * Previously: module-level array, 200-trace cap, cleared on restart. An
 * urgent care shift handling 100+ patients generates traces for <2h only.
 */

import crypto              from "crypto";
import { db }              from "../db";
import { executionTraces } from "../../shared/schema";
import { eq, desc }        from "drizzle-orm";
import { logger }          from "../utils/logger";

export interface AgentTraceStep {
  agent:     string;
  input:     Record<string, unknown>;
  output:    Record<string, unknown>;
  timestamp: number;
  durationMs:number;
}

export interface ExecutionTrace {
  id:        string;
  patientId: string | undefined;
  complaint: string | undefined;
  steps:     AgentTraceStep[];
  createdAt: string;
  totalMs:   number;
}

// In-memory cache — recent lookups only, NOT source of truth
const MAX_CACHE = 200;
const cache: ExecutionTrace[] = [];

export async function saveTrace(
  trace: Omit<ExecutionTrace, "id" | "createdAt">
): Promise<ExecutionTrace> {
  const full: ExecutionTrace = {
    ...trace,
    id:        crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  // Persist to DB first
  try {
    await db.insert(executionTraces).values({
      id:        full.id,
      patientId: full.patientId,
      complaint: full.complaint,
      steps:     full.steps as any,
      totalMs:   full.totalMs,
    });
  } catch (err: any) {
    // Log but don't silently drop — caller should know persistence failed
    logger.error("trace_persist_failed", { id: full.id, error: err?.message });
    throw new Error(`Trace persistence failed: ${err?.message}`);
  }

  // Update in-memory cache
  cache.unshift(full);
  if (cache.length > MAX_CACHE) cache.splice(MAX_CACHE);

  return full;
}

export async function getTrace(id: string): Promise<ExecutionTrace | undefined> {
  // Check in-memory cache first
  const cached = cache.find((t) => t.id === id);
  if (cached) return cached;

  // Fall back to DB
  try {
    const rows = await db
      .select()
      .from(executionTraces)
      .where(eq(executionTraces.id, id));

    if (rows.length === 0) return undefined;
    const row = rows[0];
    return {
      id:        row.id,
      patientId: row.patientId ?? undefined,
      complaint: row.complaint ?? undefined,
      steps:     (row.steps as AgentTraceStep[]) ?? [],
      totalMs:   row.totalMs ?? 0,
      createdAt: row.createdAt.toISOString(),
    };
  } catch {
    return undefined;
  }
}

export async function listTraces(limit = 20): Promise<ExecutionTrace[]> {
  // Serve from cache if warm enough
  if (cache.length >= Math.min(limit, MAX_CACHE)) {
    return cache.slice(0, limit);
  }

  try {
    const rows = await db
      .select()
      .from(executionTraces)
      .orderBy(desc(executionTraces.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id:        row.id,
      patientId: row.patientId ?? undefined,
      complaint: row.complaint ?? undefined,
      steps:     (row.steps as AgentTraceStep[]) ?? [],
      totalMs:   row.totalMs ?? 0,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch {
    return cache.slice(0, limit);
  }
}

export function traceCount(): number {
  return cache.length;
}

export function clearTraces(): void {
  cache.splice(0);
}

/**
 * Weight Store — write-through to kb_clinical_weights + kb_weight_events
 *
 * In-memory map serves as a fast read cache.
 * All writes persist immediately to Postgres so weights survive restarts.
 * Falls back to in-memory-only if DB is unavailable (dev safety).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ── In-memory cache ───────────────────────────────────────────────────────────

const weights: Record<string, number> = {};
const history: Array<{ key: string; delta: number; newValue: number; timestamp: string }> = [];
let _loaded = false;

function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

// ── Load from DB on first use ─────────────────────────────────────────────────

async function ensureLoaded(): Promise<void> {
  if (_loaded) return;
  try {
    const rows = extractRows(await db.execute(sql`
      SELECT key, value FROM kb_clinical_weights ORDER BY key
    `));
    for (const r of rows) {
      weights[r.key] = Number(r.value);
    }
    _loaded = true;
    console.log(`[weightStore] Loaded ${rows.length} weights from kb_clinical_weights`);
  } catch (e: any) {
    console.warn("[weightStore] Could not load from DB, using in-memory only:", e.message);
    _loaded = true; // prevent retry loop
  }
}

// ── Write-through helpers ─────────────────────────────────────────────────────

async function persistWeight(key: string, newValue: number, delta: number): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO kb_clinical_weights (key, value, description, updated_at)
      VALUES (${key}, ${newValue}, ${"RLHF weight"}, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `);
    await db.execute(sql`
      INSERT INTO kb_weight_events (key, delta, new_value) VALUES (${key}, ${delta}, ${newValue})
    `);
  } catch (e: any) {
    console.warn(`[weightStore] Persist failed for ${key}:`, e.message);
  }
}

// ── Public API (sync reads, async writes) ─────────────────────────────────────

export function updateWeight(key: string, delta: number): void {
  const current = weights[key] ?? 1.0;
  const newValue = current + delta;
  weights[key] = newValue;
  history.push({ key, delta, newValue, timestamp: new Date().toISOString() });
  // Fire-and-forget DB persist
  persistWeight(key, newValue, delta).catch(() => {});
  // Trigger async load on first write if not loaded yet
  if (!_loaded) ensureLoaded().catch(() => {});
}

export function getWeight(key: string): number {
  return weights[key] ?? 1.0;
}

export function getAllWeights(): Record<string, number> {
  return { ...weights };
}

export function getWeightHistory(): Array<{ key: string; delta: number; newValue?: number; timestamp: string }> {
  return [...history];
}

export function resetWeights(): void {
  Object.keys(weights).forEach(k => delete weights[k]);
  history.length = 0;
}

// Async getter: ensures DB load before returning
export async function getWeightAsync(key: string): Promise<number> {
  await ensureLoaded();
  return weights[key] ?? 1.0;
}

export async function getAllWeightsAsync(): Promise<Record<string, number>> {
  await ensureLoaded();
  return { ...weights };
}

// Boot: preload weights into memory
export async function initWeightStore(): Promise<void> {
  await ensureLoaded();
}

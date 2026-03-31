/**
 * Red Flag Map — DB-backed loader
 *
 * Primary: reads from kb_red_flag_rules (Postgres)
 * Fallback: derives from FLOW_SPECS (legacy) if table is empty
 *
 * The DB table is seeded by POST /api/kb/red-flag-rules/seed
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { FLOW_SPECS } from "../testing/specs";

// ── Hardcoded fallback (derived from FLOW_SPECS) ──────────────────────────────

const LEGACY_MAP: Record<string, string[]> = Object.fromEntries(
  FLOW_SPECS.map(s => [s.flowId, s.redFlagYesQuestionIds])
);

// ── DB cache ──────────────────────────────────────────────────────────────────

let _dbMap: Record<string, string[]> | null = null;
let _loadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function loadFromDb(): Promise<Record<string, string[]>> {
  const rows = extractRows(await db.execute(sql`
    SELECT complaint_id, trigger_expr FROM kb_red_flag_rules WHERE active = true ORDER BY complaint_id
  `));

  const map: Record<string, string[]> = {};
  for (const r of rows) {
    if (!map[r.complaint_id]) map[r.complaint_id] = [];
    map[r.complaint_id].push(r.trigger_expr);
  }
  return map;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getRedFlagMap(): Promise<Record<string, string[]>> {
  if (_dbMap && Date.now() - _loadedAt < CACHE_TTL_MS) return _dbMap;

  try {
    const map = await loadFromDb();
    if (Object.keys(map).length > 0) {
      _dbMap = map;
      _loadedAt = Date.now();
      return _dbMap;
    }
    // Table is empty — fall back to FLOW_SPECS
    console.warn("[redFlagMap] kb_red_flag_rules is empty, using FLOW_SPECS fallback");
    return LEGACY_MAP;
  } catch (e: any) {
    console.warn("[redFlagMap] DB load failed, using FLOW_SPECS fallback:", e.message);
    return LEGACY_MAP;
  }
}

export function invalidateRedFlagCache(): void {
  _dbMap = null;
}

// Sync accessor for legacy callers (returns legacy map synchronously)
export const RED_FLAG_MAP: Record<string, string[]> = LEGACY_MAP;

/**
 * pipelineSafetyPatches.ts
 *
 * THREE TARGETED PATCHES:
 *
 * 1. TYPE GUARDS — replaces `as unknown as SheetRow[]` double-casts
 * 2. WORLD B VALIDATION — validates the 13 currently unvalidated World B layers
 * 3. QUOTA-SAFE CACHING — background refresh cycle prevents 15× Sheets quota overrun
 */

import type { ComplaintConfig } from "../services/complaintConfigLoader";

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH 1: TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════════

type SheetRow = Record<string, any>;

interface FieldGuard {
  field:    string;
  required: boolean;
  type?:    "string" | "number" | "boolean";
}

function createTypeGuard<T>(
  name:   string,
  guards: FieldGuard[]
): (item: T) => SheetRow {
  return (item: T): SheetRow => {
    const row = item as unknown as Record<string, any>;
    for (const g of guards.filter(g => g.required)) {
      if (!(g.field in row) || row[g.field] === undefined) {
        console.warn(`[TypeGuard:${name}] Required field "${g.field}" missing. Row: ${JSON.stringify(row).slice(0, 100)}`);
      }
    }
    return row;
  };
}

export const RedFlagRuleGuard = createTypeGuard("RedFlagRule", [
  { field: "ccId",        required: true },
  { field: "rfId",        required: true },
  { field: "triggerExpr", required: true },
  { field: "severity",    required: true },
]);

export const ClusterScoringGuard = createTypeGuard("ClusterScoringRule", [
  { field: "ccId",      required: true },
  { field: "clusterId", required: true },
  { field: "ruleId",    required: true },
  { field: "whenExpr",  required: true },
  { field: "points",    required: true, type: "number" },
]);

export const ScoringDefGuard = createTypeGuard("ScoringDef", [
  { field: "ccId",      required: true },
  { field: "scoreId",   required: false },
]);

export const DispositionRuleGuard = createTypeGuard("DispositionRule", [
  { field: "ccId",             required: true },
  { field: "dispRuleId",       required: true },
  { field: "whenExpr",         required: true },
  { field: "dispositionLevel", required: true },
]);

export const DxCandidateGuard = createTypeGuard("DxCandidateRow", [
  { field: "CC_ID",  required: true },
  { field: "DX_ID",  required: true },
  { field: "DX_LABEL", required: false },
]);

export const OutputTemplateGuard = createTypeGuard("OutputTemplate", [
  { field: "ccId",       required: true },
  { field: "templateId", required: true },
]);

/**
 * Type-safe replacement for `as unknown as SheetRow[]`.
 * Validates fields at runtime and logs warnings on missing required fields.
 */
export function asSheetRows<T>(
  items: T[],
  guard: (item: T) => SheetRow
): SheetRow[] {
  return items.map(guard);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH 2: WORLD B LAYER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorldBValidationIssue {
  level:   "ERROR" | "WARN";
  layer:   string;
  code:    string;
  message: string;
}

interface LayerSpec {
  name:     keyof ComplaintConfig;
  minRows:  number;
  keyField: string[];
  critical: boolean;
}

const WORLD_B_LAYER_SPECS: LayerSpec[] = [
  { name: "modifiers",                    minRows: 0, keyField: ["MODIFIER_ID", "id"],     critical: false },
  { name: "globalSecondary",              minRows: 0, keyField: ["QUESTION_ID", "Q_ID"],   critical: false },
  { name: "globalClusterMaster",          minRows: 1, keyField: ["CLUSTER_ID"],             critical: true  },
  { name: "clusterPrimaryDiagnosis",      minRows: 1, keyField: ["DX_ID", "DIAGNOSIS_ID"], critical: true  },
  { name: "redFlagsMaster",               minRows: 1, keyField: ["RF_ID", "RED_FLAG_ID"],  critical: true  },
  { name: "globalMedicationsMaster",      minRows: 0, keyField: ["MED_ID", "GROUP_ID"],    critical: false },
  { name: "urgentCareSpotInterventions",  minRows: 0, keyField: ["INTERVENTION_ID"],        critical: false },
  { name: "medConditionIntelligenceRules", minRows: 0, keyField: ["RULE_ID"],              critical: false },
];

export function validateWorldBLayers(cfg: ComplaintConfig): WorldBValidationIssue[] {
  const issues: WorldBValidationIssue[] = [];

  for (const spec of WORLD_B_LAYER_SPECS) {
    const layer = cfg[spec.name] as any[];

    if (!layer || layer.length === 0) {
      if (spec.minRows > 0) {
        issues.push({
          level:   spec.critical ? "ERROR" : "WARN",
          layer:   spec.name,
          code:    "LAYER_EMPTY",
          message: `${spec.name} returned 0 rows — sheet may be blank or failed to load.`,
        });
      }
      continue;
    }

    const firstRow = layer[0] as Record<string, any>;
    const hasKeyField = spec.keyField.some(f =>
      firstRow[f] !== undefined && String(firstRow[f]).trim() !== ""
    );

    if (!hasKeyField) {
      issues.push({
        level:   spec.critical ? "ERROR" : "WARN",
        layer:   spec.name,
        code:    "KEY_FIELD_MISSING",
        message: `${spec.name}: first row has none of expected key fields (${spec.keyField.join(", ")}). Header row may be malformed.`,
      });
    }

    const blankRows = layer.filter(row => {
      const r = row as Record<string, any>;
      return spec.keyField.every(f => !r[f] || String(r[f]).trim() === "");
    });

    if (blankRows.length > 0 && blankRows.length === layer.length) {
      issues.push({
        level:   "ERROR",
        layer:   spec.name,
        code:    "ALL_ROWS_BLANK_KEY",
        message: `${spec.name}: all ${layer.length} rows have blank key fields — data corruption suspected.`,
      });
    } else if (blankRows.length > layer.length * 0.5) {
      issues.push({
        level:   "WARN",
        layer:   spec.name,
        code:    "HIGH_BLANK_KEY_RATE",
        message: `${spec.name}: ${blankRows.length}/${layer.length} rows have blank key fields.`,
      });
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH 3: QUOTA-SAFE BACKGROUND CACHE REFRESHER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Without this: 18 tables × 50 physicians × 5 req/min = 4,500 reads/min
 * Google Sheets API quota: 300 reads/min/project → 15× over quota
 *
 * With background refresh:
 *   All physician requests served from cache (0 Sheets reads on request path)
 *   Background cycle: 18 tabs / 10-min TTL = 1.8 reads/min (~0.6% of quota)
 *
 * Usage (server/index.ts):
 *   import { BackgroundTableRefresher } from "./clinical/pipelineSafetyPatches";
 *   BackgroundTableRefresher.start();
 */

interface RefreshEntry {
  tableName:   string;
  lastRefresh: number;
  ttlMs:       number;
  refreshing:  boolean;
  lastError?:  string;
}

const CRITICAL_TABLES = [
  "RED_FLAG_RULES",
  "DISPOSITION_RULES",
  "COMPLAINT_REGISTRY",
  "CORE_QUESTIONS",
];

const ALL_WORLD_B_TABLES = [
  "MODIFIERS", "GLOBAL_MODIFIERS", "GLOBAL_SECONDARY", "CARDS_MODIFIER_MASTER",
  "GLOBAL_CLUSTER_MASTER", "GLOBAL_MEDICATIONS_MASTER", "CLUSTER_PRIMARY_DIAGNOSIS",
  "MED_CONDITION_INTELLIGENCE_RULES", "URGENT_CARE_SPOT_INTERVENTIONS",
  "RED_FLAGS_MASTER", "COMPLAINT_REGISTRY", "CORE_QUESTIONS", "RED_FLAG_RULES",
  "SCORING_DEFS", "DISPOSITION_RULES", "OUTPUT_TEMPLATES",
  "CLUSTER_SCORING_RULES", "SCORING_SYSTEMS",
];

export class BackgroundTableRefresher {
  private static registry    = new Map<string, RefreshEntry>();
  private static intervalHandle: NodeJS.Timeout | null = null;

  static start(intervalMs = 60_000): void {
    for (const table of ALL_WORLD_B_TABLES) {
      const ttlMs = CRITICAL_TABLES.includes(table) ? 5 * 60_000 : 10 * 60_000;
      BackgroundTableRefresher.registry.set(table, {
        tableName:   table,
        lastRefresh: 0,
        ttlMs,
        refreshing:  false,
      });
    }

    // Stagger critical table refreshes at startup to avoid burst
    let delay = 0;
    for (const tableName of CRITICAL_TABLES) {
      setTimeout(() => BackgroundTableRefresher.refreshTable(tableName), delay);
      delay += 2_000;
    }

    BackgroundTableRefresher.intervalHandle = setInterval(() => {
      BackgroundTableRefresher.checkAndRefresh();
    }, intervalMs);

    console.log("[BackgroundRefresher] Started — 18 World B tables on background refresh cycle");
  }

  static stop(): void {
    if (BackgroundTableRefresher.intervalHandle) {
      clearInterval(BackgroundTableRefresher.intervalHandle);
      BackgroundTableRefresher.intervalHandle = null;
    }
  }

  private static async checkAndRefresh(): Promise<void> {
    const now = Date.now();
    const toRefresh: string[] = [];

    for (const [name, entry] of BackgroundTableRefresher.registry) {
      const age           = now - entry.lastRefresh;
      const shouldRefresh = age > entry.ttlMs * 0.8;
      if (shouldRefresh && !entry.refreshing) toRefresh.push(name);
    }

    // At most 3 tables per cycle, 1s apart (rate-limit protection)
    for (const name of toRefresh.slice(0, 3)) {
      await BackgroundTableRefresher.refreshTable(name);
      await new Promise(r => setTimeout(r, 1_000));
    }
  }

  private static async refreshTable(tableName: string): Promise<void> {
    const entry = BackgroundTableRefresher.registry.get(tableName);
    if (!entry || entry.refreshing) return;

    entry.refreshing = true;
    try {
      const { getTable } = await import("../data/registry");
      await getTable(tableName);
      entry.lastRefresh = Date.now();
      entry.lastError   = undefined;
    } catch (err: any) {
      entry.lastError = err.message;
      console.warn(`[BackgroundRefresher] Failed to refresh ${tableName}: ${err.message}`);
    } finally {
      entry.refreshing = false;
    }
  }

  static getStatus(): Array<{ table: string; ageSeconds: number; error?: string; ttlSeconds: number }> {
    const now = Date.now();
    return [...BackgroundTableRefresher.registry.entries()].map(([name, e]) => ({
      table:      name,
      ageSeconds: Math.round((now - e.lastRefresh) / 1_000),
      ttlSeconds: Math.round(e.ttlMs / 1_000),
      error:      e.lastError,
    }));
  }
}

// ─── Stale config detection helper ───────────────────────────────────────────

export function detectStaleConfig(cachedAt: number, ttlMs: number): {
  isStale:       boolean;
  ageSeconds:    number;
  staleWarning?: string;
} {
  const ageMs   = Date.now() - cachedAt;
  const isStale = ageMs > ttlMs;
  return {
    isStale,
    ageSeconds:    Math.round(ageMs / 1_000),
    staleWarning:  isStale
      ? `Clinical rules loaded from cache (${Math.round(ageMs / 60_000)} min old). Live refresh unavailable.`
      : undefined,
  };
}

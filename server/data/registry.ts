import { getSheetRows } from "../sheets/sheetHelper";
import { loadCsvTable } from "./csvLoader";

type SheetRow = Record<string, any>;

interface CacheEntry {
  expiresAt: number;
  rows: SheetRow[];
}

const TABLE_CACHE = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 10 * 60 * 1000;

const TABLE_CONFIG: Record<string, { tab: string; range?: string; ttlMs?: number }> = {
  CHIEF_COMPLAINT_ROUTER: { tab: "CHIEF_COMPLAINT_ROUTER" },
  INTEGRATION_MAP: { tab: "INTEGRATION_MAP" },
  GLOBAL_SECONDARY: { tab: "GLOBAL_SECONDARY", range: "A1:Z5000" },
  CARDS_MODIFIER_MASTER: { tab: "CARDS_MODIFIER_MASTER", range: "A1:Z5000" },
  RULESTRIGGERS: { tab: "RULESTRIGGERS", range: "A1:Z5000" },

  GLOBAL_CLUSTER_MASTER: { tab: "GLOBAL_CLUSTER_MASTER", range: "A1:Z5000" },
  GLOBAL_MEDICATIONS_MASTER: { tab: "GLOBAL_MEDICATIONS_MASTER", range: "A1:Z5000" },
  CLUSTER_PRIMARY_DIAGNOSIS: { tab: "CLUSTER_PRIMARY_DIAGNOSIS", range: "A1:Z2000" },
  MED_TO_CONDITION_TRIGGERS: { tab: "MED_TO_CONDITION_TRIGGERS", range: "A1:Z2000" },
  MED_CONDITION_INTELLIGENCE_RULES: { tab: "MED_CONDITION_INTELLIGENCE_RULES", range: "A1:Z5000" },
  URGENT_CARE_SPOT_INTERVENTIONS: { tab: "URGENT_CARE_SPOT_INTERVENTIONS", range: "A1:Z2000" },

  // Legacy per-system tabs kept for diagnosis resolver fallback (read-only)
  ENT_DIAGNOSIS_MASTER: { tab: "ENT_DIAGNOSIS_MASTER", range: "A1:Z5000" },
  CARD_DIAGNOSIS_MASTER: { tab: "CARD_DIAGNOSIS_MASTER", range: "A1:Z5000" },
  PULM_DIAGNOSIS_MASTER: { tab: "PULM_DIAGNOSIS_MASTER", range: "A1:Z5000" },
  GI_DIAGNOSIS_MASTER: { tab: "GI_DIAGNOSIS_MASTER", range: "A1:Z5000" },
  GU_DIAGNOSIS_MASTER: { tab: "GU_DIAGNOSIS_MASTER", range: "A1:Z5000" },
  DERM_DIAGNOSIS_MASTER: { tab: "DERM_DIAGNOSIS_MASTER", range: "A1:Z5000" },
  MSK_DIAGNOSIS_MASTER: { tab: "MSK_DIAGNOSIS_MASTER", range: "A1:Z5000" },
  NEURO_DIAGNOSIS_MASTER: { tab: "NEURO_DIAGNOSIS_MASTER", range: "A1:Z5000" },
  OPHTH_DIAGNOSIS_MASTER: { tab: "OPHTH_DIAGNOSIS_MASTER", range: "A1:Z5000" },
  GEN_DIAGNOSIS_MASTER: { tab: "GEN_DIAGNOSIS_MASTER", range: "A1:Z5000" },
};

const CSV_ENABLED_TABLES = new Set([
  "MED_CONDITION_INTELLIGENCE_RULES",
  "URGENT_CARE_SPOT_INTERVENTIONS",
]);

export async function loadTable(tableName: string): Promise<SheetRow[]> {
  const now = Date.now();
  const cached = TABLE_CACHE.get(tableName);
  if (cached && cached.expiresAt > now) {
    return cached.rows;
  }

  const config = TABLE_CONFIG[tableName];
  if (!config) {
    console.warn(`[Registry] Unknown table: ${tableName}. Attempting direct sheet load.`);
  }

  const tab = config?.tab ?? tableName;
  const range = config?.range ?? "A1:Z2000";
  const ttl = config?.ttlMs ?? DEFAULT_TTL_MS;

  if (CSV_ENABLED_TABLES.has(tableName)) {
    const csvRows = loadCsvTable(tableName);
    if (csvRows && csvRows.length > 0) {
      TABLE_CACHE.set(tableName, { expiresAt: now + ttl, rows: csvRows });
      return csvRows;
    }
  }

  try {
    const { rowsAsObjects } = await getSheetRows(tab, range);
    console.log(`[Registry] Loaded ${rowsAsObjects.length} rows from ${tab} (cached for ${Math.round(ttl / 1000)}s)`);
    TABLE_CACHE.set(tableName, { expiresAt: now + ttl, rows: rowsAsObjects });
    return rowsAsObjects;
  } catch (err: any) {
    console.error(`[Registry] Failed to load table ${tableName}: ${err.message}`);
    if (cached) {
      console.warn(`[Registry] Returning stale cache for ${tableName}`);
      return cached.rows;
    }
    return [];
  }
}

export function invalidateTable(tableName: string): void {
  TABLE_CACHE.delete(tableName);
  console.log(`[Registry] Invalidated cache for ${tableName}`);
}

export function invalidateAll(): void {
  const count = TABLE_CACHE.size;
  TABLE_CACHE.clear();
  console.log(`[Registry] Invalidated all ${count} cached tables`);
}

export function getCacheStatus(): Array<{ table: string; expiresAt: number; rowCount: number; stale: boolean }> {
  const now = Date.now();
  const status: Array<{ table: string; expiresAt: number; rowCount: number; stale: boolean }> = [];
  for (const [table, entry] of TABLE_CACHE) {
    status.push({
      table,
      expiresAt: entry.expiresAt,
      rowCount: entry.rows.length,
      stale: entry.expiresAt < now,
    });
  }
  return status;
}

export function getRegisteredTables(): string[] {
  return Object.keys(TABLE_CONFIG);
}

export async function getTable(tableName: string): Promise<SheetRow[]> {
  return loadTable(tableName);
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

export async function getTableFiltered(
  tableName: string,
  filters: Record<string, string>
): Promise<SheetRow[]> {
  const rows = await loadTable(tableName);
  return rows.filter(row => {
    for (const [key, val] of Object.entries(filters)) {
      if (norm(row[key]) !== norm(val)) return false;
    }
    return true;
  });
}

export async function getTableGroupedBy(
  tableName: string,
  groupByField: string
): Promise<Map<string, SheetRow[]>> {
  const rows = await loadTable(tableName);
  const grouped = new Map<string, SheetRow[]>();
  for (const row of rows) {
    const key = norm(row[groupByField]);
    if (!key) continue;
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

import { getTable } from "../data/registry";

export interface IntegrationMapping {
  mapId: string;
  fromTable: string;
  fromKeyFields: string[];
  fromValueField: string;
  toTable: string;
  toKeyFields: string[];
  joinType: "contains" | "equals" | "regex" | "lookup";
  transform: string;
  outputField: string;
  notes: string;
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

function parseCsvList(s: any): string[] {
  return String(s ?? "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function rowToMapping(row: Record<string, any>): IntegrationMapping {
  return {
    mapId: norm(row.Map_ID),
    fromTable: norm(row.From_Table),
    fromKeyFields: parseCsvList(row.From_Key_Fields),
    fromValueField: norm(row.From_Value_Field),
    toTable: norm(row.To_Table),
    toKeyFields: parseCsvList(row.To_Key_Fields),
    joinType: (norm(row.Join_Type).toLowerCase() || "equals") as IntegrationMapping["joinType"],
    transform: norm(row.Transform),
    outputField: norm(row.Output_Field),
    notes: norm(row.Notes),
  };
}

let cachedMappings: IntegrationMapping[] | null = null;
let cacheExpiry = 0;

async function ensureLoaded(): Promise<IntegrationMapping[]> {
  const now = Date.now();
  if (cachedMappings && cacheExpiry > now) return cachedMappings;

  const rows = await getTable("INTEGRATION_MAP");
  cachedMappings = rows.map(rowToMapping).filter(m => m.mapId);
  cacheExpiry = now + 10 * 60 * 1000;
  console.log(`[IntegrationMap] Loaded ${cachedMappings.length} mappings`);
  return cachedMappings;
}

export async function getMappingsForOutput(outputField: string): Promise<IntegrationMapping[]> {
  const mappings = await ensureLoaded();
  return mappings.filter(m => m.outputField === outputField);
}

export async function getMappingById(mapId: string): Promise<IntegrationMapping | null> {
  const mappings = await ensureLoaded();
  return mappings.find(m => m.mapId === mapId) ?? null;
}

function normalizeValue(val: string, transform: string): string {
  switch (transform) {
    case "normalize_cluster":
      return val.toUpperCase().replace(/[\s-]+/g, "_");
    case "upper":
      return val.toUpperCase();
    case "split_csv":
      return val;
    default:
      return val;
  }
}

export async function executeJoin(
  mapping: IntegrationMapping,
  sourceValues: Record<string, string>,
  targetRows: Record<string, any>[]
): Promise<Record<string, any>[]> {
  const results: Record<string, any>[] = [];

  for (const targetRow of targetRows) {
    let match = true;

    for (let i = 0; i < mapping.toKeyFields.length; i++) {
      const toField = mapping.toKeyFields[i];
      const fromField = mapping.fromKeyFields[i];
      if (!fromField || !toField) continue;

      const sourceVal = normalizeValue(
        String(sourceValues[fromField] ?? "").toLowerCase(),
        mapping.transform
      );
      const targetVal = String(targetRow[toField] ?? "").toLowerCase();

      switch (mapping.joinType) {
        case "equals":
          if (sourceVal !== targetVal) match = false;
          break;
        case "contains":
          if (!targetVal.includes(sourceVal) && !sourceVal.includes(targetVal)) match = false;
          break;
        case "regex":
          try {
            if (!new RegExp(sourceVal, "i").test(targetVal)) match = false;
          } catch { match = false; }
          break;
        case "lookup":
          if (sourceVal !== targetVal) match = false;
          break;
      }
    }

    if (match) results.push(targetRow);
  }

  return results;
}

export function invalidateIntegrationMapCache(): void {
  cachedMappings = null;
  cacheExpiry = 0;
}

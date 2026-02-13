import { getTable, getTableFiltered } from "../data/registry";
import { normalizeSystem, normalizeChiefComplaint, type SystemKey, type ChiefComplaintKey } from "../data/canonicalKeys";

export interface RouterEntry {
  system: SystemKey;
  chiefComplaint: ChiefComplaintKey;
  defaultCluster: string;
  primarySecondaryBundleId: string;
  modifierSetId: string;
  fhirCore: boolean;
  fhirOptional: string[];
  notes: string;
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

function parseBoolean(s: any): boolean {
  const v = String(s ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "YES" || v === "1";
}

function parseCsvList(s: any): string[] {
  return String(s ?? "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function rowToEntry(row: Record<string, any>): RouterEntry | null {
  const sys = normalizeSystem(norm(row.System));
  const cc = normalizeChiefComplaint(norm(row.Chief_Complaint));
  if (!sys || !cc) return null;

  return {
    system: sys,
    chiefComplaint: cc,
    defaultCluster: norm(row.Default_Cluster),
    primarySecondaryBundleId: norm(row.Primary_Secondary_Bundle_ID),
    modifierSetId: norm(row.Modifier_Set_ID),
    fhirCore: parseBoolean(row.FHIR_Core),
    fhirOptional: parseCsvList(row.FHIR_Optional),
    notes: norm(row.Notes),
  };
}

let cachedEntries: RouterEntry[] | null = null;
let cacheExpiry = 0;

async function ensureLoaded(): Promise<RouterEntry[]> {
  const now = Date.now();
  if (cachedEntries && cacheExpiry > now) return cachedEntries;

  const rows = await getTable("CHIEF_COMPLAINT_ROUTER");
  cachedEntries = rows.map(rowToEntry).filter((e): e is RouterEntry => e !== null);
  cacheExpiry = now + 10 * 60 * 1000;
  console.log(`[ComplaintRouter] Loaded ${cachedEntries.length} router entries`);
  return cachedEntries;
}

export async function getRouterEntry(
  system: string,
  complaint: string
): Promise<RouterEntry | null> {
  const entries = await ensureLoaded();
  const sys = normalizeSystem(system);
  const cc = normalizeChiefComplaint(complaint);
  if (!sys || !cc) return null;

  return entries.find(e => e.system === sys && e.chiefComplaint === cc) ?? null;
}

export async function getRouterEntryByComplaint(
  complaint: string
): Promise<RouterEntry | null> {
  const entries = await ensureLoaded();
  const cc = normalizeChiefComplaint(complaint);
  if (!cc) return null;

  return entries.find(e => e.chiefComplaint === cc) ?? null;
}

export async function getAllRouterEntries(): Promise<RouterEntry[]> {
  return ensureLoaded();
}

export function invalidateRouterCache(): void {
  cachedEntries = null;
  cacheExpiry = 0;
}

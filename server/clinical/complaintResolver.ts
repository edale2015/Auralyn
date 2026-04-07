import { getTable } from "../data/registry";

export interface ParsedComplaint {
  primary: string;
  confidence?: "high" | "low";
}

export interface ComplaintResolution {
  ccId: string;
  source: "primary" | "alias" | "fallback";
  confidence: "high" | "low";
}

interface RegistryEntry {
  ccId: string;
  aliases: string[];
  enabled: boolean;
  scoringModule: string;
  version: number;
}

const FALLBACK_CC_ID = "general_symptom";

const CRITICAL_COMPLAINTS = new Set([
  "chest_pain",
  "chest pain",
  "shortness_of_breath",
  "stroke_symptoms",
]);

const registryCache: { entries: RegistryEntry[] | null; expiresAt: number } = {
  entries: null,
  expiresAt: 0,
};
const REGISTRY_TTL_MS = 5 * 60_000;

export function validateRegistry(registry: RegistryEntry[]): void {
  const seen = new Set<string>();
  for (const entry of registry) {
    if (!entry.ccId?.trim()) {
      throw new Error("[ComplaintResolver] Registry entry missing ccId");
    }
    if (seen.has(entry.ccId)) {
      throw new Error(`[ComplaintResolver] Duplicate complaint id: "${entry.ccId}"`);
    }
    seen.add(entry.ccId);
    if (!entry.scoringModule?.trim()) {
      throw new Error(
        `[ComplaintResolver] Missing scoringModule for ccId="${entry.ccId}"`
      );
    }
  }
}

async function getComplaintRegistry(): Promise<RegistryEntry[]> {
  const now = Date.now();
  if (registryCache.entries && registryCache.expiresAt > now) {
    return registryCache.entries;
  }

  const rows = await getTable("COMPLAINT_REGISTRY");

  const entries: RegistryEntry[] = rows
    .map((r: Record<string, any>) => {
      const ccId = String(r.CC_ID ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
      if (!ccId) return null;
      const aliases = String(r.ALIASES ?? "")
        .split(";")
        .map((a: string) =>
          a
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_")
        )
        .filter(Boolean);
      return {
        ccId,
        aliases,
        enabled: ["true", "yes", "1"].includes(
          String(r.ENABLED ?? "").trim().toLowerCase()
        ),
        scoringModule: String(r.SCORING_MODULE ?? "").trim(),
        version: Number(r.VERSION ?? 1) || 1,
      } satisfies RegistryEntry;
    })
    .filter((e): e is RegistryEntry => e !== null);

  try {
    validateRegistry(entries);
  } catch (err) {
    console.error("[ComplaintResolver] Registry validation failed:", err);
  }

  registryCache.entries = entries;
  registryCache.expiresAt = now + REGISTRY_TTL_MS;
  return entries;
}

export function invalidateComplaintResolverCache(): void {
  registryCache.entries = null;
  registryCache.expiresAt = 0;
}

export async function resolveComplaint(
  parsed: ParsedComplaint | undefined | null
): Promise<ComplaintResolution> {
  if (!parsed?.primary?.trim()) {
    return { ccId: FALLBACK_CC_ID, source: "fallback", confidence: "low" };
  }

  const normalised = parsed.primary.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const inputConfidence = parsed.confidence ?? "high";
  const registry = await getComplaintRegistry();
  const activeEntries = registry.filter((e) => e.enabled);

  const direct = activeEntries.find((e) => e.ccId === normalised);
  if (direct) {
    return { ccId: direct.ccId, source: "primary", confidence: inputConfidence };
  }

  for (const entry of activeEntries) {
    if (entry.aliases.includes(normalised)) {
      return { ccId: entry.ccId, source: "alias", confidence: "low" };
    }
  }

  if (CRITICAL_COMPLAINTS.has(normalised)) {
    throw new Error(
      `[ComplaintResolver] Critical complaint "${normalised}" failed to map — blocking execution`
    );
  }

  return { ccId: FALLBACK_CC_ID, source: "fallback", confidence: "low" };
}

export async function validateScoringModuleForEntry(ccId: string): Promise<void> {
  const registry = await getComplaintRegistry();
  const entry = registry.find((e) => e.ccId === ccId);
  if (!entry) {
    throw new Error(`[ComplaintResolver] No registry entry for ccId="${ccId}"`);
  }
  if (!entry.scoringModule?.trim()) {
    throw new Error(
      `[ComplaintResolver] Invalid (empty) scoring module for ccId="${ccId}"`
    );
  }
}

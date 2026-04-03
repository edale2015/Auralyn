import { pool } from "../db/pool";
import { ClinicalPopulationFlags } from "../db/sharedTypes";

type PriorShiftMap = Record<string, number>;

const priorCache = new Map<string, { value: PriorShiftMap; expiresAt: number }>();
const TTL_MS = 5 * 60_000;

function flagsKey(flags: ClinicalPopulationFlags): string {
  return (
    Object.entries(flags)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort()
      .join("|") || "default"
  );
}

export async function getPopulationPriorMultipliers(
  flags: ClinicalPopulationFlags
): Promise<PriorShiftMap> {
  const key = flagsKey(flags);
  const hit = priorCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const activeFlags = Object.entries(flags)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (!activeFlags.length) {
    const empty: PriorShiftMap = {};
    priorCache.set(key, { value: empty, expiresAt: Date.now() + TTL_MS });
    return empty;
  }

  try {
    const { rows } = await pool.query(
      `SELECT population_flag, diagnosis_key, multiplier
       FROM kb_population_priors
       WHERE population_flag = ANY($1::text[])
         AND active = true`,
      [activeFlags]
    );

    const map: PriorShiftMap = {};
    for (const row of rows) {
      const current = map[row.diagnosis_key] ?? 1;
      map[row.diagnosis_key] = current * Number(row.multiplier);
    }

    priorCache.set(key, { value: map, expiresAt: Date.now() + TTL_MS });
    return map;
  } catch (e: any) {
    console.error("[BayesianPriorService] Failed to load population priors:", e?.message);
    return {};
  }
}

export function invalidatePriorCache(): void {
  priorCache.clear();
  console.log("[BayesianPriorService] Prior cache invalidated");
}

export function getPriorCacheStats(): { size: number; keys: string[] } {
  return { size: priorCache.size, keys: [...priorCache.keys()] };
}

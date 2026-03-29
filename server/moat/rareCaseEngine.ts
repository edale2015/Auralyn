/**
 * Rare Case Engine — Moat Multiplier
 *
 * Tracks per-diagnosis frequency across the entire network.
 * Rare presentations (< 1% of encounters) get a 2× learning-weight boost.
 *
 * The richer our rare-case dataset becomes, the more it differentiates
 * Auralyn from general-purpose LLMs that see mostly common cases.
 */

import { getRedisAsync } from "../queue/redis";

const REDIS_FREQ_KEY  = "moat:rare:dx_frequency";  // hash: dx → count
const REDIS_TOTAL_KEY = "moat:rare:total_seen";
const RARE_THRESHOLD  = 0.01; // < 1% of encounters = rare

export interface RareCaseResult {
  rare:       boolean;
  diagnosis:  string;
  frequency:  number;  // fraction 0-1
  boost:      number;  // learning weight multiplier
  label:      "ULTRA_RARE" | "RARE" | "UNCOMMON" | "COMMON";
}

export async function evaluateRarity(diagnosis: string): Promise<RareCaseResult> {
  const r = await getRedisAsync();

  const dx = diagnosis.toLowerCase().trim();

  if (!r) {
    return { rare: false, diagnosis: dx, frequency: 0.5, boost: 1.0, label: "COMMON" };
  }

  try {
    const [countRaw, totalRaw] = await Promise.all([
      r.hget(REDIS_FREQ_KEY, dx),
      r.get(REDIS_TOTAL_KEY),
    ]);

    const count = Number(countRaw ?? 0);
    const total = Number(totalRaw ?? 1);
    const frequency = total > 0 ? count / total : 0;

    // Increment for this observation
    await Promise.all([
      r.hincrby(REDIS_FREQ_KEY, dx, 1),
      r.incr(REDIS_TOTAL_KEY),
    ]);

    let label: RareCaseResult["label"];
    let boost: number;

    if (frequency < 0.001) {
      label = "ULTRA_RARE"; boost = 3.0;
    } else if (frequency < RARE_THRESHOLD) {
      label = "RARE";       boost = 2.0;
    } else if (frequency < 0.05) {
      label = "UNCOMMON";   boost = 1.3;
    } else {
      label = "COMMON";     boost = 1.0;
    }

    return {
      rare: frequency < RARE_THRESHOLD,
      diagnosis: dx,
      frequency,
      boost,
      label,
    };
  } catch {
    return { rare: false, diagnosis: dx, frequency: 0.5, boost: 1.0, label: "COMMON" };
  }
}

export async function getRareCaseStats(): Promise<{
  totalDiagnosesSeen: number;
  totalEncounters:    number;
  rareDxCount:        number;
  ultraRareDxCount:   number;
  topRareDiagnoses:   Array<{ dx: string; count: number; frequency: number }>;
}> {
  const r = await getRedisAsync();
  if (!r) return { totalDiagnosesSeen: 0, totalEncounters: 0, rareDxCount: 0, ultraRareDxCount: 0, topRareDiagnoses: [] };

  try {
    const [freqHash, totalRaw] = await Promise.all([
      r.hgetall(REDIS_FREQ_KEY),
      r.get(REDIS_TOTAL_KEY),
    ]);

    const total = Number(totalRaw ?? 0);
    const entries = Object.entries(freqHash ?? {}).map(([dx, cnt]) => ({
      dx,
      count: Number(cnt),
      frequency: total > 0 ? Number(cnt) / total : 0,
    }));

    const rare      = entries.filter(e => e.frequency < RARE_THRESHOLD && e.frequency > 0);
    const ultraRare = entries.filter(e => e.frequency < 0.001 && e.frequency > 0);

    return {
      totalDiagnosesSeen: entries.length,
      totalEncounters:    total,
      rareDxCount:        rare.length,
      ultraRareDxCount:   ultraRare.length,
      topRareDiagnoses:   rare.sort((a, b) => b.count - a.count).slice(0, 10),
    };
  } catch {
    return { totalDiagnosesSeen: 0, totalEncounters: 0, rareDxCount: 0, ultraRareDxCount: 0, topRareDiagnoses: [] };
  }
}

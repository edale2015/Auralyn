/**
 * I004 — DailyMed drug labeling sync job.
 * On-demand (not scheduled) — triggered per drug lookup.
 * Exported as runDailyMedSync(drugName|rxcui) for use by the ingestion route.
 */

import { dailyMed } from "../ingestion/sources/dailyMed";
import { writeIngestionEntry } from "../context/memoryWriters";
import { emitMetric } from "../context/telemetry";
import { db } from "../db";
import { sql } from "drizzle-orm";

/** Returns the cached entry key if already ingested and up-to-date */
async function isCached(rxcui: string): Promise<boolean> {
  try {
    const res = await db.execute(sql`
      SELECT key FROM clinical_memory
      WHERE key = ${"labeling:drug:" + rxcui}
        AND status = 'active'
      LIMIT 1
    `);
    return (res.rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function runDailyMedSync(params: {
  drugName?: string;
  rxcui?:    string;
  force?:    boolean;
}): Promise<{ key: string | null; accepted: boolean; cached: boolean }> {
  const query = params.rxcui ?? params.drugName ?? "";
  if (!query) throw new Error("runDailyMedSync requires drugName or rxcui");

  const cacheKey = `labeling:drug:${params.rxcui ?? query.toLowerCase().replace(/\s+/g, "_")}`;

  // Skip if cached (unless force=true)
  if (!params.force && await isCached(params.rxcui ?? cacheKey.split(":")[2])) {
    console.log(`[DailyMedSync] Cache hit for ${cacheKey} — skipping fetch`);
    return { key: cacheKey, accepted: false, cached: true };
  }

  console.log(`[DailyMedSync] Fetching labeling for ${query}`);
  const raw = await dailyMed.fetch({
    drugName: params.drugName ?? query,
    rxcui:    params.rxcui ?? "",
  });

  const entries = dailyMed.normalize(raw);
  if (entries.length === 0) {
    console.warn(`[DailyMedSync] No entries returned for ${query}`);
    return { key: null, accepted: false, cached: false };
  }

  const entry = entries[0];
  const result = await writeIngestionEntry({
    key:        entry.key,
    title:      entry.source,
    content:    { text: entry.content, metadata: entry.metadata ?? {} },
    confidence: entry.confidence,
    source:     entry.source,
  });

  emitMetric("auralyn.ingestion.sync_complete" as any, {
    source: dailyMed.id, fetched: entries.length,
    accepted: result.accepted ? 1 : 0, rejected: result.accepted ? 0 : 1,
  });

  console.log(`[DailyMedSync] ${entry.key} — accepted=${result.accepted}`);
  return { key: entry.key, accepted: result.accepted, cached: false };
}

// ── Standalone execution ───────────────────────────────────────────────────────
if (require.main === module) {
  const arg = process.argv[2] ?? "aspirin";
  const isRxcui = /^\d+$/.test(arg);
  runDailyMedSync(isRxcui ? { rxcui: arg } : { drugName: arg })
    .then(r => { console.log("Result:", r); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}

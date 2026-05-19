/**
 * I005 — USPSTF preventive recommendations sync job.
 * BullMQ worker — runs weekly on Wednesdays at 05:00 UTC.
 * Fetches all current A/B/C-rated USPSTF recommendations.
 */

import { uspstf } from "../ingestion/sources/uspstf";
import { writeIngestionEntry } from "../context/memoryWriters";
import { emitMetric } from "../context/telemetry";

export async function runUspstfSync(): Promise<{
  fetched: number; accepted: number; rejected: number; skipped: number;
}> {
  console.log("[USPSTFSync] Starting sync");

  const raw     = await uspstf.fetch({});
  const entries = uspstf.normalize(raw);

  let accepted = 0;
  let rejected = 0;
  let skipped  = 0;

  for (const entry of entries) {
    try {
      const result = await writeIngestionEntry({
        key:        entry.key,
        title:      entry.source,
        content:    { text: entry.content, metadata: entry.metadata ?? {} },
        confidence: entry.confidence,
        source:     entry.source,
      });
      if (result.accepted) accepted++;
      else { rejected++; }
    } catch (e: any) {
      console.warn(`[USPSTFSync] Failed to write ${entry.key}:`, e?.message);
      skipped++;
    }
  }

  emitMetric("auralyn.ingestion.sync_complete" as any, {
    source: uspstf.id, fetched: entries.length, accepted, rejected,
  });

  console.log(`[USPSTFSync] Done — ${entries.length} fetched, ${accepted} accepted, ${rejected} rejected, ${skipped} skipped`);
  return { fetched: entries.length, accepted, rejected, skipped };
}

// ── Standalone execution ───────────────────────────────────────────────────────
if (require.main === module) {
  runUspstfSync()
    .then(r => { console.log("Result:", r); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}

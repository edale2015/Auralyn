/**
 * I002 — CDC Respiratory Surveillance sync job.
 * BullMQ worker — runs weekly on Mondays at 06:00 UTC.
 * Fetches FluView ILI + RSV-NET state activity levels.
 */

import { cdcRespiratory } from "../ingestion/sources/cdcRespiratory";
import { writeIngestionEntry } from "../context/memoryWriters";
import { isoWeek } from "../ingestion/normalize";
import { emitMetric } from "../context/telemetry";

export async function runCdcRespiratorySync(week?: string): Promise<{
  fetched: number; accepted: number; rejected: number; week: string;
}> {
  const targetWeek = week ?? isoWeek();
  console.log(`[CDCRespiratorySync] Starting sync for week ${targetWeek}`);

  const raw = await cdcRespiratory.fetch({ week: targetWeek });
  const entries = cdcRespiratory.normalize(raw);

  let accepted = 0;
  let rejected = 0;

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
      else rejected++;
    } catch (e: any) {
      console.warn(`[CDCRespiratorySync] Failed to write ${entry.key}:`, e?.message);
      rejected++;
    }
  }

  emitMetric("auralyn.ingestion.sync_complete" as any, {
    source: cdcRespiratory.id, fetched: entries.length, accepted, rejected,
  });

  console.log(`[CDCRespiratorySync] Done — ${entries.length} fetched, ${accepted} accepted, ${rejected} rejected`);
  return { fetched: entries.length, accepted, rejected, week: targetWeek };
}

// ── Standalone execution ───────────────────────────────────────────────────────
// npx ts-node server/jobs/cdcRespiratorySync.ts [--week=YYYY-Www]
if (require.main === module) {
  const weekArg = process.argv.find(a => a.startsWith("--week="))?.split("=")[1];
  runCdcRespiratorySync(weekArg)
    .then(r => { console.log("Result:", r); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}

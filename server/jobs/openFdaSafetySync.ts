/**
 * I003 — openFDA drug recall + safety alert sync job.
 * BullMQ worker — runs daily at 04:00 UTC.
 * Fetches class I/II recalls and boxed-warning safety communications.
 */

import { openFdaRecalls } from "../ingestion/sources/openFdaRecalls";
import { openFdaSafetyAlerts } from "../ingestion/sources/openFdaSafetyAlerts";
import { writeIngestionEntry } from "../context/memoryWriters";
import { emitMetric } from "../context/telemetry";

export async function runOpenFdaSafetySync(): Promise<{
  recalls:       { fetched: number; accepted: number; rejected: number };
  safetyAlerts:  { fetched: number; accepted: number; rejected: number };
}> {
  console.log("[OpenFDASafetySync] Starting sync");

  async function syncSource(source: typeof openFdaRecalls | typeof openFdaSafetyAlerts) {
    const raw     = await source.fetch({});
    const entries = source.normalize(raw);
    let accepted  = 0;
    let rejected  = 0;

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
        console.warn(`[OpenFDASafetySync] Failed to write ${entry.key}:`, e?.message);
        rejected++;
      }
    }

    return { fetched: entries.length, accepted, rejected };
  }

  const [recallResult, alertResult] = await Promise.allSettled([
    syncSource(openFdaRecalls),
    syncSource(openFdaSafetyAlerts),
  ]);

  const recalls = recallResult.status === "fulfilled"
    ? recallResult.value
    : { fetched: 0, accepted: 0, rejected: 0 };

  const safetyAlerts = alertResult.status === "fulfilled"
    ? alertResult.value
    : { fetched: 0, accepted: 0, rejected: 0 };

  emitMetric("auralyn.ingestion.sync_complete" as any, {
    source: "openfda_combined",
    fetched:  recalls.fetched  + safetyAlerts.fetched,
    accepted: recalls.accepted + safetyAlerts.accepted,
    rejected: recalls.rejected + safetyAlerts.rejected,
  });

  console.log("[OpenFDASafetySync] Done —",
    `recalls: ${recalls.fetched} fetched ${recalls.accepted} accepted;`,
    `alerts: ${safetyAlerts.fetched} fetched ${safetyAlerts.accepted} accepted`);

  return { recalls, safetyAlerts };
}

// ── Standalone execution ───────────────────────────────────────────────────────
if (require.main === module) {
  runOpenFdaSafetySync()
    .then(r => { console.log("Result:", JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}

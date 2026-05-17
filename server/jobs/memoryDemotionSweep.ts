/**
 * memoryDemotionSweep — daily cron job for ClinicalMemoryStore maintenance.
 *
 * Demotes unused active entries to "shadow" and revokes long-shadow entries.
 * Idempotent: running twice in a day yields the same final state.
 *
 * Schedule: 03:00 UTC (outside clinical hours for all US time zones).
 *
 * Registration: imported by server/jobs/index.ts (or equivalent scheduler).
 */

import { runWithAdvisoryLock } from "./advisoryScheduler";
import { ClinicalMemoryStore, DEFAULT_DEMOTION_POLICY } from "../context/ClinicalMemoryStore";
import { PostgresMemoryPersistence } from "../context/PostgresMemoryPersistence";
import { sendSlackAlert } from "../monitoring/alerts";

const JOB_NAME = "clinical-memory-demotion-sweep";

let _store: ClinicalMemoryStore | null = null;

function getStore(): ClinicalMemoryStore {
  if (!_store) {
    _store = new ClinicalMemoryStore(new PostgresMemoryPersistence(), DEFAULT_DEMOTION_POLICY);
  }
  return _store;
}

export async function runMemoryDemotionSweep(): Promise<{
  ran: boolean;
  demoted: number;
  revoked: number;
}> {
  const { ran } = await runWithAdvisoryLock(JOB_NAME, async () => {
    const store = getStore();
    const now   = new Date();

    console.log(`[demotion-sweep] starting at ${now.toISOString()}`);

    try {
      const result = await store.runDemotionSweep(now);
      console.log(`[demotion-sweep] demoted: ${result.demoted}, revoked: ${result.revoked}`);

      if (result.revoked > 0) {
        await sendSlackAlert(
          `[ClinicalMemory] Demotion sweep: ${result.demoted} demoted, ${result.revoked} revoked`,
        ).catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[demotion-sweep] ERROR: ${msg}`);
      await sendSlackAlert(`[ClinicalMemory] Demotion sweep FAILED: ${msg}`).catch(() => {});
      throw err;
    }
  });

  if (!ran) {
    console.log(`[demotion-sweep] skipped — lock held by another instance`);
    return { ran: false, demoted: 0, revoked: 0 };
  }

  return { ran: true, demoted: 0, revoked: 0 };
}

export function scheduleDemotionSweep(
  addJob: (name: string, cronExpr: string, fn: () => Promise<void>) => void,
): void {
  addJob(JOB_NAME, "0 3 * * *", async () => {
    await runMemoryDemotionSweep();
  });
  console.log(`[demotion-sweep] scheduled at 03:00 UTC daily`);
}

if (require.main === module) {
  runMemoryDemotionSweep()
    .then((r) => {
      console.log(`[demotion-sweep] complete:`, r);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

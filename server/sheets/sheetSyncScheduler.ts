import { runFileSync, getLatestUploadedWorkbook } from "./sheetSyncEngine";

let schedulerInterval: NodeJS.Timeout | null = null;
let schedulerRunning = false;
let lastSyncAt: string | null = null;

export function startSheetSyncScheduler(intervalMs = 24 * 60 * 60 * 1000) {
  if (schedulerRunning) return;

  schedulerRunning = true;
  console.log(`[SheetSync] Scheduler started (interval: ${intervalMs / 1000}s)`);

  schedulerInterval = setInterval(async () => {
    const file = getLatestUploadedWorkbook();
    if (!file) {
      console.log("[SheetSync] No workbook found, skipping sync");
      return;
    }

    console.log(`[SheetSync] Running scheduled sync: ${file}`);
    try {
      const result = runFileSync(file, "scheduled");
      lastSyncAt = new Date().toISOString();
      console.log(`[SheetSync] Sync complete: ${result.ingestionResult.status}`);
    } catch (err: any) {
      console.error(`[SheetSync] Sync failed: ${err?.message}`);
    }
  }, intervalMs);
}

export function stopSheetSyncScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerRunning = false;
  console.log("[SheetSync] Scheduler stopped");
}

export function getSyncSchedulerStatus() {
  return {
    running: schedulerRunning,
    lastSyncAt,
  };
}

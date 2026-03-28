const SHEETS_SYNC_ENABLED = process.env.SHEETS_SYNC_ENABLED === "true";

export interface SheetsSyncResult {
  skipped: boolean;
  reason?: string;
  message?: string;
  event?: Record<string, unknown>;
}

/**
 * Sheets Sync Adapter — compatibility bridge for Google Sheets reference data.
 * Production writes go to Postgres first. This adapter provides read-only
 * config mirroring for clinics that still rely on Sheets as a source of truth
 * during the transition period.
 */
export async function syncReferenceConfigToSheets(event: {
  type: string;
  payload: Record<string, unknown>;
}): Promise<SheetsSyncResult> {
  if (!SHEETS_SYNC_ENABLED) {
    return {
      skipped: true,
      reason: "Sheets sync disabled (SHEETS_SYNC_ENABLED=false)",
    };
  }

  // When enabled, this would call Google Sheets API to mirror config data.
  // Implement once GOOGLE_SHEETS_CREDENTIALS are provisioned.
  console.log("[SheetsSyncAdapter] Would sync event:", event.type, event.payload);

  return {
    skipped: false,
    message: "Google Sheets compatibility sync stub — implement Sheets API write here",
    event,
  };
}

export function isSyncEnabled(): boolean {
  return SHEETS_SYNC_ENABLED;
}

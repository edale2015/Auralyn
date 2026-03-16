import { runSheetGraphPipeline } from "../ingestion/sheetToGraphPipeline";
import { recordClinicalChange } from "../audit/clinicalChangeAuditLog";
import { IngestionResult } from "../ingestion/ingestionReport";
import fs from "fs";
import path from "path";

export interface SyncConfig {
  spreadsheetId?: string;
  filePath?: string;
  source?: string;
}

export interface SyncResult {
  syncId: string;
  source: string;
  startedAt: string;
  completedAt: string;
  ingestionResult: IngestionResult;
}

const syncHistory: SyncResult[] = [];

export function runFileSync(filePath: string, source = "manual"): SyncResult {
  const syncId = `sync_${Date.now()}`;
  const startedAt = new Date().toISOString();

  const ingestionResult = runSheetGraphPipeline(filePath);

  const result: SyncResult = {
    syncId,
    source,
    startedAt,
    completedAt: new Date().toISOString(),
    ingestionResult,
  };

  syncHistory.push(result);
  if (syncHistory.length > 100) syncHistory.shift();

  recordClinicalChange({
    timestamp: Date.now(),
    sheet: "SYNC_EVENT",
    changeType: "sync",
    source: source as any,
    row: {
      syncId,
      file: path.basename(filePath),
      status: ingestionResult.status,
    },
  });

  return result;
}

export function getLatestUploadedWorkbook(): string | null {
  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) return null;

  const files = fs.readdirSync(uploadDir)
    .filter((f) => /\.(xlsx|xls)$/i.test(f))
    .sort((a, b) => {
      const sa = fs.statSync(path.join(uploadDir, a)).mtimeMs;
      const sb = fs.statSync(path.join(uploadDir, b)).mtimeMs;
      return sb - sa;
    });

  return files.length > 0 ? path.join(uploadDir, files[0]) : null;
}

export function getSyncHistory(): SyncResult[] {
  return [...syncHistory].reverse();
}

export interface ChangeRecord {
  timestamp: number;
  sheet: string;
  changeType: "upsert" | "delete" | "sync" | "import";
  key?: string;
  row?: any;
  user?: string;
  source?: "upload" | "sync" | "manual";
}

const MAX_LOG_SIZE = 10000;
const auditLog: ChangeRecord[] = [];

export function recordClinicalChange(change: ChangeRecord) {
  auditLog.push({
    ...change,
    timestamp: change.timestamp || Date.now(),
  });

  if (auditLog.length > MAX_LOG_SIZE) {
    auditLog.splice(0, auditLog.length - MAX_LOG_SIZE);
  }
}

export function getAuditHistory(limit?: number): ChangeRecord[] {
  const slice = limit ? auditLog.slice(-limit) : auditLog;
  return [...slice].reverse();
}

export function getAuditStats() {
  const bySheet: Record<string, number> = {};
  const byType: Record<string, number> = {};

  auditLog.forEach((c) => {
    bySheet[c.sheet] = (bySheet[c.sheet] ?? 0) + 1;
    byType[c.changeType] = (byType[c.changeType] ?? 0) + 1;
  });

  return {
    totalRecords: auditLog.length,
    bySheet,
    byType,
    oldestRecord: auditLog.length > 0 ? auditLog[0].timestamp : null,
    newestRecord: auditLog.length > 0 ? auditLog[auditLog.length - 1].timestamp : null,
  };
}

export function clearAuditLog() {
  auditLog.length = 0;
}

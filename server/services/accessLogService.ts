export interface AccessLogEntry {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const accessLog: AccessLogEntry[] = [];

export function logAccess(input: Omit<AccessLogEntry, "id" | "timestamp">): AccessLogEntry {
  const entry: AccessLogEntry = {
    ...input,
    id: `al_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  accessLog.push(entry);
  if (accessLog.length > 10000) accessLog.splice(0, accessLog.length - 10000);
  return entry;
}

export function queryAccessLog(filters?: { userId?: string; action?: string; resource?: string; limit?: number }): AccessLogEntry[] {
  let results = accessLog;
  if (filters?.userId) results = results.filter((e) => e.userId === filters.userId);
  if (filters?.action) results = results.filter((e) => e.action === filters.action);
  if (filters?.resource) results = results.filter((e) => e.resource === filters.resource);
  return results.slice(-(filters?.limit || 100)).reverse();
}

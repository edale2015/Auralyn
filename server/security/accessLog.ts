export interface AccessLogEntry {
  userId: string;
  resource: string;
  action: string;
  ip?: string;
  timestamp: string;
}

const accessLog: AccessLogEntry[] = [];
const MAX_LOG_SIZE = 10000;

export function logAccess(userId: string, resource: string, action: string, ip?: string): void {
  if (accessLog.length >= MAX_LOG_SIZE) {
    accessLog.splice(0, accessLog.length - MAX_LOG_SIZE + 1000);
  }

  accessLog.push({
    userId,
    resource,
    action,
    ip,
    timestamp: new Date().toISOString(),
  });
}

export function getAccessLog(limit = 100, userId?: string): AccessLogEntry[] {
  let filtered = userId ? accessLog.filter((e) => e.userId === userId) : accessLog;
  return filtered.slice(-limit);
}

export function getAccessLogCount(): number {
  return accessLog.length;
}

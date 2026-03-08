import { queryAccessLog } from "./accessLogService";

export interface AuditReport {
  generatedAt: string;
  period: { from: string; to: string };
  totalEvents: number;
  byAction: Record<string, number>;
  byUser: Record<string, number>;
  byResource: Record<string, number>;
  recentEntries: { userId: string; action: string; resource: string; timestamp: string }[];
}

export function generateAuditReport(): AuditReport {
  const entries = queryAccessLog({ limit: 1000 });
  const byAction: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  const byResource: Record<string, number> = {};

  for (const e of entries) {
    byAction[e.action] = (byAction[e.action] || 0) + 1;
    byUser[e.userId] = (byUser[e.userId] || 0) + 1;
    byResource[e.resource] = (byResource[e.resource] || 0) + 1;
  }

  const now = new Date().toISOString();
  return {
    generatedAt: now,
    period: { from: entries.length > 0 ? entries[entries.length - 1].timestamp : now, to: now },
    totalEvents: entries.length,
    byAction,
    byUser,
    byResource,
    recentEntries: entries.slice(0, 20).map((e) => ({ userId: e.userId, action: e.action, resource: e.resource, timestamp: e.timestamp })),
  };
}

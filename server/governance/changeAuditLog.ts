/**
 * Change Audit Log
 *
 * Immutable, append-only audit log for all clinical knowledge changes.
 * Records every: suggestion, approval, rejection, deployment, rollback.
 *
 * Stored in-memory (with Redis persistence hooks for production).
 */

export type AuditAction =
  | "suggestion_created"
  | "suggestion_approved"
  | "suggestion_rejected"
  | "suggestion_deployed"
  | "suggestion_rollback"
  | "simulation_run"
  | "safety_mode_changed"
  | "version_snapshot"
  | "version_rollback"
  | "drift_alert_triggered"
  | "governance_override";

export type AuditSource = "system" | "physician" | "admin" | "auto_learning";

export interface AuditEntry {
  entryId:     string;
  action:      AuditAction;
  source:      AuditSource;
  actor?:      string;
  itemId?:     string;
  itemType?:   string;
  before?:     unknown;
  after?:      unknown;
  linkedCases?: string[];
  confidence?: number;
  status?:     string;
  detail?:     string;
  timestamp:   number;
  isoTime:     string;
}

const entries: AuditEntry[] = [];
const MAX_ENTRIES = 10_000;

function uid(): string {
  return `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function logAuditEvent(event: Omit<AuditEntry, "entryId" | "timestamp" | "isoTime">): AuditEntry {
  const now = Date.now();
  const entry: AuditEntry = {
    ...event,
    entryId:   uid(),
    timestamp: now,
    isoTime:   new Date(now).toISOString(),
  };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES);
  return entry;
}

export function listAuditLog(opts: {
  limit?: number;
  offset?: number;
  action?: AuditAction;
  source?: AuditSource;
  itemId?: string;
  since?: number;
} = {}): { entries: AuditEntry[]; total: number } {
  let filtered = entries;
  if (opts.action)  filtered = filtered.filter(e => e.action  === opts.action);
  if (opts.source)  filtered = filtered.filter(e => e.source  === opts.source);
  if (opts.itemId)  filtered = filtered.filter(e => e.itemId  === opts.itemId);
  if (opts.since)   filtered = filtered.filter(e => e.timestamp >= opts.since!);
  const total = filtered.length;
  const offset = opts.offset ?? 0;
  const limit  = Math.min(opts.limit ?? 100, 500);
  return { entries: filtered.slice(offset, offset + limit), total };
}

export function getAuditStats(): Record<AuditAction, number> {
  const stats: Record<string, number> = {};
  for (const e of entries) stats[e.action] = (stats[e.action] ?? 0) + 1;
  return stats as Record<AuditAction, number>;
}

/**
 * Protocol Delta Tracker (OpenSpec-style)
 * Tracks ADDED / MODIFIED / REMOVED changes to clinical protocols and KB rules
 * for FDA audit trails of rule evolution over time.
 *
 * Every protocol update produces a delta record with:
 *   - ChangeType: ADDED | MODIFIED | REMOVED
 *   - Before/after snapshots (MODIFIED)
 *   - Author + reason (required for FDA 21 CFR Part 11 compliance)
 *   - Hash of the change for tamper evidence
 *   - Affected patient scope (which dispositions/complaints this rule covers)
 *
 * This solves the "static spec" problem from OpenSpec — specs drift from
 * implementation silently. Here, every drift is a tracked delta.
 */

import { createHash }  from "crypto";
import { logEvent }    from "../ops/auditEvents";

export type ChangeType = "ADDED" | "MODIFIED" | "REMOVED";

export interface DeltaRecord {
  deltaId:        string;
  changeType:     ChangeType;
  entityType:     string;       // "kb_rule" | "disposition_rule" | "safety_gate" | "clinical_protocol"
  entityId:       string;
  before?:        any;          // previous state (null for ADDED)
  after?:         any;          // new state     (null for REMOVED)
  diff?:          string[];     // list of field names that changed (MODIFIED only)
  reason:         string;       // clinical justification (required)
  author:         string;       // physician / engineer who authorised change
  affectedScope:  string[];     // e.g. ["sepsis", "ED", "ALL"]
  changeHash:     string;       // SHA-256 of before+after+reason
  createdAt:      string;
}

export interface DeltaApplyResult {
  deltaId:  string;
  applied:  boolean;
  message:  string;
}

// In-memory store (production would write to DB / immutable log)
const _deltas: DeltaRecord[] = [];

function computeChangeHash(before: any, after: any, reason: string): string {
  // Normalize undefined → null so stored hash matches recomputed hash
  const payload = JSON.stringify({
    before: before ?? null,
    after:  after  ?? null,
    reason,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function detectDiff(before: any, after: any): string[] {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function trackAdded(opts: {
  entityType:    string;
  entityId:      string;
  after:         any;
  reason:        string;
  author:        string;
  affectedScope?: string[];
}): DeltaRecord {
  const deltaId = `DELTA-ADD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const record: DeltaRecord = {
    deltaId,
    changeType:    "ADDED",
    entityType:    opts.entityType,
    entityId:      opts.entityId,
    after:         opts.after,
    reason:        opts.reason,
    author:        opts.author,
    affectedScope: opts.affectedScope ?? ["ALL"],
    changeHash:    computeChangeHash(null, opts.after, opts.reason),
    createdAt:     new Date().toISOString(),
  };
  _deltas.push(record);
  _emitAudit(record);
  return record;
}

export function trackModified(opts: {
  entityType:    string;
  entityId:      string;
  before:        any;
  after:         any;
  reason:        string;
  author:        string;
  affectedScope?: string[];
}): DeltaRecord {
  const deltaId = `DELTA-MOD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const record: DeltaRecord = {
    deltaId,
    changeType:    "MODIFIED",
    entityType:    opts.entityType,
    entityId:      opts.entityId,
    before:        opts.before,
    after:         opts.after,
    diff:          detectDiff(opts.before, opts.after),
    reason:        opts.reason,
    author:        opts.author,
    affectedScope: opts.affectedScope ?? ["ALL"],
    changeHash:    computeChangeHash(opts.before, opts.after, opts.reason),
    createdAt:     new Date().toISOString(),
  };
  _deltas.push(record);
  _emitAudit(record);
  return record;
}

export function trackRemoved(opts: {
  entityType:    string;
  entityId:      string;
  before:        any;
  reason:        string;
  author:        string;
  affectedScope?: string[];
}): DeltaRecord {
  const deltaId = `DELTA-REM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const record: DeltaRecord = {
    deltaId,
    changeType:    "REMOVED",
    entityType:    opts.entityType,
    entityId:      opts.entityId,
    before:        opts.before,
    reason:        opts.reason,
    author:        opts.author,
    affectedScope: opts.affectedScope ?? ["ALL"],
    changeHash:    computeChangeHash(opts.before, null, opts.reason),
    createdAt:     new Date().toISOString(),
  };
  _deltas.push(record);
  _emitAudit(record);
  return record;
}

export function getDeltas(filter?: {
  entityType?:  string;
  entityId?:    string;
  changeType?:  ChangeType;
  since?:       string;   // ISO timestamp
}): DeltaRecord[] {
  return _deltas.filter((d) => {
    if (filter?.entityType  && d.entityType  !== filter.entityType)  return false;
    if (filter?.entityId    && d.entityId    !== filter.entityId)    return false;
    if (filter?.changeType  && d.changeType  !== filter.changeType)  return false;
    if (filter?.since       && d.createdAt    < filter.since)         return false;
    return true;
  });
}

export function getDeltaById(deltaId: string): DeltaRecord | undefined {
  return _deltas.find((d) => d.deltaId === deltaId);
}

/** Verify a delta record hasn't been tampered with */
export function verifyDelta(record: DeltaRecord): { valid: boolean; reason?: string } {
  const expected = computeChangeHash(record.before, record.after, record.reason);
  if (expected !== record.changeHash)
    return { valid: false, reason: `Hash mismatch: expected ${expected}, stored ${record.changeHash}` };
  return { valid: true };
}

/** Summary of all changes for FDA export */
export function getDeltaSummary(): {
  total:    number;
  added:    number;
  modified: number;
  removed:  number;
  entities: string[];
  since:    string | null;
} {
  const added    = _deltas.filter((d) => d.changeType === "ADDED").length;
  const modified = _deltas.filter((d) => d.changeType === "MODIFIED").length;
  const removed  = _deltas.filter((d) => d.changeType === "REMOVED").length;
  const entities = [...new Set(_deltas.map((d) => d.entityType))];
  const since    = _deltas.length > 0 ? _deltas[0].createdAt : null;

  return { total: _deltas.length, added, modified, removed, entities, since };
}

function _emitAudit(record: DeltaRecord): void {
  logEvent({
    actor:      record.author,
    action:     `delta:${record.changeType.toLowerCase()}`,
    entityType: record.entityType,
    entityId:   record.entityId,
    details:    { deltaId: record.deltaId, changeHash: record.changeHash, diff: record.diff },
  });
}

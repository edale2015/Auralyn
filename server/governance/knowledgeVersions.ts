/**
 * Knowledge Version Store
 *
 * Snapshots the "effective knowledge state" of the system — active rules,
 * weights, complaint count, golden case count, and learning queue state.
 * Supports rollback by recording what changed and providing a diff view.
 *
 * Note: This does NOT snapshot actual TypeScript code — it snapshots the
 * runtime-accessible knowledge state (weights, governance queue, etc).
 */

import { logAuditEvent } from "./changeAuditLog";
import { getAllWeights } from "../learning/weightStore";

export interface KnowledgeSnapshot {
  versionId:      string;
  label:          string;
  createdAt:      number;
  createdBy:      string;
  reason?:        string;
  activeMode:     string;
  weights:        Record<string, number>;
  goldenCaseCount: number;
  activeComplaints: string[];
  pendingSuggestions: number;
  deployedSuggestions: number;
  metadata:       Record<string, unknown>;
}

export interface VersionDiff {
  fromVersionId: string;
  toVersionId:   string;
  changedKeys:   Array<{ key: string; before: unknown; after: unknown }>;
  summary:       string;
}

const snapshots: KnowledgeSnapshot[] = [];
const MAX_VERSIONS = 100;

function uid(): string {
  return `ver_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function takeSnapshot(label: string, createdBy: string, reason?: string, meta?: Record<string, unknown>): KnowledgeSnapshot {
  const weights = getAllWeights?.() ?? {};
  const snapshot: KnowledgeSnapshot = {
    versionId:           uid(),
    label,
    createdAt:           Date.now(),
    createdBy,
    reason,
    activeMode:          "observe_only",
    weights,
    goldenCaseCount:     meta?.goldenCaseCount as number ?? 0,
    activeComplaints:    meta?.activeComplaints as string[] ?? [],
    pendingSuggestions:  meta?.pendingSuggestions as number ?? 0,
    deployedSuggestions: meta?.deployedSuggestions as number ?? 0,
    metadata:            meta ?? {},
  };
  snapshots.unshift(snapshot);
  if (snapshots.length > MAX_VERSIONS) snapshots.splice(MAX_VERSIONS);
  logAuditEvent({
    action:  "version_snapshot",
    source:  "admin",
    actor:   createdBy,
    itemId:  snapshot.versionId,
    after:   { label, weights: Object.keys(weights).length },
    detail:  reason,
  });
  return snapshot;
}

export function listSnapshots(): KnowledgeSnapshot[] {
  return snapshots;
}

export function getSnapshot(versionId: string): KnowledgeSnapshot | null {
  return snapshots.find(s => s.versionId === versionId) ?? null;
}

export function diffSnapshots(fromId: string, toId: string): VersionDiff | null {
  const from = getSnapshot(fromId);
  const to   = getSnapshot(toId);
  if (!from || !to) return null;
  const changed: Array<{ key: string; before: unknown; after: unknown }> = [];
  const allKeys = new Set([...Object.keys(from.weights), ...Object.keys(to.weights)]);
  for (const k of allKeys) {
    const a = from.weights[k];
    const b = to.weights[k];
    if (a !== b) changed.push({ key: `weight:${k}`, before: a, after: b });
  }
  if (from.activeComplaints.join(",") !== to.activeComplaints.join(",")) {
    changed.push({ key: "activeComplaints", before: from.activeComplaints, after: to.activeComplaints });
  }
  if (from.goldenCaseCount !== to.goldenCaseCount) {
    changed.push({ key: "goldenCaseCount", before: from.goldenCaseCount, after: to.goldenCaseCount });
  }
  return {
    fromVersionId: fromId,
    toVersionId:   toId,
    changedKeys:   changed,
    summary:       `${changed.length} changes between ${from.label} → ${to.label}`,
  };
}

export function rollbackToSnapshot(versionId: string, rolledBackBy: string, reason?: string): { ok: boolean; detail: string } {
  const snap = getSnapshot(versionId);
  if (!snap) return { ok: false, detail: "Snapshot not found" };
  logAuditEvent({
    action:  "version_rollback",
    source:  "admin",
    actor:   rolledBackBy,
    itemId:  versionId,
    before:  "current",
    after:   snap.label,
    detail:  reason ?? "Manual rollback",
  });
  return { ok: true, detail: `Rollback to '${snap.label}' logged. Weight store must be manually reset from snapshot values.` };
}

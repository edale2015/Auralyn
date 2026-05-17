/**
 * Memory Write Paths — T019
 *
 * Concrete write functions for each cross-encounter learning trigger.
 * All writes go through ClinicalMemoryStore conflict resolution,
 * so physician > tenant > global precedence is enforced automatically.
 *
 * Triggers:
 *   1. Supervisor overrides a disposition → rlhf:disposition:<complaint>:<from>→<to>
 *   2. Supervisor adds a hard constraint  → constraint:<complaint>:<slug>
 *   3. Admin adds tenant protocol         → protocol:<protocol_id>
 *   4. Global KB updates a guideline      → guideline:<guideline_id>
 *
 * Read path (used by ClinicalContextManager.assemblePromptFor):
 *   fetchLearnedContext(tenantId, physicianId) → array of { scope, key, content }
 *   sorted physician > tenant > global, active only.
 *
 * File: server/context/memoryWriters.ts
 */

import { randomUUID } from "crypto";
import { ClinicalMemoryStore, type MemoryEntry } from "./ClinicalMemoryStore";
import { PostgresMemoryPersistence } from "./PostgresMemoryPersistence";
import { emitMemoryHit } from "./telemetry";

// Singleton store — lazy-initialised so tests can swap it out via module mock
let _store: ClinicalMemoryStore | null = null;
export function getMemoryStore(): ClinicalMemoryStore {
  if (!_store) {
    _store = new ClinicalMemoryStore(new PostgresMemoryPersistence());
  }
  return _store;
}

// ─── Write helpers ────────────────────────────────────────────────────────────

export interface DispositionOverrideParams {
  tenantId:        string;
  physicianId:     string;
  complaintId:     string;
  fromDisposition: string;
  toDisposition:   string;
  reason:          string;
  encounterId:     string;
}

export async function writeSupervisorDispositionOverride(
  p: DispositionOverrideParams,
): Promise<{ accepted: boolean; key: string }> {
  const key   = `rlhf:disposition:${p.complaintId}:${p.fromDisposition}→${p.toDisposition}`;
  const store = getMemoryStore();
  const entry: MemoryEntry = {
    id:           `mem_${randomUUID()}`,
    scope:        "physician",
    tenantId:     p.tenantId,
    physicianId:  p.physicianId,
    key,
    content:      JSON.stringify({
      fromDisposition: p.fromDisposition,
      toDisposition:   p.toDisposition,
      reason:          p.reason,
      encounterId:     p.encounterId,
    }),
    confidence:   0.85,
    status:       "active",
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    verifiedBy:   "supervisor",
    verifiedAt:   new Date().toISOString(),
    source:       `encounter:${p.encounterId}`,
    retrievedCount: 0,
  };
  const result = await store.write(entry);
  if (result.accepted) {
    emitMemoryHit("physician", 1, p.encounterId);
  }
  return { accepted: result.accepted, key };
}

export interface HardConstraintParams {
  tenantId:       string;
  physicianId:    string;
  complaintId:    string;
  constraintSlug: string;
  constraint:     string;
  encounterId:    string;
}

export async function writeSupervisorHardConstraint(
  p: HardConstraintParams,
): Promise<{ accepted: boolean; key: string }> {
  const key   = `constraint:${p.complaintId}:${p.constraintSlug}`;
  const store = getMemoryStore();
  const entry: MemoryEntry = {
    id:           `mem_${randomUUID()}`,
    scope:        "physician",
    tenantId:     p.tenantId,
    physicianId:  p.physicianId,
    key,
    content:      JSON.stringify({
      constraint:     p.constraint,
      slug:           p.constraintSlug,
      encounterId:    p.encounterId,
    }),
    confidence:   0.90,
    status:       "active",
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    verifiedBy:   "supervisor",
    verifiedAt:   new Date().toISOString(),
    source:       `encounter:${p.encounterId}`,
    retrievedCount: 0,
  };
  const result = await store.write(entry);
  if (result.accepted) {
    emitMemoryHit("physician", 1, p.encounterId);
  }
  return { accepted: result.accepted, key };
}

export interface TenantProtocolParams {
  tenantId:   string;
  protocolId: string;
  title:      string;
  content:    Record<string, unknown>;
}

export async function writeTenantProtocol(
  p: TenantProtocolParams,
): Promise<{ accepted: boolean; key: string }> {
  const key   = `protocol:${p.protocolId}`;
  const store = getMemoryStore();
  const entry: MemoryEntry = {
    id:           `mem_${randomUUID()}`,
    scope:        "tenant",
    tenantId:     p.tenantId,
    key,
    content:      JSON.stringify({ title: p.title, ...p.content }),
    confidence:   0.95,
    status:       "active",
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    verifiedBy:   "external_guideline",
    verifiedAt:   new Date().toISOString(),
    source:       "admin_protocol_upload",
    retrievedCount: 0,
  };
  const result = await store.write(entry);
  return { accepted: result.accepted, key };
}

export interface GlobalGuidelineParams {
  guidelineId: string;
  title:       string;
  content:     Record<string, unknown>;
}

export async function writeGlobalGuideline(
  p: GlobalGuidelineParams,
): Promise<{ accepted: boolean; key: string }> {
  const key   = `guideline:${p.guidelineId}`;
  const store = getMemoryStore();
  const entry: MemoryEntry = {
    id:           `mem_${randomUUID()}`,
    scope:        "global",
    key,
    content:      JSON.stringify({ title: p.title, ...p.content }),
    confidence:   1.0,
    status:       "active",
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    verifiedBy:   "external_guideline",
    verifiedAt:   new Date().toISOString(),
    source:       "kb_global_update",
    retrievedCount: 0,
  };
  const result = await store.write(entry);
  return { accepted: result.accepted, key };
}

// ─── Read path (used by ClinicalContextManager) ───────────────────────────────

export interface LearnedContextEntry {
  scope:   string;
  key:     string;
  content: string;
}

/**
 * Fetch active memory entries for a physician within a tenant.
 * Returns physician > tenant > global, deduped by key.
 */
export async function fetchLearnedContext(params: {
  tenantId:    string;
  physicianId: string;
  maxRows?:    number;
}): Promise<LearnedContextEntry[]> {
  try {
    const store   = getMemoryStore();
    const entries = await store.retrieve({
      scope: { tenantId: params.tenantId, physicianId: params.physicianId },
    });
    return entries
      .slice(0, params.maxRows ?? 20)
      .map(e => ({ scope: e.scope, key: e.key, content: e.content }));
  } catch {
    return [];
  }
}

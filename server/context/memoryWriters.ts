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

// ─── I001: Write path for public ingestion (key used as-is, no prefix) ────────

export interface IngestionEntryParams {
  key:        string;         // full key e.g. "surveillance:respiratory:nm:2026-W20"
  title:      string;
  content:    Record<string, unknown>;
  confidence?: number;
  source?:    string;
}

/**
 * Write a public-ingestion entry to global clinical_memory.
 * Uses the key exactly as provided (unlike writeGlobalGuideline which
 * prepends "guideline:"). For surveillance:, safety:, labeling:, preventive: namespaces.
 */
export async function writeIngestionEntry(
  p: IngestionEntryParams,
): Promise<{ accepted: boolean; key: string }> {
  const store = getMemoryStore();
  const entry: MemoryEntry = {
    id:           `mem_${randomUUID()}`,
    scope:        "global",
    key:          p.key,
    content:      JSON.stringify({ title: p.title, ...p.content }),
    confidence:   p.confidence ?? 0.95,
    status:       "active",
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    verifiedBy:   "external_guideline",
    verifiedAt:   new Date().toISOString(),
    source:       p.source ?? "public_ingestion",
    retrievedCount: 0,
  };
  const result = await store.write(entry);
  return { accepted: result.accepted, key: p.key };
}

// ─── Read path (used by ClinicalContextManager) ───────────────────────────────

export interface LearnedContextEntry {
  scope:   string;
  key:     string;
  content: string;
}

/**
 * I006: Fetch active memory entries for a physician within a tenant,
 * PLUS global ingestion signals filtered by patient context.
 *
 * Precedence: physician > tenant > global.
 * Additional global lookups (surveillance, safety, labeling, preventive)
 * are keyed from public ingestion (I002–I005) and filtered by:
 *   - state:       for surveillance:respiratory:* entries
 *   - medications: for safety:drug_* and labeling:drug:* entries
 *   - demographics:{ age, sex } for preventive:uspstf:* entries
 */
export async function fetchLearnedContext(params: {
  tenantId:     string;
  physicianId:  string;
  maxRows?:     number;
  // I006 additions — all optional; omit if not relevant to the encounter
  state?:       string;
  medications?: string[];
  demographics?: { age?: number; sex?: string };
}): Promise<LearnedContextEntry[]> {
  try {
    const store   = getMemoryStore();
    const maxRows = params.maxRows ?? 40;

    // 1. Existing physician/tenant/global entries (RLHF deltas, protocols, guidelines)
    const baseEntries = await store.retrieve({
      scope: { tenantId: params.tenantId, physicianId: params.physicianId },
    });

    // 2. I006 — surveillance (CDC FluView / RSV) filtered by state
    const surveillanceEntries = params.state
      ? await store.retrieve({
          scope:     { tenantId: undefined, physicianId: undefined },
          keyPrefix: `surveillance:respiratory:${params.state.toLowerCase().replace(/\s+/g, "_")}:`,
        }).catch(() => [])
      : [];

    // 3. I006 — drug safety (recalls + boxed warnings) filtered by medications
    const safetyEntries: import("./ClinicalMemoryStore").MemoryEntry[] = [];
    if (params.medications?.length) {
      for (const med of params.medications.slice(0, 10)) {
        const slug = med.toLowerCase().replace(/[^a-z0-9]+/g, "_").split("_")[0];
        const hits = await store.retrieve({
          scope:     { tenantId: undefined, physicianId: undefined },
          keyPrefix: `safety:drug_`,
        }).catch(() => []);
        // Filter to entries that mention this drug name
        safetyEntries.push(
          ...hits.filter(e => e.content.toLowerCase().includes(slug))
        );
      }
    }

    // 4. I006 — drug labeling (DailyMed SPL) filtered by medications
    const labelingEntries: import("./ClinicalMemoryStore").MemoryEntry[] = [];
    if (params.medications?.length) {
      for (const med of params.medications.slice(0, 5)) {
        const slug = med.toLowerCase().replace(/[^a-z0-9]+/g, "_").split("_")[0];
        const hits = await store.retrieve({
          scope:     { tenantId: undefined, physicianId: undefined },
          keyPrefix: `labeling:drug:${slug}`,
        }).catch(() => []);
        labelingEntries.push(...hits);
      }
    }

    // 5. I006 — USPSTF preventive recommendations filtered by demographics
    const preventiveEntries: import("./ClinicalMemoryStore").MemoryEntry[] = [];
    const { age, sex } = params.demographics ?? {};
    if (age !== undefined || sex) {
      const allPreventive = await store.retrieve({
        scope:     { tenantId: undefined, physicianId: undefined },
        keyPrefix: "preventive:uspstf:",
      }).catch(() => []);

      // Simple demographic filter — entry content must not contradict age/sex
      for (const e of allPreventive) {
        try {
          const meta = JSON.parse(e.content)?.metadata as any ?? {};
          const ageRange  = String(meta.ageRange ?? "").toLowerCase();
          const sexFilter = String(meta.sexFilter ?? "").toLowerCase();

          const ageOk  = !ageRange || !age ||
            (() => {
              const m = ageRange.match(/(\d+)\D+(\d+)/);
              return m ? (age >= +m[1] && age <= +m[2]) : true;
            })();
          const sexOk  = !sexFilter || !sex ||
            sexFilter.includes(sex.toLowerCase()) || sexFilter.includes("all") ||
            sexFilter.includes("both");

          if (ageOk && sexOk) preventiveEntries.push(e);
        } catch {
          preventiveEntries.push(e);
        }
      }
    }

    // Merge + dedupe by key, preserve precedence
    const seen = new Set<string>();
    const all: LearnedContextEntry[] = [];

    for (const e of [
      ...baseEntries,
      ...surveillanceEntries,
      ...safetyEntries,
      ...labelingEntries,
      ...preventiveEntries,
    ]) {
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      all.push({ scope: e.scope, key: e.key, content: e.content });
      if (all.length >= maxRows) break;
    }

    return all;
  } catch {
    return [];
  }
}

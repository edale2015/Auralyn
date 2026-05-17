/**
 * ClinicalMemoryStore — durable, cross-encounter memory.
 *
 * What goes in memory:
 *   - Physician-level preferences
 *   - Tenant-level protocols
 *   - Validated learnings from supervisor overrides (delta-capped RLHF)
 *
 * What does NOT go in memory:
 *   - Specific patient information (PHI lives in the encounter record)
 *   - Single-encounter reasoning chains or conversation snippets
 *
 * Scope rules:
 *   - PHYSICIAN scope: only that physician's encounters can read these
 *   - TENANT scope: all physicians in the tenant
 *   - GLOBAL scope: all tenants
 *
 * Conflict resolution:
 *   - Same key + same scope: newer wins ONLY if higher-or-equal confidence AND verified
 *   - Cross-scope: PHYSICIAN > TENANT > GLOBAL
 *
 * Demotion:
 *   - Unused N encounters → "shadow" (not surfaced but preserved)
 *   - Shadow too long → "revoked" (audit trail kept)
 *
 * File: server/context/ClinicalMemoryStore.ts
 *
 * ── DB Migration ──────────────────────────────────────────────────────────
 * CREATE TABLE clinical_memory (
 *   id              TEXT PRIMARY KEY,
 *   scope           TEXT NOT NULL CHECK (scope IN ('global','tenant','physician')),
 *   tenant_id       TEXT,
 *   physician_id    TEXT,
 *   key             TEXT NOT NULL,
 *   content         TEXT NOT NULL,
 *   confidence      REAL NOT NULL,
 *   status          TEXT NOT NULL CHECK (status IN ('active','shadow','revoked')),
 *   created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
 *   updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
 *   verified_by     TEXT,
 *   verified_at     TIMESTAMPTZ,
 *   source          TEXT,
 *   retrieved_count INT NOT NULL DEFAULT 0,
 *   last_retrieved  TIMESTAMPTZ
 * );
 * CREATE INDEX idx_cm_scope_key ON clinical_memory (scope, tenant_id, physician_id, key);
 * CREATE INDEX idx_cm_status ON clinical_memory (status);
 */

import { PhysicianId, TenantId } from "./types";

export type MemoryScope  = "global" | "tenant" | "physician";
export type MemoryStatus = "active" | "shadow" | "revoked";

export interface MemoryEntry {
  id:           string;
  scope:        MemoryScope;
  tenantId?:    TenantId;
  physicianId?: PhysicianId;

  /**
   * Stable key. Same key + same scope = conflict resolution applies.
   * Examples:
   *   "preference:disposition:low_acuity_peds"
   *   "protocol:cough_3wk_cxr"
   *   "rlhf:differential:vague_chest_pain"
   */
  key:           string;
  content:       string;
  confidence:    number;
  status:        MemoryStatus;
  createdAt:     string;
  updatedAt:     string;
  verifiedBy?:   "physician" | "supervisor" | "external_guideline";
  verifiedAt?:   string;
  source?:       string;

  retrievedCount:    number;
  lastRetrievedAt?:  string;
}

export interface MemoryRetrievalQuery {
  scope:          { tenantId?: TenantId; physicianId?: PhysicianId };
  keys?:          string[];
  keyPrefix?:     string;
  includeShadow?: boolean;
}

export interface DemotionPolicy {
  unusedDaysThreshold:  number;
  shadowDaysToRevoke:   number;
}

export const DEFAULT_DEMOTION_POLICY: DemotionPolicy = {
  unusedDaysThreshold: 60,
  shadowDaysToRevoke:  180,
};

/**
 * Persistence interface — implement with your Postgres client.
 * Keeping the store agnostic of the DB driver makes it testable in isolation.
 */
export interface MemoryPersistence {
  upsert(entry: MemoryEntry): Promise<void>;
  fetch(query: MemoryRetrievalQuery): Promise<MemoryEntry[]>;
  bulkUpdateStatus(ids: string[], status: MemoryStatus): Promise<void>;
  findStaleForDemotion(policy: DemotionPolicy, now: Date): Promise<MemoryEntry[]>;
  findStaleForRevocation(policy: DemotionPolicy, now: Date): Promise<MemoryEntry[]>;
}

export class ClinicalMemoryStore {
  constructor(
    private readonly persistence:     MemoryPersistence,
    private readonly demotionPolicy:  DemotionPolicy = DEFAULT_DEMOTION_POLICY,
  ) {}

  /**
   * Write a memory entry. Applies conflict resolution against any existing
   * entry with the same scope + key.
   */
  async write(entry: MemoryEntry): Promise<{ accepted: boolean; reason?: string }> {
    if (entry.scope === "tenant" && !entry.tenantId) {
      return { accepted: false, reason: "tenant scope requires tenantId" };
    }
    if (entry.scope === "physician" && (!entry.tenantId || !entry.physicianId)) {
      return { accepted: false, reason: "physician scope requires both tenantId and physicianId" };
    }

    const existing = await this.persistence.fetch({
      scope: { tenantId: entry.tenantId, physicianId: entry.physicianId },
      keys: [entry.key],
      includeShadow: true,
    });

    const sameScope = existing.filter(
      e =>
        e.scope       === entry.scope &&
        e.tenantId    === entry.tenantId &&
        e.physicianId === entry.physicianId,
    );

    if (sameScope.length > 0) {
      const incumbent = sameScope.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (entry.confidence < incumbent.confidence) {
        return {
          accepted: false,
          reason: `lower confidence (${entry.confidence}) than incumbent (${incumbent.confidence})`,
        };
      }
      if (!entry.verifiedBy && incumbent.verifiedBy) {
        return { accepted: false, reason: "incumbent is verified; new entry is not" };
      }
      await this.persistence.bulkUpdateStatus([incumbent.id], "revoked");
    }

    await this.persistence.upsert({
      ...entry,
      status:         entry.status         ?? "active",
      retrievedCount: entry.retrievedCount ?? 0,
    });
    return { accepted: true };
  }

  /**
   * Retrieve memory for a given scope. Applies scope-precedence:
   * PHYSICIAN > TENANT > GLOBAL when keys collide.
   */
  async retrieve(query: MemoryRetrievalQuery): Promise<MemoryEntry[]> {
    const all     = await this.persistence.fetch(query);
    const visible = all.filter(e => this.isVisible(e, query));

    const byKey = new Map<string, MemoryEntry>();
    const scopeRank: Record<MemoryScope, number> = { physician: 0, tenant: 1, global: 2 };
    for (const e of visible) {
      const incumbent = byKey.get(e.key);
      if (!incumbent || scopeRank[e.scope] < scopeRank[incumbent.scope]) {
        byKey.set(e.key, e);
      }
    }

    return [...byKey.values()];
  }

  /**
   * Periodic maintenance — call from a daily cron.
   * Demotes unused → shadow, then long-shadow → revoked.
   */
  async runDemotionSweep(now: Date = new Date()): Promise<{ demoted: number; revoked: number }> {
    const stale = await this.persistence.findStaleForDemotion(this.demotionPolicy, now);
    if (stale.length) {
      await this.persistence.bulkUpdateStatus(stale.map(e => e.id), "shadow");
    }
    const shadowStale = await this.persistence.findStaleForRevocation(this.demotionPolicy, now);
    if (shadowStale.length) {
      await this.persistence.bulkUpdateStatus(shadowStale.map(e => e.id), "revoked");
    }
    return { demoted: stale.length, revoked: shadowStale.length };
  }

  private isVisible(entry: MemoryEntry, query: MemoryRetrievalQuery): boolean {
    if (entry.status === "revoked") return false;
    if (entry.status === "shadow" && !query.includeShadow) return false;
    if (entry.scope === "global") return true;
    if (entry.scope === "tenant") return entry.tenantId === query.scope.tenantId;
    if (entry.scope === "physician") {
      return (
        entry.tenantId    === query.scope.tenantId &&
        entry.physicianId === query.scope.physicianId
      );
    }
    return false;
  }
}

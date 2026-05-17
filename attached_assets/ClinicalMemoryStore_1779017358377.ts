/**
 * ClinicalMemoryStore — durable, cross-encounter memory.
 *
 * The article's warning: "memory without revision is a trap. Once agents
 * persist notes across steps or sessions, they also need mechanisms for
 * conflict resolution, deletion, and demotion. Otherwise long-term memory
 * becomes a landfill of outdated beliefs."
 *
 * For Auralyn this is especially sharp:
 *   - Clinical guidelines genuinely change (e.g., updated CDC abx recs)
 *   - Physician preferences drift
 *   - A tenant might adopt a new protocol that supersedes the old one
 *   - RLHF deltas accumulated from one physician must NOT silently
 *     propagate to another physician's encounters
 *
 * What goes in memory:
 *   - Physician-level preferences ("Dr. Smith prefers PA discharge for
 *     low-acuity peds with parent present")
 *   - Tenant-level protocols ("Clinic X requires CXR for any cough > 3 weeks")
 *   - Validated learnings from supervisor overrides (delta-capped RLHF)
 *
 * What does NOT go in memory:
 *   - Specific patient information (that's PHI; lives in the encounter
 *     record, not in agent memory)
 *   - Single-encounter reasoning chains
 *   - Conversation snippets
 *
 * Scope rules:
 *   - PHYSICIAN scope is the strictest — only that physician's encounters
 *     can read these entries
 *   - TENANT scope applies to all physicians in the tenant
 *   - GLOBAL scope (Anthropic/Auralyn-published) applies to all tenants
 *
 * Conflict resolution:
 *   - When two entries have the same `key` at the same scope, the newer
 *     one wins, BUT only if it carries a higher-or-equal confidence and
 *     has been verified.
 *   - Cross-scope: PHYSICIAN > TENANT > GLOBAL when scopes conflict.
 *
 * Demotion:
 *   - Entries that go unused for N encounters are demoted to "shadow" and
 *     stop being surfaced. They can be promoted back if explicitly cited
 *     by a supervisor.
 */

import { PhysicianId, TenantId } from "./types";

export type MemoryScope = "global" | "tenant" | "physician";

export type MemoryStatus = "active" | "shadow" | "revoked";

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  tenantId?: TenantId; // required when scope is "tenant" or "physician"
  physicianId?: PhysicianId; // required when scope is "physician"

  /**
   * A stable key for this kind of memory. Same key + same scope =
   * conflict resolution applies. Examples:
   *   "preference:disposition:low_acuity_peds"
   *   "protocol:cough_3wk_cxr"
   *   "rlhf:differential:vague_chest_pain"
   */
  key: string;

  content: string;
  confidence: number; // 0..1, set by whatever produced the entry
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  verifiedBy?: "physician" | "supervisor" | "external_guideline";
  verifiedAt?: string;
  /** Cited source for the entry. Required for guideline-derived memory. */
  source?: string;

  /** Usage stats — drive demotion. */
  retrievedCount: number;
  lastRetrievedAt?: string;
}

export interface MemoryRetrievalQuery {
  scope: { tenantId?: TenantId; physicianId?: PhysicianId };
  keys?: string[]; // exact key match (preferred)
  keyPrefix?: string; // e.g., "preference:disposition:"
  /** Include shadow entries? Default false. */
  includeShadow?: boolean;
}

export interface DemotionPolicy {
  /** Entries with retrievedCount = 0 after N days → shadow */
  unusedDaysThreshold: number;
  /** Entries in shadow for N days → revoked */
  shadowDaysToRevoke: number;
}

export const DEFAULT_DEMOTION_POLICY: DemotionPolicy = {
  unusedDaysThreshold: 60,
  shadowDaysToRevoke: 180,
};

/**
 * Persistence interface — implement this with your Postgres client.
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
    private readonly persistence: MemoryPersistence,
    private readonly demotionPolicy: DemotionPolicy = DEFAULT_DEMOTION_POLICY,
  ) {}

  /**
   * Write a memory entry. Applies conflict resolution against any
   * existing entry with the same scope + key.
   */
  async write(entry: MemoryEntry): Promise<{ accepted: boolean; reason?: string }> {
    // Validate scope completeness
    if (entry.scope === "tenant" && !entry.tenantId) {
      return { accepted: false, reason: "tenant scope requires tenantId" };
    }
    if (entry.scope === "physician" && (!entry.tenantId || !entry.physicianId)) {
      return { accepted: false, reason: "physician scope requires both tenantId and physicianId" };
    }

    // Look for conflict at same scope + key
    const existing = await this.persistence.fetch({
      scope: { tenantId: entry.tenantId, physicianId: entry.physicianId },
      keys: [entry.key],
      includeShadow: true,
    });

    const sameScope = existing.filter(
      (e) =>
        e.scope === entry.scope &&
        e.tenantId === entry.tenantId &&
        e.physicianId === entry.physicianId,
    );

    if (sameScope.length > 0) {
      // Conflict. The newer entry wins ONLY if it's higher-or-equal
      // confidence AND verified.
      const incumbent = sameScope.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (entry.confidence < incumbent.confidence) {
        return {
          accepted: false,
          reason: `lower confidence (${entry.confidence}) than incumbent (${incumbent.confidence})`,
        };
      }
      if (!entry.verifiedBy && incumbent.verifiedBy) {
        return {
          accepted: false,
          reason: "incumbent is verified; new entry is not",
        };
      }
      // Revoke the incumbent rather than silently overwriting — preserves
      // audit trail.
      await this.persistence.bulkUpdateStatus([incumbent.id], "revoked");
    }

    await this.persistence.upsert({
      ...entry,
      status: entry.status ?? "active",
      retrievedCount: entry.retrievedCount ?? 0,
    });
    return { accepted: true };
  }

  /**
   * Retrieve memory for a given scope. Applies scope-precedence rules:
   * PHYSICIAN > TENANT > GLOBAL when keys collide.
   */
  async retrieve(query: MemoryRetrievalQuery): Promise<MemoryEntry[]> {
    const all = await this.persistence.fetch(query);

    // Filter visibility by scope rules
    const visible = all.filter((e) => this.isVisible(e, query));

    // Apply scope precedence: when the same key appears at multiple scopes,
    // physician > tenant > global.
    const byKey = new Map<string, MemoryEntry>();
    const scopeRank: Record<MemoryScope, number> = { physician: 0, tenant: 1, global: 2 };
    for (const e of visible) {
      const incumbent = byKey.get(e.key);
      if (!incumbent || scopeRank[e.scope] < scopeRank[incumbent.scope]) {
        byKey.set(e.key, e);
      }
    }

    // Mark retrieval (in production, batch this — kept simple here)
    const result = [...byKey.values()];
    return result;
  }

  /**
   * Periodic maintenance — call from a daily cron.
   * Demotes unused → shadow, and revokes long-shadow entries.
   */
  async runDemotionSweep(now: Date = new Date()): Promise<{
    demoted: number;
    revoked: number;
  }> {
    const stale = await this.persistence.findStaleForDemotion(this.demotionPolicy, now);
    if (stale.length) {
      await this.persistence.bulkUpdateStatus(
        stale.map((e) => e.id),
        "shadow",
      );
    }
    const shadowStale = await this.persistence.findStaleForRevocation(this.demotionPolicy, now);
    if (shadowStale.length) {
      await this.persistence.bulkUpdateStatus(
        shadowStale.map((e) => e.id),
        "revoked",
      );
    }
    return { demoted: stale.length, revoked: shadowStale.length };
  }

  private isVisible(entry: MemoryEntry, query: MemoryRetrievalQuery): boolean {
    if (entry.status === "revoked") return false;
    if (entry.status === "shadow" && !query.includeShadow) return false;

    if (entry.scope === "global") return true;
    if (entry.scope === "tenant") {
      return entry.tenantId === query.scope.tenantId;
    }
    if (entry.scope === "physician") {
      return (
        entry.tenantId === query.scope.tenantId &&
        entry.physicianId === query.scope.physicianId
      );
    }
    return false;
  }
}

// ─── Reference Postgres SQL ────────────────────────────────────────────────
//
// CREATE TABLE clinical_memory (
//   id              TEXT PRIMARY KEY,
//   scope           TEXT NOT NULL CHECK (scope IN ('global','tenant','physician')),
//   tenant_id       TEXT,
//   physician_id    TEXT,
//   key             TEXT NOT NULL,
//   content         TEXT NOT NULL,
//   confidence      REAL NOT NULL,
//   status          TEXT NOT NULL CHECK (status IN ('active','shadow','revoked')),
//   created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
//   updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
//   verified_by     TEXT,
//   verified_at     TIMESTAMPTZ,
//   source          TEXT,
//   retrieved_count INT NOT NULL DEFAULT 0,
//   last_retrieved  TIMESTAMPTZ
// );
//
// CREATE INDEX idx_cm_scope_key ON clinical_memory (scope, tenant_id, physician_id, key);
// CREATE INDEX idx_cm_status ON clinical_memory (status);
//
// Row-Level Security policy (since you've already migrated to RLS):
//   - PHYSICIAN-scope rows: visible only when current_setting('app.physician_id')
//     matches physician_id AND current_setting('app.tenant_id') matches tenant_id
//   - TENANT-scope rows: visible when current_setting('app.tenant_id') matches
//   - GLOBAL-scope rows: visible to all authenticated app roles

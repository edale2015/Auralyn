import { pg } from "../db/postgres";
import {
  type MemoryEntry,
  type MemoryPersistence,
  type MemoryRetrievalQuery,
  type MemoryStatus,
  type DemotionPolicy,
} from "./ClinicalMemoryStore";

export class PostgresMemoryPersistence implements MemoryPersistence {
  async upsert(entry: MemoryEntry): Promise<void> {
    await pg.query(
      `INSERT INTO clinical_memory
         (id, scope, tenant_id, physician_id, key, content, confidence,
          status, created_at, updated_at, verified_by, verified_at, source,
          retrieved_count, last_retrieved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         content         = EXCLUDED.content,
         confidence      = EXCLUDED.confidence,
         status          = EXCLUDED.status,
         updated_at      = EXCLUDED.updated_at,
         verified_by     = EXCLUDED.verified_by,
         verified_at     = EXCLUDED.verified_at,
         source          = EXCLUDED.source,
         retrieved_count = EXCLUDED.retrieved_count,
         last_retrieved  = EXCLUDED.last_retrieved`,
      [
        entry.id,
        entry.scope,
        entry.tenantId   ?? null,
        entry.physicianId ?? null,
        entry.key,
        entry.content,
        entry.confidence,
        entry.status,
        entry.createdAt,
        entry.updatedAt,
        entry.verifiedBy    ?? null,
        entry.verifiedAt    ?? null,
        entry.source        ?? null,
        entry.retrievedCount,
        entry.lastRetrievedAt ?? null,
      ],
    );
  }

  async fetch(query: MemoryRetrievalQuery): Promise<MemoryEntry[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (query.scope.tenantId) {
      conditions.push(`(scope = 'global' OR (scope IN ('tenant','physician') AND tenant_id = $${i++}))`);
      params.push(query.scope.tenantId);
    } else {
      conditions.push(`scope = 'global'`);
    }

    if (query.scope.physicianId) {
      conditions.push(`(scope != 'physician' OR physician_id = $${i++})`);
      params.push(query.scope.physicianId);
    }

    if (query.keys?.length) {
      conditions.push(`key = ANY($${i++})`);
      params.push(query.keys);
    }

    if (query.keyPrefix) {
      conditions.push(`key LIKE $${i++}`);
      params.push(`${query.keyPrefix}%`);
    }

    conditions.push(`status != 'revoked'`);
    if (!query.includeShadow) {
      conditions.push(`status != 'shadow'`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pg.query(
      `SELECT * FROM clinical_memory ${where} ORDER BY updated_at DESC LIMIT 500`,
      params,
    );
    return rows.map((r) => this.rowToEntry(r));
  }

  async bulkUpdateStatus(ids: string[], status: MemoryStatus): Promise<void> {
    if (!ids.length) return;
    await pg.query(
      `UPDATE clinical_memory SET status = $1, updated_at = now() WHERE id = ANY($2)`,
      [status, ids],
    );
  }

  async findStaleForDemotion(policy: DemotionPolicy, now: Date): Promise<MemoryEntry[]> {
    const cutoff = new Date(now.getTime() - policy.unusedDaysThreshold * 86_400_000);
    const { rows } = await pg.query(
      `SELECT * FROM clinical_memory
       WHERE status = 'active'
         AND retrieved_count = 0
         AND created_at < $1`,
      [cutoff],
    );
    return rows.map((r) => this.rowToEntry(r));
  }

  async findStaleForRevocation(policy: DemotionPolicy, now: Date): Promise<MemoryEntry[]> {
    const cutoff = new Date(now.getTime() - policy.shadowDaysToRevoke * 86_400_000);
    const { rows } = await pg.query(
      `SELECT * FROM clinical_memory
       WHERE status = 'shadow'
         AND updated_at < $1`,
      [cutoff],
    );
    return rows.map((r) => this.rowToEntry(r));
  }

  private rowToEntry(r: Record<string, unknown>): MemoryEntry {
    return {
      id:             r.id           as string,
      scope:          r.scope        as MemoryEntry["scope"],
      tenantId:       r.tenant_id    as string | undefined,
      physicianId:    r.physician_id as string | undefined,
      key:            r.key          as string,
      content:        r.content      as string,
      confidence:     r.confidence   as number,
      status:         r.status       as MemoryStatus,
      createdAt:      r.created_at   as string,
      updatedAt:      r.updated_at   as string,
      verifiedBy:     r.verified_by  as MemoryEntry["verifiedBy"],
      verifiedAt:     r.verified_at  as string | undefined,
      source:         r.source       as string | undefined,
      retrievedCount: r.retrieved_count as number,
      lastRetrievedAt: r.last_retrieved as string | undefined,
    };
  }
}

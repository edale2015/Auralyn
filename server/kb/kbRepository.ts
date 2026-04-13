/**
 * server/kb/kbRepository.ts — KB entity persistence layer
 *
 * FIX (Code Review Issue #19):
 *   upsertKbEntity previously performed two sequential DB statements on the
 *   update path: db.insert(kbEntityVersions) then db.update(kbEntityStore).
 *   If the insert succeeded but the update failed (or vice versa due to a
 *   connection drop, transaction abort, or application crash), the version
 *   chain was left permanently corrupted — a version row existed without a
 *   corresponding current_content update, or the store was updated without
 *   a version snapshot being written.
 *
 *   Fixed: both operations on the update path are wrapped in a db.transaction().
 *   Either both succeed and are committed, or both are rolled back — no partial
 *   state is possible. The insert path also wraps both operations for consistency.
 */

import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import {
  kbSources, kbEntityStore, kbEntityVersions,
  type KbSource, type KbEntityStore, type KbEntityVersion,
  type InsertKbSource, type InsertKbEntityStore, type InsertKbEntityVersion,
} from "@shared/schema";
import { type KbEntityInput, type KbEntityType, type KbEntityStatus } from "./kbTypes";
import { logger } from "../utils/logger";

// ── Sources ───────────────────────────────────────────────────────────────────

export async function upsertKbSource(input: {
  sourceKey:       string;
  sourceType:      string;
  name:            string;
  description?:    string;
  isAuthoritative?: boolean;
  metadata?:       Record<string, unknown>;
}): Promise<KbSource> {
  const existing = await db
    .select()
    .from(kbSources)
    .where(eq(kbSources.sourceKey, input.sourceKey))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(kbSources)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(kbSources.sourceKey, input.sourceKey))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(kbSources)
    .values({
      sourceKey:       input.sourceKey,
      sourceType:      input.sourceType,
      name:            input.name,
      description:     input.description ?? null,
      isAuthoritative: input.isAuthoritative ?? false,
      metadata:        input.metadata ?? {},
    } satisfies InsertKbSource)
    .returning();
  return inserted;
}

export async function getSourceByKey(sourceKey: string): Promise<KbSource | undefined> {
  const rows = await db
    .select()
    .from(kbSources)
    .where(eq(kbSources.sourceKey, sourceKey))
    .limit(1);
  return rows[0];
}

// ── Entity Store ──────────────────────────────────────────────────────────────

export async function upsertKbEntity(input: KbEntityInput): Promise<KbEntityStore> {
  let sourceId: number | undefined;
  if (input.sourceKey) {
    const src = await getSourceByKey(input.sourceKey);
    if (src) sourceId = src.id;
  }

  const existing = await db
    .select()
    .from(kbEntityStore)
    .where(
      and(
        eq(kbEntityStore.entityType, input.entityType),
        eq(kbEntityStore.entityKey, input.entityKey)
      )
    )
    .limit(1);

  if (existing[0]) {
    // ── UPDATE PATH: wrapped in transaction (Issue #19 FIX) ─────────────────
    // Version insert and store update must both succeed or both roll back.
    // A crash between the two statements previously left the version chain
    // in a permanently corrupted state.
    const updated = await db.transaction(async (tx) => {
      const next = existing[0].version + 1;

      await tx.insert(kbEntityVersions).values({
        entityId:      existing[0].id,
        version:       next,
        title:         input.title,
        content:       input.content,
        changeSummary: input.changeSummary,
        changedBy:     input.changedBy ?? "system",
      } satisfies InsertKbEntityVersion);

      const [updated] = await tx
        .update(kbEntityStore)
        .set({
          title:          input.title,
          currentContent: input.content,
          tags:           input.tags ?? existing[0].tags,
          version:        next,
          sourceId:       sourceId ?? existing[0].sourceId,
          updatedBy:      input.changedBy ?? "system",
          updatedAt:      new Date(),
        })
        .where(eq(kbEntityStore.id, existing[0].id))
        .returning();

      return updated;
    });

    return updated;
  }

  // ── INSERT PATH: wrapped in transaction (Issue #19 FIX) ───────────────────
  // Store insert and initial version insert must both succeed atomically.
  const inserted = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(kbEntityStore)
      .values({
        entityType:     input.entityType,
        entityKey:      input.entityKey,
        title:          input.title,
        status:         "active",
        version:        1,
        tags:           input.tags ?? [],
        currentContent: input.content,
        sourceId:       sourceId ?? null,
        createdBy:      input.changedBy ?? "system",
        updatedBy:      input.changedBy ?? "system",
      } satisfies InsertKbEntityStore)
      .returning();

    await tx.insert(kbEntityVersions).values({
      entityId:      inserted.id,
      version:       1,
      title:         input.title,
      content:       input.content,
      changeSummary: input.changeSummary ?? "Initial version",
      changedBy:     input.changedBy ?? "system",
    } satisfies InsertKbEntityVersion);

    return inserted;
  });

  return inserted;
}

export async function getKbEntity(
  entityType: KbEntityType,
  entityKey: string
): Promise<KbEntityStore | undefined> {
  const rows = await db
    .select()
    .from(kbEntityStore)
    .where(
      and(
        eq(kbEntityStore.entityType, entityType),
        eq(kbEntityStore.entityKey, entityKey)
      )
    )
    .limit(1);
  return rows[0];
}

export async function listKbEntities(opts: {
  entityType?: KbEntityType;
  status?:     KbEntityStatus;
  limit?:      number;
  offset?:     number;
}): Promise<KbEntityStore[]> {
  let q = db.select().from(kbEntityStore);
  const filters = [];
  if (opts.entityType) filters.push(eq(kbEntityStore.entityType, opts.entityType));
  if (opts.status)     filters.push(eq(kbEntityStore.status, opts.status));
  if (filters.length) {
    const [first, ...rest] = filters;
    q = q.where(rest.length ? and(first, ...rest) : first) as any;
  }
  return await (q as any)
    .orderBy(desc(kbEntityStore.updatedAt))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);
}

export async function setKbEntityStatus(
  id: number,
  status: KbEntityStatus
): Promise<void> {
  await db
    .update(kbEntityStore)
    .set({ status, updatedAt: new Date() })
    .where(eq(kbEntityStore.id, id));
}

export async function getEntityVersionHistory(entityId: number): Promise<KbEntityVersion[]> {
  return db
    .select()
    .from(kbEntityVersions)
    .where(eq(kbEntityVersions.entityId, entityId))
    .orderBy(desc(kbEntityVersions.version));
}

export async function countKbEntities(entityType?: KbEntityType): Promise<number> {
  const rows = await db
    .select()
    .from(kbEntityStore)
    .where(entityType ? eq(kbEntityStore.entityType, entityType) : undefined);
  return rows.length;
}

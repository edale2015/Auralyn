import { db } from "../../db";
import { kbReviewQueue, kbAuditTrail, kbEntityStore } from "../../../shared/schema";
import { eq } from "drizzle-orm";

async function logAudit(action: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await db.insert(kbAuditTrail).values({
      entityType: payload.entityType as string | undefined,
      entityKey:  payload.entityKey as string | undefined,
      version:    payload.version as number | undefined,
      action,
      actorId:    (payload.actorId ?? payload.reviewerId) as string | undefined,
      payload,
    });
  } catch (err) {
    console.error("[KbGovernance] Failed to write audit trail entry:", err);
  }
}

export async function submitForReview(entity: {
  entityType: string;
  entityKey:  string;
  version:    number;
  actorId:    string;
  rationale?: string;
}): Promise<void> {
  await db.insert(kbReviewQueue).values({
    entityType: entity.entityType,
    entityKey:  entity.entityKey,
    version:    entity.version,
    proposedBy: entity.actorId,
    rationale:  entity.rationale ?? null,
    status:     "pending",
  });

  await logAudit("SUBMIT_REVIEW", entity);
}

export async function listPendingReviews(): Promise<typeof kbReviewQueue.$inferSelect[]> {
  return db
    .select()
    .from(kbReviewQueue)
    .where(eq(kbReviewQueue.status, "pending"))
    .orderBy(kbReviewQueue.createdAt);
}

export async function approveChange(id: number, reviewerId: string): Promise<void> {
  const [row] = await db.select().from(kbReviewQueue).where(eq(kbReviewQueue.id, id));
  if (!row) throw new Error(`KB review item #${id} not found`);
  if (row.status !== "pending") throw new Error(`KB review item #${id} is already ${row.status}`);

  await db.transaction(async (tx) => {
    await tx
      .update(kbReviewQueue)
      .set({ status: "approved", reviewedBy: reviewerId, reviewedAt: new Date() })
      .where(eq(kbReviewQueue.id, id));

    // Activate the KB entity so it goes live
    await tx
      .update(kbEntityStore)
      .set({ status: "active", updatedBy: reviewerId })
      .where(eq(kbEntityStore.entityKey, row.entityKey));
  });

  await logAudit("APPROVE", {
    entityType: row.entityType,
    entityKey:  row.entityKey,
    version:    row.version,
    reviewerId,
    queueId:    id,
  });
}

export async function rejectChange(id: number, reviewerId: string, reason: string): Promise<void> {
  const [row] = await db.select().from(kbReviewQueue).where(eq(kbReviewQueue.id, id));
  if (!row) throw new Error(`KB review item #${id} not found`);
  if (row.status !== "pending") throw new Error(`KB review item #${id} is already ${row.status}`);

  await db
    .update(kbReviewQueue)
    .set({ status: "rejected", reviewedBy: reviewerId, reviewedAt: new Date(), rationale: reason })
    .where(eq(kbReviewQueue.id, id));

  await logAudit("REJECT", {
    entityType: row.entityType,
    entityKey:  row.entityKey,
    version:    row.version,
    reviewerId,
    reason,
    queueId:    id,
  });
}

export async function getKbAuditTrail(entityKey?: string): Promise<typeof kbAuditTrail.$inferSelect[]> {
  if (entityKey) {
    return db
      .select()
      .from(kbAuditTrail)
      .where(eq(kbAuditTrail.entityKey, entityKey))
      .orderBy(kbAuditTrail.createdAt);
  }
  return db.select().from(kbAuditTrail).orderBy(kbAuditTrail.createdAt);
}

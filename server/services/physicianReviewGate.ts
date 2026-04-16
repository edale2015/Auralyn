/**
 * Physician review gate.
 *
 * All clinical answers below the HIGH-confidence threshold are queued
 * for physician review before they may be acted upon clinically.
 *
 * Uses the `physician_review_queue` table.
 */

import { db }  from "../db";
import { sql } from "drizzle-orm";

export type UncertaintyLevel = "HIGH" | "MEDIUM" | "LOW";
export type ReviewDecision   = "approved" | "overridden" | "rejected";

export interface ReviewQueueItem {
  query:            string;
  proposedAnswer:   string;
  confidenceScore:  number;
  confidenceLevel:  UncertaintyLevel;
  sourceCount:      number;
  hedgeCount:       number;
  patientContextId?: string;
  requestedBy?:     string;
}

/**
 * Enqueue an answer for physician review.
 * Returns the newly created row id.
 */
export async function queueForReview(item: ReviewQueueItem): Promise<number> {
  const rows = await db.execute(sql`
    INSERT INTO physician_review_queue
      (query, proposed_answer, confidence_score, confidence_level,
       source_count, hedge_word_count, patient_context_id, requested_by, status)
    VALUES
      (${item.query}, ${item.proposedAnswer}, ${item.confidenceScore},
       ${item.confidenceLevel}, ${item.sourceCount}, ${item.hedgeCount},
       ${item.patientContextId ?? null}, ${item.requestedBy ?? null}, 'pending')
    RETURNING id
  `);

  return (rows.rows[0] as { id: number }).id;
}

/**
 * Fetch all pending reviews, sorted by urgency (LOW confidence first).
 */
export async function getPendingReviews(): Promise<unknown[]> {
  const rows = await db.execute(sql`
    SELECT *
    FROM physician_review_queue
    WHERE status = 'pending'
    ORDER BY
      CASE confidence_level
        WHEN 'LOW'    THEN 1
        WHEN 'MEDIUM' THEN 2
        WHEN 'HIGH'   THEN 3
      END,
      created_at ASC
  `);

  return rows.rows;
}

/**
 * Submit a physician decision on a queued item.
 */
export async function submitReviewDecision(args: {
  reviewId:    number;
  decision:    ReviewDecision;
  physicianId: string;
  note?:       string | null;
  finalAnswer?: string | null;
}): Promise<void> {
  await db.execute(sql`
    UPDATE physician_review_queue
    SET
      status       = ${args.decision},
      reviewed_by  = ${args.physicianId},
      review_note  = ${args.note ?? null},
      final_answer = ${args.finalAnswer ?? null},
      reviewed_at  = NOW()
    WHERE id = ${args.reviewId}
  `);
}

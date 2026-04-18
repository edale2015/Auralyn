/**
 * server/research/openaiSliceReview.ts
 * OpenAI slice review — second-pass conservative review for a single code slice.
 *
 * Given a claude_slice_reviews row, calls OpenAI, stores result in
 * openai_slice_reviews, and returns the review.
 */

import { db }                   from "../db";
import { reviewSlices, claudeSliceReviews, openaiSliceReviews } from "../../shared/schema";
import { eq }                   from "drizzle-orm";
import { runOpenAIReviewStage } from "./openaiReviewClient";

export async function reviewClaudeSliceWithOpenAI(sliceId: string) {
  // 1. Fetch review slice definition
  const sliceRows = await db
    .select()
    .from(reviewSlices)
    .where(eq(reviewSlices.sliceId, sliceId));

  const slice = sliceRows[0];
  if (!slice) throw new Error(`Review slice not found: ${sliceId}`);

  // 2. Fetch most recent Claude findings for this slice
  const claudeRows = await db
    .select()
    .from(claudeSliceReviews)
    .where(eq(claudeSliceReviews.reviewSliceId, slice.id));

  if (!claudeRows.length) {
    throw new Error(`No Claude findings found for slice ${sliceId} — submit findings first`);
  }
  const claudeReview = claudeRows[claudeRows.length - 1];

  // 3. Call OpenAI with the Claude findings
  const result = await runOpenAIReviewStage({
    claudeRecommendations: claudeReview.claudeFindings,
    relevantCode:          {},     // code was already included in Claude's findings
    articleSummary:        slice.title,
    systemContext:
      `Auralyn slice review: "${slice.title}". ` +
      "Review only the listed files. Stay within this slice. Prefer conservative, additive changes.",
  });

  // 4. Persist the OpenAI review
  const [inserted] = await db
    .insert(openaiSliceReviews)
    .values({
      reviewSliceId:       slice.id,
      claudeSliceReviewId: claudeReview.id,
      summaryForUser:      result.summaryForUser,
      reviewJson:          result,
      overallVerdict:      result.overallVerdict,
      status:              "completed",
    })
    .returning();

  return inserted;
}

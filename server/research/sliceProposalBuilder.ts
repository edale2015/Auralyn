/**
 * server/research/sliceProposalBuilder.ts
 * Converts an OpenAI slice review into individual slice_proposals rows.
 *
 * Each recommended upgrade from the OpenAI review becomes one proposal
 * with its affected files, rationale, validation plan, and patch scaffold.
 */

import { db }                 from "../db";
import { reviewSlices, openaiSliceReviews, sliceProposals } from "../../shared/schema";
import { eq }                 from "drizzle-orm";

export async function buildSliceProposals(sliceId: string) {
  // 1. Fetch slice definition
  const sliceRows = await db
    .select()
    .from(reviewSlices)
    .where(eq(reviewSlices.sliceId, sliceId));

  const slice = sliceRows[0];
  if (!slice) throw new Error(`Review slice not found: ${sliceId}`);

  // 2. Fetch most recent OpenAI review for this slice
  const oaiRows = await db
    .select()
    .from(openaiSliceReviews)
    .where(eq(openaiSliceReviews.reviewSliceId, slice.id));

  if (!oaiRows.length) {
    throw new Error(`No OpenAI slice review found for slice ${sliceId} — run OpenAI review first`);
  }
  const oaiReview = oaiRows[oaiRows.length - 1];
  const reviewJson = oaiReview.reviewJson as any;

  const created: any[] = [];

  // 3. Create one proposal per recommended upgrade
  for (const item of reviewJson?.recommendedUpgrades ?? []) {
    if (item.verdict === "ignore") continue;   // skip explicitly ignored items

    const [inserted] = await db
      .insert(sliceProposals)
      .values({
        reviewSliceId:       slice.id,
        openaiSliceReviewId: oaiReview.id,
        title:               item.title,
        rationale:           item.rationale,
        affectedFiles:       item.affectedFiles ?? [],
        patchBundle:         {},       // populated manually or by future auto-patch tool
        validationPlan:      item.validationPlan ?? [],
        validationStatus:    "pending",
        approved:            false,
        replitStatus:        "pending",
      })
      .returning();

    created.push(inserted);
  }

  return created;
}

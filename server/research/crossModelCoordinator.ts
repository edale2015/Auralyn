/**
 * server/research/crossModelCoordinator.ts
 * Cross-Model Coordinator — sends Claude findings to OpenAI review stage.
 *
 * Pipeline:
 *   Claude reviews code slice → findings stored → OpenAI reviews findings → proposals created
 *
 * This coordinator manages the handoff between models and persists results
 * in cross_model_reviews, then converts OpenAI recommendations to proposed_upgrades.
 */

import { db }                      from "../db";
import { crossModelReviews, proposedUpgrades } from "../../shared/schema";
import { eq }                      from "drizzle-orm";
import { runOpenAIReviewStage }    from "./openaiReviewClient";

export async function sendClaudeFindingsToOpenAI(args: {
  articleId?:             number;
  claudeRecommendations:  string;
  relevantCode:           Record<string, string>;
  articleSummary?:        string;
}) {
  const review = await runOpenAIReviewStage({
    claudeRecommendations: args.claudeRecommendations,
    relevantCode:          args.relevantCode,
    articleSummary:        args.articleSummary,
    systemContext:
      "Auralyn is a HIPAA-compliant medical triage system. Final disposition must remain safety-gated and physician-review capable. All changes must preserve audit trails.",
  });

  const [inserted] = await db
    .insert(crossModelReviews)
    .values({
      articleId:             args.articleId ?? null,
      claudeRecommendations: args.claudeRecommendations,
      relevantCode:          args.relevantCode,
      articleSummary:        args.articleSummary ?? null,
      openaiSummary:         review.summaryForUser,
      openaiReview:          review,
      status:                "reviewed",
    })
    .returning();

  return inserted;
}

export async function convertOpenAIReviewToProposals(crossModelReviewId: number) {
  const [record] = await db
    .select()
    .from(crossModelReviews)
    .where(eq(crossModelReviews.id, crossModelReviewId));

  if (!record) throw new Error(`crossModelReview ${crossModelReviewId} not found`);

  const review = record.openaiReview as any;
  const created: any[] = [];

  for (const item of review?.recommendedUpgrades ?? []) {
    const [inserted] = await db
      .insert(proposedUpgrades)
      .values({
        articleId:             record.articleId ?? 0,
        title:                 item.title,
        rationale:             item.rationale,
        affectedFiles:         item.affectedFiles ?? [],
        patchBundle:           {},
        validationPlan:        item.validationPlan ?? [],
        validationStatus:      "pending",
        requiresHumanApproval: true,
        approved:              false,
      })
      .returning();

    created.push(inserted);
  }

  return created;
}

export async function getCrossModelReview(id: number) {
  const [record] = await db
    .select()
    .from(crossModelReviews)
    .where(eq(crossModelReviews.id, id));
  return record ?? null;
}

/**
 * server/research/agentHandoffBuilder.ts
 * Orchestrates the full automated research → code pipeline for a single article:
 *
 *   A. generateCodeProposal   — GPT-4o Code Architect
 *   B. runClaudeReview        — Claude Safety Review (HIPAA/FDA/clinical adversarial pass)
 *   B2. runClaudeSliceReview  — Claude Slice Review (import-aware architecture & coupling)
 *   C. refineCodeProposal     — GPT-4o Refiner (sees both Claude reviews)
 *   D. Save to agent_handoffs with status = "awaiting_approval"
 *
 * Nothing touches the live codebase until human approval + agent sign-off.
 */

import { db }                      from "../db";
import { agentHandoffs, researchArticles, researchSummaries } from "../../shared/schema";
import { eq }                      from "drizzle-orm";
import { generateCodeProposal }    from "./autoCodeProposalEngine";
import { runClaudeReview }         from "./claudeReviewAgent";
import { runClaudeSliceReview }    from "./claudeCodeSliceReview";
import { refineCodeProposal }      from "./openaiCodeRefiner";

export async function buildAgentHandoff(articleId: number): Promise<{ handoffId: number; status: string }> {
  const [article] = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
  if (!article) throw new Error(`Article ${articleId} not found`);

  const [summaryRow] = await db.select().from(researchSummaries).where(eq(researchSummaries.articleId, articleId));
  const articleSummary = summaryRow?.summary ?? null;

  const [handoff] = await db
    .insert(agentHandoffs)
    .values({
      articleId,
      articleTitle:   article.title,
      articleUrl:     article.url,
      articleSummary,
      pipelineStatus: "running",
    })
    .returning();

  const handoffId = handoff.id;
  const tags = (article.tags as string[]) ?? [];

  try {
    // ── Step A: GPT-4o Code Architect ────────────────────────────────────────
    console.log(`[agentHandoff #${handoffId}] Step A: generating code proposal for "${article.title}"`);
    const proposal = await generateCodeProposal({
      articleId,
      title:   article.title,
      excerpt: article.excerpt,
      tags,
      summary: articleSummary,
    });

    await db.update(agentHandoffs)
      .set({ openaiCodeProposal: proposal as any })
      .where(eq(agentHandoffs.id, handoffId));

    // ── Step B: Claude Safety Review ─────────────────────────────────────────
    console.log(`[agentHandoff #${handoffId}] Step B: running Claude safety review`);
    const review = await runClaudeReview({
      codeProposal:   proposal,
      articleTitle:   article.title,
      articleSummary,
    });

    await db.update(agentHandoffs)
      .set({ claudeCodeReview: review as any })
      .where(eq(agentHandoffs.id, handoffId));

    // ── Step B2: Claude Slice Review (architecture + coupling) ───────────────
    console.log(`[agentHandoff #${handoffId}] Step B2: running Claude slice/architecture review`);
    const sliceReview = await runClaudeSliceReview({
      proposal,
      articleTitle: article.title,
    });

    await db.update(agentHandoffs)
      .set({ claudeSliceReview: sliceReview as any })
      .where(eq(agentHandoffs.id, handoffId));

    // Log confidence score so it's visible in server logs
    console.log(`[agentHandoff #${handoffId}] Step B2 complete — verdict: ${sliceReview.verdict}, confidence: ${sliceReview.confidenceScore}/100`);

    // ── Step C: GPT-4o Refiner (sees both Claude reviews) ────────────────────
    console.log(`[agentHandoff #${handoffId}] Step C: refining code with both review inputs`);
    const refined = await refineCodeProposal({
      original:     proposal,
      review,
      sliceReview,
      articleTitle: article.title,
    });

    await db.update(agentHandoffs)
      .set({
        openaiRefinedCode: refined as any,
        pipelineStatus:    "awaiting_approval",
      })
      .where(eq(agentHandoffs.id, handoffId));

    console.log(`[agentHandoff #${handoffId}] Pipeline complete — awaiting human approval`);
    return { handoffId, status: "awaiting_approval" };

  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    console.error(`[agentHandoff #${handoffId}] Pipeline failed:`, errMsg);
    await db.update(agentHandoffs)
      .set({ pipelineStatus: "failed", agentNotes: `Pipeline error: ${errMsg}` })
      .where(eq(agentHandoffs.id, handoffId));
    throw err;
  }
}

/** Approve a handoff for agent implementation */
export async function approveHandoff(handoffId: number, approvedBy: string) {
  const [updated] = await db.update(agentHandoffs)
    .set({
      pipelineStatus:  "approved",
      humanApprovedBy: approvedBy,
      humanApprovedAt: new Date(),
    })
    .where(eq(agentHandoffs.id, handoffId))
    .returning();
  return updated;
}

/** Reject a handoff */
export async function rejectHandoff(handoffId: number, reason: string) {
  const [updated] = await db.update(agentHandoffs)
    .set({
      pipelineStatus: "rejected",
      agentNotes:     `Rejected: ${reason}`,
    })
    .where(eq(agentHandoffs.id, handoffId))
    .returning();
  return updated;
}

/** Mark a handoff as implemented */
export async function markHandoffImplemented(handoffId: number, agentNotes: string) {
  const [updated] = await db.update(agentHandoffs)
    .set({
      pipelineStatus: "implemented",
      agentNotes,
    })
    .where(eq(agentHandoffs.id, handoffId))
    .returning();
  return updated;
}

/** Count handoffs pending human approval */
export async function countPendingApprovals(): Promise<number> {
  const rows = await db.select().from(agentHandoffs);
  return rows.filter(r => r.pipelineStatus === "awaiting_approval").length;
}

/** Count handoffs approved and ready for agent implementation */
export async function countApprovedForAgent(): Promise<number> {
  const rows = await db.select().from(agentHandoffs);
  return rows.filter(r => r.pipelineStatus === "approved").length;
}

/**
 * server/research/agentHandoffBuilder.ts
 * Step D: Agent Handoff Package Assembler
 *
 * Orchestrates the full automated pipeline for a single article:
 *   A. generateCodeProposal   — GPT-4o Code Architect
 *   B. runClaudeReview        — AI Safety Reviewer ("Claude Review")
 *   C. refineCodeProposal     — GPT-4o Code Refiner
 *   D. Save to agent_handoffs with status = "awaiting_approval"
 *
 * Called automatically for every `adopt`-rated article after scan.
 * The assembled package waits for human approval before reaching the agent.
 */

import { db }                     from "../db";
import { agentHandoffs, researchArticles, researchSummaries } from "../../shared/schema";
import { eq }                     from "drizzle-orm";
import { generateCodeProposal }   from "./autoCodeProposalEngine";
import { runClaudeReview }        from "./claudeReviewAgent";
import { refineCodeProposal }     from "./openaiCodeRefiner";

export async function buildAgentHandoff(articleId: number): Promise<{ handoffId: number; status: string }> {
  // 1. Load the article
  const [article] = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
  if (!article) throw new Error(`Article ${articleId} not found`);

  // 2. Load the summary (may not exist yet — that's fine)
  const [summaryRow] = await db.select().from(researchSummaries).where(eq(researchSummaries.articleId, articleId));
  const articleSummary = summaryRow?.summary ?? null;

  // 3. Create the handoff record immediately so we can track progress
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

    // ── Step B: AI Safety Review ("Claude Review") ───────────────────────────
    console.log(`[agentHandoff #${handoffId}] Step B: running safety review`);
    const review = await runClaudeReview({
      codeProposal:   proposal,
      articleTitle:   article.title,
      articleSummary,
    });

    await db.update(agentHandoffs)
      .set({ claudeCodeReview: review as any })
      .where(eq(agentHandoffs.id, handoffId));

    // ── Step C: GPT-4o Code Refiner ──────────────────────────────────────────
    console.log(`[agentHandoff #${handoffId}] Step C: refining code based on review`);
    const refined = await refineCodeProposal({
      original:     proposal,
      review,
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
    console.error(`[agentHandoff #${handoffId}] Pipeline failed:`, err?.message);
    await db.update(agentHandoffs)
      .set({ pipelineStatus: "failed" })
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

/** Mark a handoff as implemented (agent writes this after finishing the code changes) */
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

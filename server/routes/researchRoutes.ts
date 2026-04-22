/**
 * server/routes/researchRoutes.ts
 * Research Pipeline API — orchestrates the full auto-research workflow:
 *   scan → triage → summarize → propose → validate → approve → export
 *
 * All write routes require physician-level auth.
 * Scan and list routes require admin role.
 */

import express from "express";
import { requirePhysician } from "../auth/requirePhysician";
import { requireRole }      from "../auth/requirePhysician";
import { db }               from "../db";
import { eq, desc, sql }    from "drizzle-orm";
import {
  researchArticles, researchReviews, researchSummaries,
  proposedUpgrades, githubExports, agentHandoffs,
} from "../../shared/schema";

import { scanMediumFeeds }          from "../research/mediumScout";
import { triageArticle }            from "../research/articleTriage";
import { buildArticleSummary }      from "../research/articleSummarizer";
import { proposeUpgrade }           from "../research/upgradePlanner";
import { autoValidateUpgrade }      from "../research/autoValidate";
import { approveUpgrade, rejectUpgrade } from "../research/humanApproval";
import { exportUpgradeToGitHub, isGitHubConfigured } from "../integrations/githubExporter";
import { buildAgentHandoff }        from "../research/agentHandoffBuilder";
import { scanSavedLists, SAVED_LISTS, addSavedList } from "../research/mediumListScraper";
import { runStandaloneCodeReview, getReviewGroups, createCodeReviewHandoff, runPipelineForHandoff } from "../research/standaloneCodeReview";

const router = express.Router();

// ── Public config check ───────────────────────────────────────────────────────

router.get("/config", (_req, res) => {
  res.json({
    ok:               true,
    githubConfigured: isGitHubConfigured(),
    openaiConfigured: Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY),
    // Check both spellings — Replit secret stored as Anthropic_API_Key
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_Key),
    reviewGroups: getReviewGroups(),
  });
});

// ── Saved list management ─────────────────────────────────────────────────────

router.get("/saved-lists", requirePhysician, (_req, res) => {
  res.json({ ok: true, lists: SAVED_LISTS });
});

router.post("/saved-lists", requirePhysician, (req, res) => {
  const { label, url } = req.body ?? {};
  if (!label || !url) return res.status(400).json({ ok: false, error: "label and url required" });
  if (!url.startsWith("https://medium.com/")) return res.status(400).json({ ok: false, error: "Only Medium list URLs are supported" });
  const lists = addSavedList(String(label), String(url));
  res.json({ ok: true, lists });
});

// ── Scan saved lists (Medium saved list scraper) ──────────────────────────────

router.post("/scan-lists", requireRole(["admin"]), async (_req, res) => {
  try {
    const result = await scanSavedLists();

    // Auto-pipeline same as tag scan: triage + summarize + handoff for new adopt articles
    if (result.inserted.length > 0) {
      (async () => {
        for (const articleId of result.inserted) {
          try {
            const [article] = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
            if (!article) continue;
            const triageResult = triageArticle({ title: article.title, excerpt: article.excerpt, tags: (article.tags as string[]) ?? [] });
            await db.insert(researchReviews).values({ articleId, ...triageResult }).onConflictDoNothing();
            await buildArticleSummary(articleId).catch(() => {});
            if (triageResult.verdict === "adopt") {
              await buildAgentHandoff(articleId).catch((e: any) =>
                console.error(`[scan-lists auto-pipeline] handoff failed for article ${articleId}:`, e?.message)
              );
            }
          } catch (e: any) {
            console.error(`[scan-lists auto-pipeline] error for article ${articleId}:`, e?.message);
          }
        }
      })();
    }

    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── Standalone app code review (no article required) ──────────────────────────

router.post("/app-code-review", requireRole(["admin"]), async (req, res) => {
  try {
    const { groupName } = req.body ?? {};

    // Phase 1 — create the handoff record synchronously so the client gets the ID immediately
    const { handoffId, groupName: resolvedGroup } = await createCodeReviewHandoff({ groupName });

    // Respond immediately with the handoff ID so the client can poll progress
    res.json({
      ok: true,
      handoffId,
      groupName: resolvedGroup,
      message: `Code review started for "${resolvedGroup}" — polling handoff #${handoffId} for live progress`,
    });

    // Phase 2 — run the full AI pipeline in background (30-90 seconds)
    setImmediate(() => {
      runPipelineForHandoff(handoffId, { groupName }).catch((e: any) =>
        console.error(`[app-code-review #${handoffId}] pipeline failed:`, e?.message)
      );
    });

  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── Medium-only run: scan feeds + scan lists, no code review ──────────────────

router.post("/medium-run", requireRole(["admin"]), async (_req, res) => {
  try {
    // Phase 1: scan feeds + lists (fast, ~5s) — done before responding
    const [feedResult, listResult] = await Promise.allSettled([
      scanMediumFeeds(),
      scanSavedLists(),
    ]);

    const feedInserted: number[] = (feedResult.status === "fulfilled" ? (feedResult.value as any)?.inserted : []) ?? [];
    const listInserted: number[] = (listResult.status === "fulfilled" ? (listResult.value as any)?.inserted : []) ?? [];
    const allIds = [...feedInserted, ...listInserted];

    // Phase 2: triage all articles (fast, CPU-only scoring) — done before responding
    type TriagedItem = { articleId: number; verdict: string; triageResult: any };
    const triaged: TriagedItem[] = [];
    for (const articleId of allIds) {
      try {
        const [article] = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
        if (!article) continue;
        const triageResult = triageArticle({ title: article.title, excerpt: article.excerpt, tags: (article.tags as string[]) ?? [] });
        await db.insert(researchReviews).values({ articleId, ...triageResult }).onConflictDoNothing();
        triaged.push({ articleId, verdict: triageResult.verdict, triageResult });
      } catch (e: any) {
        console.error(`[medium-run] triage error for ${articleId}:`, e?.message);
      }
    }

    const adopted  = triaged.filter(t => t.verdict === "adopt").length;
    const testOnly = triaged.filter(t => t.verdict === "test_only").length;
    const ignored  = triaged.filter(t => t.verdict === "ignore").length;

    // Respond immediately with actual scan + triage counts
    res.json({
      ok: true,
      scanned:  allIds.length,
      adopted,
      testOnly,
      ignored,
      feeds:    feedInserted.length,
      lists:    listInserted.length,
      message:  `Scanned ${allIds.length} new articles — ${adopted} promoted to Agent Handoff Queue, ${testOnly} in Research Inbox`,
    });

    // Phase 3: build AI summaries + agent handoffs in background (slow — AI calls)
    setImmediate(async () => {
      for (const { articleId, verdict, triageResult } of triaged) {
        try {
          await buildArticleSummary(articleId).catch(() => {});
          if (verdict === "adopt") {
            await buildAgentHandoff(articleId).catch((e: any) =>
              console.error(`[medium-run] handoff failed for article ${articleId}:`, e?.message)
            );
          }
        } catch (e: any) {
          console.error(`[medium-run] summary/handoff error for ${articleId}:`, e?.message);
        }
      }
      console.log(`[medium-run] Background complete — ${adopted} handoffs, ${testOnly} test_only, ${ignored} ignored`);
    });

    console.log(`[medium-run] Scan+triage complete — feeds: ${feedInserted.length}, lists: ${listInserted.length}, adopted: ${adopted}`);
  } catch (e: any) {
    console.error("[medium-run] error:", e?.message);
    if (!res.headersSent) res.status(500).json({ error: e?.message ?? "Pipeline failed" });
  }
});

// ── Full pipeline trigger: scan feeds + scan lists + app code review in parallel ─

router.post("/full-run", requireRole(["admin"]), async (_req, res) => {
  try {
    // Respond immediately — everything runs in background
    res.json({ ok: true, message: "Full pipeline started: feed scan + list scan + app code review running in parallel" });

    // Run all three in parallel, non-blocking
    const scanFeeds    = import("../research/mediumScout").then(m => m.scanMediumFeeds());
    const scanLists    = scanSavedLists();
    const codeReview   = runStandaloneCodeReview();

    const [feedResult, listResult] = await Promise.allSettled([scanFeeds, scanLists, codeReview]);

    // Auto-pipeline for any new articles from feed scan
    const { scanMediumFeeds: _ } = await import("../research/mediumScout");
    const feedInserted: number[] = (feedResult.status === "fulfilled" ? (feedResult.value as any)?.inserted : []) ?? [];
    const listInserted: number[] = (listResult.status === "fulfilled" ? (listResult.value as any)?.inserted : []) ?? [];

    for (const articleId of [...feedInserted, ...listInserted]) {
      try {
        const [article] = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
        if (!article) continue;
        const triageResult = triageArticle({ title: article.title, excerpt: article.excerpt, tags: (article.tags as string[]) ?? [] });
        await db.insert(researchReviews).values({ articleId, ...triageResult }).onConflictDoNothing();
        await buildArticleSummary(articleId).catch(() => {});
        if (triageResult.verdict === "adopt") {
          await buildAgentHandoff(articleId).catch((e: any) =>
            console.error(`[full-run] handoff failed for article ${articleId}:`, e?.message)
          );
        }
      } catch (e: any) {
        console.error(`[full-run] article pipeline error for ${articleId}:`, e?.message);
      }
    }

    console.log(`[full-run] Complete — feeds: ${feedInserted.length} new, lists: ${listInserted.length} new`);
  } catch (e: any) {
    console.error("[full-run] error:", e?.message);
  }
});

// ── All other routes require auth ─────────────────────────────────────────────

router.use(requirePhysician);

// ── Article listing (joined with reviews so verdict is always present) ────────

router.get("/articles", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        a.*,
        r.verdict,
        r.relevance_score,
        r.trust_score,
        r.novelty_score,
        r.actionability_score
      FROM research_articles a
      LEFT JOIN research_reviews r ON r.article_id = a.id
      ORDER BY a.created_at DESC
      LIMIT 500
    `);
    res.json({ ok: true, articles: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/articles/:id", async (req, res) => {
  try {
    const id  = Number(req.params.id);
    const [article] = await db.select().from(researchArticles).where(eq(researchArticles.id, id));
    if (!article) return res.status(404).json({ ok: false, error: "Not found" });

    const [review]  = await db.select().from(researchReviews).where(eq(researchReviews.articleId, id));
    const [summary] = await db.select().from(researchSummaries).where(eq(researchSummaries.articleId, id));
    const upgrades  = await db.select().from(proposedUpgrades).where(eq(proposedUpgrades.articleId, id));

    res.json({ ok: true, article, review: review ?? null, summary: summary ?? null, upgrades });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── Pipeline steps ────────────────────────────────────────────────────────────

router.post("/scan", requireRole(["admin"]), async (_req, res) => {
  try {
    const result = await scanMediumFeeds();

    // Auto-pipeline: triage + summarize + agent handoff for every new article
    // Fire-and-forget so the scan response returns immediately
    if (result.inserted.length > 0) {
      (async () => {
        for (const articleId of result.inserted) {
          try {
            // Triage
            const [article] = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
            if (!article) continue;
            const triageResult = triageArticle({ title: article.title, excerpt: article.excerpt, tags: (article.tags as string[]) ?? [] });
            await db.insert(researchReviews).values({ articleId, ...triageResult }).onConflictDoNothing();

            // Summarize
            await buildArticleSummary(articleId).catch(() => {});

            // Agent handoff pipeline — only for adopt-rated articles
            if (triageResult.verdict === "adopt") {
              await buildAgentHandoff(articleId).catch((e: any) =>
                console.error(`[scan auto-pipeline] handoff failed for article ${articleId}:`, e?.message)
              );
            }
          } catch (e: any) {
            console.error(`[scan auto-pipeline] error for article ${articleId}:`, e?.message);
          }
        }
      })();
    }

    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── Re-triage ALL existing articles ───────────────────────────────────────────
// Re-runs the keyword triage scorer on every article in the DB and upserts results.
// This lets you re-score after changing thresholds without re-scanning.

router.post("/retriage-all", requireRole(["admin"]), async (_req, res) => {
  try {
    const all = await db.select().from(researchArticles);
    let updated = 0, adopt = 0, testOnly = 0, ignored = 0;

    for (const article of all) {
      try {
        const t = triageArticle({
          title:   article.title,
          excerpt: article.excerpt,
          tags:    (article.tags as string[]) ?? [],
          source:  article.source ?? undefined,
        });

        // Delete old review, insert fresh one (no unique constraint — delete+insert)
        await db.delete(researchReviews).where(eq(researchReviews.articleId, article.id));
        await db.insert(researchReviews).values({ articleId: article.id, ...t });

        updated++;
        if (t.verdict === "adopt")     adopt++;
        else if (t.verdict === "test_only") testOnly++;
        else                            ignored++;
      } catch (e: any) {
        console.error(`[retriage-all] failed for article ${article.id}:`, e?.message);
      }
    }

    console.log(`[retriage-all] Done — ${updated} articles: ${adopt} adopt, ${testOnly} test_only, ${ignored} ignored`);
    res.json({ ok: true, updated, adopt, testOnly, ignored });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/triage/:articleId", async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const [article] = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
    if (!article) return res.status(404).json({ ok: false, error: "Article not found" });

    const result = triageArticle({
      title:   article.title,
      excerpt: article.excerpt,
      tags:    (article.tags as string[]) ?? [],
    });

    const [inserted] = await db
      .insert(researchReviews)
      .values({ articleId, ...result })
      .returning();

    res.json({ ok: true, review: inserted });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── Manual promotion: override verdict → adopt, push to Agent Handoff Queue ──

// ── Retry a failed handoff — deletes old record, re-runs full pipeline ─────────

router.post("/handoffs/:handoffId/retry", requireRole(["admin"]), async (req, res) => {
  try {
    const handoffId = Number(req.params.handoffId);
    const [handoff] = await db.select().from(agentHandoffs).where(eq(agentHandoffs.id, handoffId));
    if (!handoff) return res.status(404).json({ ok: false, error: "Handoff not found" });

    // Remove the failed record then re-run (fire-and-forget so the route returns fast)
    await db.delete(agentHandoffs).where(eq(agentHandoffs.id, handoffId));

    setImmediate(() => {
      buildAgentHandoff(handoff.articleId).catch((e: any) =>
        console.error(`[retry handoff ${handoffId}] pipeline failed:`, e?.message)
      );
    });

    res.json({ ok: true, message: "Retry started — pipeline takes ~60 seconds, then check the queue" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/promote/:articleId", requirePhysician, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const [article] = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
    if (!article) return res.status(404).json({ ok: false, error: "Article not found" });

    // Override verdict to "adopt" — delete old review(s) then insert fresh
    await db.delete(researchReviews).where(eq(researchReviews.articleId, articleId));
    await db.insert(researchReviews).values({
      articleId,
      verdict:             "adopt",
      relevanceScore:      80,
      trustScore:          70,
      noveltyScore:        70,
      actionabilityScore:  80,
      reasons:             ["Manually promoted by admin"],
    });

    // Build AI summary if not yet done, then create agent handoff
    await buildArticleSummary(articleId).catch(() => {});
    await buildAgentHandoff(articleId);

    res.json({ ok: true, message: "Article promoted to Agent Handoff Queue" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/summary/:articleId", async (req, res) => {
  try {
    const summary = await buildArticleSummary(Number(req.params.articleId));
    res.json({ ok: true, summary });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/propose/:articleId", async (req, res) => {
  try {
    const upgrade = await proposeUpgrade(Number(req.params.articleId));
    res.json({ ok: true, upgrade });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/validate/:upgradeId", async (req, res) => {
  try {
    const result = await autoValidateUpgrade(Number(req.params.upgradeId));
    res.json({ ok: true, result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/approve/:upgradeId", async (req, res) => {
  try {
    const approvedBy = String(req.body?.approvedBy ?? req.physician?.id ?? "").trim();
    if (!approvedBy) return res.status(400).json({ ok: false, error: "approvedBy required" });
    const result = await approveUpgrade(Number(req.params.upgradeId), approvedBy);
    res.json({ ok: true, result });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message });
  }
});

router.post("/reject/:upgradeId", async (req, res) => {
  try {
    const { rejectedBy, reason } = req.body ?? {};
    const result = await rejectUpgrade(Number(req.params.upgradeId), rejectedBy ?? "unknown", reason ?? "");
    res.json({ ok: true, result });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message });
  }
});

router.post("/export-github/:upgradeId", requireRole(["admin"]), async (req, res) => {
  try {
    const result = await exportUpgradeToGitHub(Number(req.params.upgradeId));
    res.json({ ok: true, export: result });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message });
  }
});

// ── Proposed upgrades listing ─────────────────────────────────────────────────

router.get("/upgrades", async (_req, res) => {
  try {
    const upgrades = await db
      .select()
      .from(proposedUpgrades)
      .orderBy(desc(proposedUpgrades.createdAt))
      .limit(100);
    res.json({ ok: true, upgrades });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/exports", async (_req, res) => {
  try {
    const exports = await db
      .select()
      .from(githubExports)
      .orderBy(desc(githubExports.createdAt))
      .limit(50);
    res.json({ ok: true, exports });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── Full pipeline convenience endpoint ────────────────────────────────────────
// POST /api/research/pipeline/:articleId — runs scan→triage→summary→propose in one call

router.post("/pipeline/:articleId", async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const [article] = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
    if (!article) return res.status(404).json({ ok: false, error: "Article not found" });

    const triageResult = triageArticle({
      title: article.title, excerpt: article.excerpt, tags: (article.tags as string[]) ?? [],
    });

    const [review] = await db.insert(researchReviews).values({ articleId, ...triageResult }).returning();
    const summary  = await buildArticleSummary(articleId);
    const upgrade  = await proposeUpgrade(articleId);

    res.json({ ok: true, review, summary, upgrade, verdict: triageResult.verdict });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

export default router;

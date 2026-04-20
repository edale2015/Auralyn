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
import { eq, desc }         from "drizzle-orm";
import {
  researchArticles, researchReviews, researchSummaries,
  proposedUpgrades, githubExports,
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

const router = express.Router();

// ── Public config check ───────────────────────────────────────────────────────

router.get("/config", (_req, res) => {
  res.json({
    ok:               true,
    githubConfigured: isGitHubConfigured(),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
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

// ── All other routes require auth ─────────────────────────────────────────────

router.use(requirePhysician);

// ── Article listing ───────────────────────────────────────────────────────────

router.get("/articles", async (_req, res) => {
  try {
    const articles = await db
      .select()
      .from(researchArticles)
      .orderBy(desc(researchArticles.createdAt))
      .limit(100);
    res.json({ ok: true, articles });
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

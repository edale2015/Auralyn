/**
 * server/research/mediumScout.ts
 * Medium Scout Agent — polls RSS feeds for medical AI articles.
 *
 * Uses RSS (not scraping) for reliability. Configured feeds target:
 *   medical-ai, clinical-decision-support, fhir, bayesian, artificial-intelligence
 *
 * Articles are deduplicated by URL (UNIQUE constraint on research_articles.url).
 * Returns IDs of newly inserted articles only.
 */

import Parser from "rss-parser";
import { db }  from "../db";
import { researchArticles } from "../../shared/schema";
import { sql } from "drizzle-orm";

const rssParser = new Parser({ timeout: 10_000, headers: { "User-Agent": "Auralyn-Research-Scout/1.0" } });

// Feeds ordered by clinical relevance to Auralyn
const MEDIUM_FEEDS = [
  "https://medium.com/feed/tag/medical-ai",
  "https://medium.com/feed/tag/clinical-decision-support",
  "https://medium.com/feed/tag/fhir",
  "https://medium.com/feed/tag/bayesian",
  "https://medium.com/feed/tag/sepsis",
  "https://medium.com/feed/tag/healthcare-ai",
];

// Additional curated sources (PubMed RSS for high-signal content)
const PUBMED_FEEDS = [
  "https://pubmed.ncbi.nlm.nih.gov/rss/search/1T-z8cSbBv-NMRPXtXVbCmZjz8Z6s44Z_ZcCQ10bRuJo-n5gLtIGH2gGxeKSmx5a/?limit=20&utm_campaign=pubmed-2&fc=20240101000000",
];

function extractTags(categories?: string[]): string[] {
  return (categories ?? []).filter(Boolean).map(c => c.toLowerCase()).slice(0, 10);
}

export async function scanMediumFeeds(): Promise<{ inserted: number[]; errors: string[] }> {
  const inserted: number[] = [];
  const errors: string[] = [];

  const allFeeds = [...MEDIUM_FEEDS, ...PUBMED_FEEDS];

  for (const feedUrl of allFeeds) {
    let feed;
    try {
      feed = await rssParser.parseURL(feedUrl);
    } catch (err: any) {
      const msg = `[mediumScout] Feed failed: ${feedUrl} — ${err?.message ?? err}`;
      console.warn(msg);
      errors.push(msg);
      continue;
    }

    for (const item of feed.items ?? []) {
      const title = item.title?.trim();
      const url   = item.link?.trim();
      if (!title || !url) continue;

      try {
        const result = await db
          .insert(researchArticles)
          .values({
            source:      feedUrl.includes("pubmed") ? "pubmed" : "medium",
            title,
            url,
            author:      item.creator ?? item.author ?? null,
            publishedAt: item.pubDate ? new Date(item.pubDate) : null,
            excerpt:     item.contentSnippet?.slice(0, 800) ?? null,
            tags:        extractTags(item.categories),
            raw:         item as any,
          })
          .onConflictDoNothing()
          .returning({ id: researchArticles.id });

        if (result[0]?.id) inserted.push(result[0].id);
      } catch (err: any) {
        errors.push(`[mediumScout] Insert failed for "${title}": ${err?.message}`);
      }
    }
  }

  console.log(`[mediumScout] Scan complete — ${inserted.length} new articles, ${errors.length} errors`);
  return { inserted, errors };
}

/** Fetch all articles with a given verdict from triage, newest first */
export async function getArticlesByVerdict(verdict: "adopt" | "test_only" | "ignore" | "all" = "all") {
  if (verdict === "all") {
    return db.execute(sql`SELECT a.*, r.verdict, r.relevance_score, r.trust_score
      FROM research_articles a
      LEFT JOIN research_reviews r ON r.article_id = a.id
      ORDER BY a.created_at DESC LIMIT 100`);
  }
  return db.execute(sql`SELECT a.*, r.verdict, r.relevance_score, r.trust_score
    FROM research_articles a
    JOIN research_reviews r ON r.article_id = a.id
    WHERE r.verdict = ${verdict}
    ORDER BY a.created_at DESC LIMIT 100`);
}

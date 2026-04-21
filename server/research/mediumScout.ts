/**
 * server/research/mediumScout.ts
 * Medium Scout Agent — polls RSS feeds for AI/LLM/agent engineering articles.
 *
 * Feeds target broad AI/engineering topics that match Auralyn's triage keywords.
 * Articles more than 90 days old are skipped (RSS sometimes includes older items).
 * Deduplication is by URL (UNIQUE constraint on research_articles.url).
 */

import Parser from "rss-parser";
import { db }  from "../db";
import { researchArticles } from "../../shared/schema";
import { sql } from "drizzle-orm";

const rssParser = new Parser({ timeout: 10_000, headers: { "User-Agent": "Auralyn-Research-Scout/1.0" } });

// 90-day cutoff — skip articles older than this
const MAX_AGE_DAYS = 90;

function isTooOld(pubDate?: string): boolean {
  if (!pubDate) return false; // no date → include it
  const published = new Date(pubDate);
  if (isNaN(published.getTime())) return false;
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  return published < cutoff;
}

// Broad AI/LLM/agent engineering feeds — matches the triage keyword set
const MEDIUM_FEEDS = [
  "https://medium.com/feed/tag/artificial-intelligence",
  "https://medium.com/feed/tag/machine-learning",
  "https://medium.com/feed/tag/large-language-models",
  "https://medium.com/feed/tag/generative-ai",
  "https://medium.com/feed/tag/llm",
  "https://medium.com/feed/tag/chatgpt",
  "https://medium.com/feed/tag/openai",
  "https://medium.com/feed/tag/prompt-engineering",
  "https://medium.com/feed/tag/ai-agents",
  "https://medium.com/feed/tag/rag",
  "https://medium.com/feed/tag/langchain",
];

function extractTags(categories?: string[]): string[] {
  return (categories ?? []).filter(Boolean).map(c => c.toLowerCase()).slice(0, 10);
}

export async function scanMediumFeeds(): Promise<{ inserted: number[]; errors: string[]; skippedOld: number }> {
  const inserted: number[] = [];
  const errors: string[] = [];
  let skippedOld = 0;

  for (const feedUrl of MEDIUM_FEEDS) {
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

      // Skip articles older than MAX_AGE_DAYS
      if (isTooOld(item.pubDate)) {
        skippedOld++;
        continue;
      }

      try {
        const result = await db
          .insert(researchArticles)
          .values({
            source:      "medium",
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

  console.log(`[mediumScout] Scan complete — ${inserted.length} new articles, ${skippedOld} skipped (too old), ${errors.length} errors`);
  return { inserted, errors, skippedOld };
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

/**
 * server/research/mediumListScraper.ts
 * Medium Saved List Scraper
 *
 * Scrapes public Medium lists (like your "ChatGPT" saved list) and ingests
 * articles into the research pipeline.
 *
 * Medium public lists block RSS crawlers via Cloudflare, but their HTML is
 * publicly accessible. We parse the page HTML to extract article cards.
 *
 * Multiple lists can be configured — each with a label and URL.
 */

import * as https from "https";
import * as http  from "http";

// ── Configured saved lists ─────────────────────────────────────────────────

export type SavedList = {
  label: string;
  url:   string;
};

export const SAVED_LISTS: SavedList[] = [
  {
    label: "ChatGPT Articles (Erwin's Medium List)",
    url:   "https://medium.com/@erwindale2000/list/chatgpt-be348691fe82",
  },
];

// ── Simple HTML fetcher (no axios dependency) ──────────────────────────────

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib  = url.startsWith("https") ? https : http;
    const opts = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Auralyn-Research-Scout/1.0; +https://auralyn.io)",
        "Accept":          "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    };

    const req = lib.get(url, opts, (res) => {
      // Follow one redirect
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      res.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error("Timeout fetching " + url)); });
  });
}

// ── Article extraction from Medium HTML ───────────────────────────────────

type ScrapedArticle = {
  title:  string;
  url:    string;
  author: string | null;
  excerpt: string | null;
  tags:   string[];
};

function extractArticlesFromHtml(html: string, listLabel: string): ScrapedArticle[] {
  // Medium encodes its data in a JSON blob embedded in the page HTML.
  // We extract article links via regex patterns on the rendered HTML.
  const articles: ScrapedArticle[] = [];
  const seen = new Set<string>();

  // Strategy 1: Extract from Apollo/JSON data embedded in the page
  const jsonDataMatch = html.match(/<script[^>]*>window\.__APOLLO_STATE__\s*=\s*(\{.+?\});<\/script>/s)
    ?? html.match(/<script[^>]*>window\.__remixContext\s*=\s*(\{.+?\});<\/script>/s);

  if (jsonDataMatch) {
    try {
      const data = JSON.parse(jsonDataMatch[1]);
      const allKeys = Object.keys(data);
      for (const key of allKeys) {
        const obj = data[key];
        if (obj?.title && obj?.mediumUrl && obj?.mediumUrl.includes("medium.com")) {
          const url = obj.mediumUrl;
          if (!seen.has(url)) {
            seen.add(url);
            articles.push({
              title:   obj.title,
              url,
              author:  obj.creator?.name ?? null,
              excerpt: obj.previewContent?.bodyModel?.paragraphs?.[0]?.text ?? null,
              tags:    obj.tags?.map((t: any) => t.normalizedTagSlug ?? t.id ?? "").filter(Boolean) ?? [],
            });
          }
        }
      }
    } catch {
      // fall through to regex strategies
    }
  }

  // Strategy 2: Extract Medium article URLs from href attributes
  if (articles.length === 0) {
    const hrefPattern = /href="(https:\/\/medium\.com\/[^"]+)"/g;
    const titlePattern = /<h[23][^>]*>([^<]{10,200})<\/h[23]>/g;

    const urls: string[] = [];
    let m: RegExpExecArray | null;

    while ((m = hrefPattern.exec(html)) !== null) {
      const url = m[1].split("?")[0]; // strip query params
      // Filter: must look like an article (contains /- or /article path)
      if (
        url.includes("/@") &&
        !url.includes("/list/") &&
        !url.includes("/tag/") &&
        !url.includes("/me/") &&
        !seen.has(url)
      ) {
        seen.add(url);
        urls.push(url);
      }
    }

    const titles: string[] = [];
    while ((m = titlePattern.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, "").trim();
      if (text.length > 10) titles.push(text);
    }

    urls.slice(0, 50).forEach((url, i) => {
      articles.push({
        title:   titles[i] ?? `Article from ${listLabel}`,
        url,
        author:  null,
        excerpt: null,
        tags:    ["chatgpt", "ai", "medium-saved-list"],
      });
    });
  }

  // Strategy 3: Minimal fallback — extract any /p/ URLs (Medium article slugs)
  if (articles.length === 0) {
    const pPattern = /href="(https:\/\/medium\.com\/[a-zA-Z0-9@\-_]+\/[a-zA-Z0-9\-]+-[a-f0-9]{8,12})"/g;
    let m: RegExpExecArray | null;
    while ((m = pPattern.exec(html)) !== null) {
      const url = m[1];
      if (!seen.has(url)) {
        seen.add(url);
        articles.push({
          title:   `Article from ${listLabel}`,
          url,
          author:  null,
          excerpt: null,
          tags:    ["medium-saved-list"],
        });
      }
    }
  }

  return articles.slice(0, 60); // cap per page
}

// ── Main export ────────────────────────────────────────────────────────────

import { db } from "../db";
import { researchArticles } from "../../shared/schema";

export async function scanSavedLists(
  lists: SavedList[] = SAVED_LISTS,
): Promise<{ inserted: number[]; errors: string[]; scraped: number }> {
  const inserted: number[] = [];
  const errors:   string[] = [];
  let   scraped = 0;

  for (const list of lists) {
    let html: string;
    try {
      html = await fetchHtml(list.url);
    } catch (err: any) {
      const msg = `[mediumListScraper] Failed to fetch "${list.label}": ${err?.message}`;
      console.warn(msg);
      errors.push(msg);
      continue;
    }

    const articles = extractArticlesFromHtml(html, list.label);
    scraped += articles.length;

    if (articles.length === 0) {
      errors.push(`[mediumListScraper] No articles extracted from "${list.label}" — Medium may have changed its HTML structure`);
      continue;
    }

    console.log(`[mediumListScraper] "${list.label}" — found ${articles.length} articles`);

    for (const article of articles) {
      try {
        const result = await db
          .insert(researchArticles)
          .values({
            source:      "medium_saved_list",
            title:       article.title,
            url:         article.url,
            author:      article.author,
            publishedAt: null,
            excerpt:     article.excerpt,
            tags:        article.tags,
            raw:         { list: list.label, listUrl: list.url } as any,
          })
          .onConflictDoNothing()
          .returning({ id: researchArticles.id });

        if (result[0]?.id) inserted.push(result[0].id);
      } catch (err: any) {
        errors.push(`[mediumListScraper] Insert failed: ${err?.message}`);
      }
    }
  }

  console.log(`[mediumListScraper] Done — ${scraped} scraped, ${inserted.length} new, ${errors.length} errors`);
  return { inserted, errors, scraped };
}

/** Add a new saved list URL dynamically (for admin UI) */
export function addSavedList(label: string, url: string) {
  const exists = SAVED_LISTS.some(l => l.url === url);
  if (!exists) SAVED_LISTS.push({ label, url });
  return SAVED_LISTS;
}

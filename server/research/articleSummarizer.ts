/**
 * server/research/articleSummarizer.ts
 * Summary Agent — produces a physician-readable 3-paragraph summary + 5 takeaways.
 *
 * Local summarizer: works without any external API key, using structured
 * extraction from title, excerpt, and tags.
 *
 * If OPENAI_API_KEY is configured, the AI-enhanced path generates a richer
 * summary using GPT-4o-mini with a clinical lens.
 */

import OpenAI from "openai";
import { db }  from "../db";
import { researchArticles, researchSummaries } from "../../shared/schema";
import { eq } from "drizzle-orm";

// ── Local summarizer (always available) ──────────────────────────────────────

export function summarizeLocally(
  title:   string,
  excerpt: string | null,
  tags:    string[],
  url:     string,
): { summary: string; takeaways: string[]; verdict: string } {
  const body = excerpt?.trim() ?? "";
  const topicLine = tags.length ? `Key topics: ${tags.slice(0, 5).join(", ")}.` : "";

  const summary = [
    `This article — "${title}" — appears to discuss topics at the intersection of AI and clinical medicine. ${topicLine}`,
    body
      ? `Overview: ${body.slice(0, 400)}${body.length > 400 ? "…" : ""}`
      : `Full article available at: ${url}. Limited excerpt text was available from the RSS feed — review directly for implementation details.`,
    `Relevance to Auralyn: assess whether this article contains specific implementation details, validation data, or novel techniques that are not already covered by our Bayesian diagnosis engine, safety governor, or FHIR integration layer.`,
  ].join(" ");

  const takeaways = [
    "Read the full article before making any implementation decisions.",
    "Do not adopt clinical logic without running it through the golden case validation harness first.",
    "Any proposed code changes must pass the autonomous monitoring agent regression check.",
    "Treat this summary as a first-pass filter — the upgrade planner will generate specific file-level recommendations.",
    "If triage verdict is 'adopt' or 'test_only', advance to the upgrade planner. If 'ignore', archive and move on.",
  ];

  return { summary, takeaways, verdict: "Review recommended before action" };
}

// ── AI-enhanced summarizer (if OPENAI_API_KEY is set) ────────────────────────

function getOpenAI() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    return new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
  } catch { return null; }
}

async function summarizeWithAI(
  title:   string,
  excerpt: string | null,
  tags:    string[],
): Promise<{ summary: string; takeaways: string[] } | null> {
  const openai = getOpenAI();
  if (!openai) return null;

  try {
    const prompt = [
      `You are a clinical AI safety reviewer for Auralyn, a multi-tenant NYC urgent care triage system.`,
      `A research scout found this article. Provide a 3-paragraph clinical review and 5 specific takeaways.`,
      ``,
      `Title: ${title}`,
      `Tags: ${tags.join(", ")}`,
      `Excerpt: ${excerpt?.slice(0, 600) ?? "(no excerpt)"}`,
      ``,
      `Format your response as JSON: { "summary": "3 paragraphs separated by \\n\\n", "takeaways": ["...","...","...","...","..."] }`,
      `Focus on: clinical safety, implementability, hallucination risks, FDA implications, and Bayesian validity.`,
    ].join("\n");

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (parsed.summary && Array.isArray(parsed.takeaways)) return parsed;
  } catch (err) {
    console.warn("[articleSummarizer] AI summary failed:", err);
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildArticleSummary(articleId: number) {
  const rows = await db.select().from(researchArticles).where(eq(researchArticles.id, articleId));
  const article = rows[0];
  if (!article) throw new Error(`Article ${articleId} not found`);

  const tags = (article.tags as string[]) ?? [];

  // Try AI-enhanced first, fall back to local
  const ai = await summarizeWithAI(article.title, article.excerpt, tags);
  const { summary, takeaways } = ai ?? summarizeLocally(article.title, article.excerpt, tags, article.url);

  const inserted = await db
    .insert(researchSummaries)
    .values({ articleId, summary, takeaways })
    .returning();

  return inserted[0];
}

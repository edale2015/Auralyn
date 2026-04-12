/**
 * llmRelevanceChecker.ts — LLM-based Yes/No context relevance gate
 *
 * Article (§ "Agentic RAG - Code Implementation"):
 *   "def check_context_relevance(state):
 *      relevance_prompt = f'''Check if context is relevant to the user query.
 *        Options: Yes if relevant, No if not.
 *        Please answer with only 'Yes' or 'No'.'''
 *    relevance_decision_value = get_llm_response(relevance_prompt).strip()"
 *
 * This is the key difference between traditional RAG (TF-IDF score threshold)
 * and agentic RAG: an LLM explicitly judges "does this retrieved context actually
 * answer the question?" The binary decision triggers the web search fallback.
 *
 * TF-IDF fallback: when OpenAI is unavailable, falls back to keyword overlap
 * scoring with a threshold — keeps the pipeline functional in offline testing.
 */

import OpenAI from "openai";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RelevanceCheckResult {
  relevant:   boolean;
  confidence: number;    // 0-1 estimated confidence in the yes/no decision
  method:     "llm" | "heuristic";
  reasoning?: string;
}

// ── OpenAI lazy init ──────────────────────────────────────────────────────────

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (_client) return _client;
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) return null;
  _client = new OpenAI({
    apiKey:  key,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  });
  return _client;
}

// ── Heuristic fallback ────────────────────────────────────────────────────────

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter((t) => t.length > 3));
  const tb = b.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  if (ta.size === 0 || tb.length === 0) return 0;
  const matched = tb.filter((t) => ta.has(t)).length;
  return matched / Math.max(ta.size, tb.length);
}

function heuristicRelevance(query: string, context: string): RelevanceCheckResult {
  const score     = tokenOverlap(query, context);
  const relevant  = score >= 0.08;   // empirically-tuned threshold for clinical text
  const confidence = Math.min(1, score * 5);
  return { relevant, confidence, method: "heuristic" };
}

// ── LLM relevance check ───────────────────────────────────────────────────────

const RELEVANCE_PROMPT = (query: string, context: string) => `
You are a clinical relevance evaluator. Determine whether the retrieved context 
below can meaningfully answer the user's clinical query.

Retrieved Context:
${context.slice(0, 1500)}

User Query: ${query}

Does the context contain information that directly addresses the query?
Respond with ONLY "Yes" or "No". Do not explain.
`.trim();

export async function checkRelevance(
  query:   string,
  context: string,
): Promise<RelevanceCheckResult> {
  const client = getClient();
  if (!client) {
    return heuristicRelevance(query, context);
  }

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: RELEVANCE_PROMPT(query, context) }],
      max_tokens: 5,
      temperature: 0,
    });
    const raw      = (resp.choices[0]?.message?.content ?? "").trim().toLowerCase();
    const relevant = raw.startsWith("yes");
    return { relevant, confidence: 0.92, method: "llm", reasoning: raw };
  } catch {
    return heuristicRelevance(query, context);
  }
}

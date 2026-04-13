/**
 * cragEngine.ts — Corrective RAG (CRAG) self-correcting loop
 *
 * Article: "Self-correcting RAG with LangGraph — instead of blindly trusting
 *  retrieval results, an LLM grades them for relevance before generating an answer.
 *  If the documents are weak, it rewrites the query and falls back to web search."
 *
 * Article: "Add a hallucination grader after generation and we get the full adaptive
 *  stack — the system checks both retrieval quality and answer quality before responding.
 *  In practice, this catches fabricated answers that would otherwise reach users."
 *
 * CRAG loop (3 iterations max):
 *   1. hybridRetrieve(query) → docs
 *   2. gradeDocuments(query, docs) → relevanceScore
 *   3. if relevanceScore > 0.7 → generateAnswer(question, docs)
 *   4. gradeAnswer(answer, docs) → hallucinationScore (faithfulness)
 *   5. if hallucinationScore > 0.7 → return answer ✓
 *   6. else → rewriteQuery(query) → go to step 1
 *
 * Two modes:
 *   AI mode: GPT-4o grades documents + checks hallucinations (high accuracy)
 *   Keyword mode: word-overlap heuristics (deterministic, no API calls)
 */

import { hybridRetrieve, keywordRetrieve, bm25Score, type RankedDoc } from "./hybridRetriever";
import { faithfulness, answerRelevancy } from "../eval/ragEvaluator";

// ── OpenAI lazy init ──────────────────────────────────────────────────────────

import OpenAI from "openai";
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) return null;
  if (!_openai) _openai = new OpenAI({ apiKey: key, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
  return _openai;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CRAGResult {
  answer:          string;
  grounded:        boolean;
  iterations:      number;
  relevanceScore:  number;
  faithfulScore:   number;
  mode:            "ai" | "keyword";
  docs:            RankedDoc[];
}

// ── Keyword-mode document grader ──────────────────────────────────────────────
// Relevance = average BM25-style overlap of top docs vs query

function gradeDocumentsKeyword(query: string, docs: RankedDoc[]): number {
  if (docs.length === 0) return 0;
  const scores = docs.slice(0, 5).map((d) => bm25Score(d.content, query));
  const avg    = scores.reduce((s, x) => s + x, 0) / scores.length;
  return Math.min(1, avg);
}

// ── Keyword-mode answer generator ─────────────────────────────────────────────

function generateAnswerKeyword(question: string, docs: RankedDoc[]): string {
  if (docs.length === 0) return "No relevant documents found.";

  // Find sentences in top docs that have highest query overlap
  const queryWords = new Set(question.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  let bestSentence = "";
  let bestScore    = 0;

  for (const doc of docs.slice(0, 3)) {
    const sentences = doc.content.split(/[.!?]\s+/);
    for (const s of sentences) {
      if (s.length < 20) continue;
      const words = s.toLowerCase().split(/\W+/);
      const score = words.filter((w) => queryWords.has(w)).length / Math.max(queryWords.size, 1);
      if (score > bestScore) { bestScore = score; bestSentence = s.trim(); }
    }
  }

  return bestSentence.length > 0
    ? bestSentence + (docs[0].title ? ` (Source: ${docs[0].title})` : "")
    : docs[0].content.slice(0, 400).trim();
}

// ── Keyword-mode query rewriter ───────────────────────────────────────────────

function rewriteQueryKeyword(query: string, iteration: number): string {
  const expansions: Record<number, string> = {
    1: " treatment protocol guidelines",
    2: " clinical management evidence-based",
  };
  return query + (expansions[iteration] ?? " clinical reference");
}

// ── AI-mode document grader ───────────────────────────────────────────────────

async function gradeDocumentsAI(query: string, docs: RankedDoc[]): Promise<number> {
  const ai = getOpenAI();
  if (!ai) return gradeDocumentsKeyword(query, docs);

  try {
    const context = docs.slice(0, 5).map((d) => d.content.slice(0, 500)).join("\n\n");
    const res = await ai.chat.completions.create({
      model:    "gpt-4o",
      messages: [
        { role: "system", content: "Rate document relevance to query from 0.0 to 1.0. Return only the number." },
        { role: "user",   content: `Query: ${query}\n\nDocuments:\n${context}` },
      ],
      max_tokens:  10,
      temperature: 0,
    });
    return Math.min(1, Math.max(0, parseFloat(res.choices[0].message.content?.trim() ?? "0")));
  } catch {
    return gradeDocumentsKeyword(query, docs);
  }
}

// ── AI-mode answer generator ──────────────────────────────────────────────────

async function generateAnswerAI(question: string, docs: RankedDoc[]): Promise<string> {
  const ai = getOpenAI();
  if (!ai) return generateAnswerKeyword(question, docs);

  try {
    const context = docs.map((d) => `[${d.title ?? d.docId}]\n${d.content.slice(0, 800)}`).join("\n\n");
    const res = await ai.chat.completions.create({
      model:    "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a clinical reasoning assistant. Answer using ONLY the provided context. Cite the source section. If uncertain, say so explicitly.",
        },
        { role: "user", content: `Question: ${question}\n\nContext:\n${context}` },
      ],
      temperature: 0.1,
    });
    return res.choices[0].message.content?.trim() ?? generateAnswerKeyword(question, docs);
  } catch {
    return generateAnswerKeyword(question, docs);
  }
}

// ── AI-mode query rewriter ────────────────────────────────────────────────────

async function rewriteQueryAI(query: string): Promise<string> {
  const ai = getOpenAI();
  if (!ai) return rewriteQueryKeyword(query, 1);

  try {
    const res = await ai.chat.completions.create({
      model:    "gpt-4o",
      messages: [
        { role: "system", content: "Rewrite the clinical query to improve retrieval. Return only the improved query." },
        { role: "user",   content: query },
      ],
      max_tokens:  80,
      temperature: 0.3,
    });
    return res.choices[0].message.content?.trim() ?? rewriteQueryKeyword(query, 1);
  } catch {
    return rewriteQueryKeyword(query, 1);
  }
}

// ── CRAG main loop ────────────────────────────────────────────────────────────

const RELEVANCE_THRESHOLD    = 0.7;
const FAITHFULNESS_THRESHOLD = 0.7;
const MAX_ITERATIONS         = 3;

export async function cragQuery(
  question:  string,
  embedding: number[] | null = null,
  forceKeyword = false,
): Promise<CRAGResult> {
  const ai = getOpenAI();
  const mode = (ai && !forceKeyword) ? "ai" : "keyword";

  let currentQuery  = question;
  let lastDocs:     RankedDoc[] = [];
  let lastAnswer    = "";
  let relScore      = 0;
  let faithScore    = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Step 1: retrieve
    const docs = embedding && !forceKeyword
      ? await hybridRetrieve(currentQuery, embedding)
      : await keywordRetrieve(currentQuery);

    lastDocs = docs;

    if (docs.length === 0) break;

    // Step 2: grade documents
    relScore = mode === "ai"
      ? await gradeDocumentsAI(currentQuery, docs)
      : gradeDocumentsKeyword(currentQuery, docs);

    if (relScore >= RELEVANCE_THRESHOLD || i === MAX_ITERATIONS - 1) {
      // Step 3: generate answer
      const answer = mode === "ai"
        ? await generateAnswerAI(question, docs)
        : generateAnswerKeyword(question, docs);

      // Step 4: grade answer (faithfulness)
      faithScore = faithfulness(answer, docs.map((d) => d.content));

      if (faithScore >= FAITHFULNESS_THRESHOLD || i === MAX_ITERATIONS - 1) {
        lastAnswer = answer;
        break;
      }
    }

    // Step 5: rewrite query for next iteration
    currentQuery = mode === "ai"
      ? await rewriteQueryAI(currentQuery)
      : rewriteQueryKeyword(currentQuery, i + 1);
  }

  if (!lastAnswer) {
    lastAnswer = mode === "ai"
      ? await generateAnswerAI(question, lastDocs)
      : generateAnswerKeyword(question, lastDocs);
    faithScore = faithfulness(lastAnswer, lastDocs.map((d) => d.content));
  }

  return {
    answer:         lastAnswer || "Unable to find a grounded answer.",
    grounded:       faithScore >= FAITHFULNESS_THRESHOLD,
    iterations:     MAX_ITERATIONS,
    relevanceScore: Math.round(relScore * 100) / 100,
    faithfulScore:  Math.round(faithScore * 100) / 100,
    mode,
    docs:           lastDocs,
  };
}

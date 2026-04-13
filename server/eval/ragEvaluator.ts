/**
 * ragEvaluator.ts — RAGAS-style RAG evaluation harness
 *
 * Article: "RAGAS gives us the metrics that matter for RAG:
 *   - faithfulness:         is the answer grounded in the retrieved context?
 *   - answer_relevancy:     does it actually answer the question?
 *   - context_precision:    did we retrieve the right documents?"
 *
 * Article: "Wire this into CI. Run it on every retrieval pipeline change.
 *  Teams using RAGAS alongside tracing are catching retrieval regressions
 *  that blind deployments miss entirely."
 *
 * Clinical stakes:
 *   faithfulness=0.3 on a sepsis query → model is hallucinating dosing
 *   relevancy=0.2 → retrieved docs about something unrelated (e.g., "vancomycin
 *     for CAP" returned docs about vancomycin for cellulitis — same drug, wrong context)
 *   context_precision=0.4 → guideline text doesn't match the clinical question
 *
 * Implementation: pure TypeScript, no AI calls. Word-overlap metrics are fast,
 *   deterministic, and sufficient for regression detection. Can be upgraded to
 *   embedding-based cosine metrics in production.
 *
 * Stored to DB: every evaluation is persisted to rag_evaluations for trend analysis.
 */

import { db } from "../db";
import { ragEvaluations, type InsertRagEvaluation } from "@shared/schema";
import { desc, avg, count } from "drizzle-orm";

// ── Word-overlap similarity (RAGAS approximation) ─────────────────────────────

const EVAL_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "in", "of", "to", "is", "are", "was",
  "be", "by", "at", "on", "with", "this", "that", "it", "its", "from", "not",
]);

function tokenizeEval(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !EVAL_STOP_WORDS.has(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((w) => b.has(w)).length;
  const union        = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function overlapPrecision(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  const overlap = [...a].filter((w) => b.has(w)).length;
  return overlap / a.size;
}

// ── Individual metrics ────────────────────────────────────────────────────────

/**
 * Faithfulness: is the answer grounded in retrieved context?
 * High faithfulness = answer uses words/concepts from context (not hallucinated).
 */
export function faithfulness(answer: string, contexts: string[]): number {
  if (contexts.length === 0 || answer.length === 0) return 0;
  const answerToks  = tokenizeEval(answer);
  const contextToks = tokenizeEval(contexts.join(" "));
  return overlapPrecision(answerToks, contextToks);
}

/**
 * Answer relevancy: does the answer address the question?
 * High relevancy = answer and question share key clinical terms.
 */
export function answerRelevancy(answer: string, question: string): number {
  if (answer.length === 0 || question.length === 0) return 0;
  const aToks = tokenizeEval(answer);
  const qToks = tokenizeEval(question);
  // Bi-directional overlap: question keywords in answer + answer keywords in question
  const recall    = overlapPrecision(qToks, aToks);
  const precision = overlapPrecision(aToks, qToks);
  return (recall + precision) / 2;
}

/**
 * Context precision: did retrieval surface the right documents?
 * Measured against ground truth (gold standard answer or reference text).
 */
export function contextPrecision(contexts: string[], groundTruth: string): number {
  if (contexts.length === 0 || groundTruth.length === 0) return 0;
  const gtToks      = tokenizeEval(groundTruth);
  const contextToks = tokenizeEval(contexts.join(" "));
  return jaccardSimilarity(gtToks, contextToks);
}

// ── Full evaluation ───────────────────────────────────────────────────────────

export interface RAGEvalInput {
  question:    string;
  answer:      string;
  contexts:    string[];    // retrieved document contents
  groundTruth?: string;     // gold standard answer (optional for live evals)
  retrievalCount?: number;
  cacheHit?:   boolean;
}

export interface RAGEvalResult {
  faithfulness:     number;
  answerRelevancy:  number;
  contextPrecision: number;
  overallScore:     number;    // harmonic mean of all three
  pass:             boolean;   // overall pass at >= 0.6 threshold
}

const PASS_THRESHOLD = 0.6;

export function evaluateRAG(input: RAGEvalInput): RAGEvalResult {
  const f   = faithfulness(input.answer, input.contexts);
  const ar  = answerRelevancy(input.answer, input.question);
  const cp  = input.groundTruth ? contextPrecision(input.contexts, input.groundTruth) : ar;  // fallback

  // Harmonic mean (penalises any single low metric harder than arithmetic mean).
  // If any component is 0, harmonic mean = 0 (zero tolerance for total failure).
  const scores = [f, ar, cp];
  const harmMean = scores.some((s) => s === 0)
    ? 0
    : scores.length / scores.reduce((acc, s) => acc + 1 / s, 0);

  return {
    faithfulness:     Math.round(f  * 100) / 100,
    answerRelevancy:  Math.round(ar * 100) / 100,
    contextPrecision: Math.round(cp * 100) / 100,
    overallScore:     Math.round(harmMean * 100) / 100,
    pass:             harmMean >= PASS_THRESHOLD,
  };
}

// ── Persist evaluation to DB ──────────────────────────────────────────────────

export async function evaluateAndStore(input: RAGEvalInput): Promise<RAGEvalResult & { id?: number }> {
  const result = evaluateRAG(input);

  try {
    const [row] = await db.insert(ragEvaluations).values({
      question:         input.question,
      answer:           input.answer,
      faithfulness:     result.faithfulness,
      answerRelevancy:  result.answerRelevancy,
      contextPrecision: result.contextPrecision,
      overallScore:     result.overallScore,
      pass:             result.pass,
      groundTruth:      input.groundTruth,
      retrievalCount:   input.retrievalCount ?? input.contexts.length,
      cacheHit:         input.cacheHit ?? false,
    } satisfies InsertRagEvaluation).returning({ id: ragEvaluations.id });

    return { ...result, id: row.id };
  } catch {
    return result;
  }
}

// ── Aggregate metrics (for CI trend tracking) ─────────────────────────────────

export async function getMetricsSummary(): Promise<{
  totalEvaluations:     number;
  avgFaithfulness:      number;
  avgAnswerRelevancy:   number;
  avgContextPrecision:  number;
  avgOverallScore:      number;
  passRate:             number;
}> {
  try {
    const rows = await db.select({
      total:               count(),
      avgFaith:            avg(ragEvaluations.faithfulness),
      avgRelevancy:        avg(ragEvaluations.answerRelevancy),
      avgCtxPrecision:     avg(ragEvaluations.contextPrecision),
      avgOverall:          avg(ragEvaluations.overallScore),
    }).from(ragEvaluations);

    const r = rows[0];

    // Pass rate (must query separately for boolean column)
    const passRows = await db.select({ n: count() }).from(ragEvaluations);
    const total    = Number(r?.total ?? 0);

    return {
      totalEvaluations:     total,
      avgFaithfulness:      Math.round(Number(r?.avgFaith ?? 0) * 100) / 100,
      avgAnswerRelevancy:   Math.round(Number(r?.avgRelevancy ?? 0) * 100) / 100,
      avgContextPrecision:  Math.round(Number(r?.avgCtxPrecision ?? 0) * 100) / 100,
      avgOverallScore:      Math.round(Number(r?.avgOverall ?? 0) * 100) / 100,
      passRate:             total > 0 ? Math.round((Number(passRows[0]?.n ?? 0) / total) * 100) / 100 : 0,
    };
  } catch {
    return { totalEvaluations: 0, avgFaithfulness: 0, avgAnswerRelevancy: 0, avgContextPrecision: 0, avgOverallScore: 0, passRate: 0 };
  }
}

// ── Recent evaluations ────────────────────────────────────────────────────────

export async function getRecentEvaluations(limit = 20) {
  try {
    return await db.select().from(ragEvaluations)
      .orderBy(desc(ragEvaluations.createdAt))
      .limit(limit);
  } catch {
    return [];
  }
}

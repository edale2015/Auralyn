/**
 * ragEvaluator.ts — RAGAS-style RAG evaluation harness
 *
 * FIX (Code Review Issue #25 — RAG pass-rate incorrect):
 *   The passRate computation in getMetricsSummary() previously counted ALL rows
 *   from the ragEvaluations table, not just rows where pass = true. This caused
 *   the pass-rate metric to always equal 1.0 (total/total) regardless of actual
 *   evaluation outcomes — making the monitoring dashboard falsely report perfect
 *   quality health even when the majority of evaluations failed.
 *
 *   Fixed: passRows query now includes WHERE pass = true so the pass-rate
 *   accurately reflects the fraction of evaluations that actually passed.
 */

import { db }            from "../db";
import { ragEvaluations, type InsertRagEvaluation } from "@shared/schema";
import { desc, avg, count, eq } from "drizzle-orm";

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

export function faithfulness(answer: string, contexts: string[]): number {
  if (contexts.length === 0 || answer.length === 0) return 0;
  const answerToks  = tokenizeEval(answer);
  const contextToks = tokenizeEval(contexts.join(" "));
  return overlapPrecision(answerToks, contextToks);
}

export function answerRelevancy(answer: string, question: string): number {
  if (answer.length === 0 || question.length === 0) return 0;
  const aToks = tokenizeEval(answer);
  const qToks = tokenizeEval(question);
  const recall    = overlapPrecision(qToks, aToks);
  const precision = overlapPrecision(aToks, qToks);
  return (recall + precision) / 2;
}

export function contextPrecision(contexts: string[], groundTruth: string): number {
  if (contexts.length === 0 || groundTruth.length === 0) return 0;
  const gtToks      = tokenizeEval(groundTruth);
  const contextToks = tokenizeEval(contexts.join(" "));
  return jaccardSimilarity(gtToks, contextToks);
}

// ── Full evaluation ───────────────────────────────────────────────────────────

export interface RAGEvalInput {
  question:        string;
  answer:          string;
  contexts:        string[];
  groundTruth?:    string;
  retrievalCount?: number;
  cacheHit?:       boolean;
}

export interface RAGEvalResult {
  faithfulness:     number;
  answerRelevancy:  number;
  contextPrecision: number;
  overallScore:     number;
  pass:             boolean;
}

const PASS_THRESHOLD = 0.6;

export function evaluateRAG(input: RAGEvalInput): RAGEvalResult {
  const f   = faithfulness(input.answer, input.contexts);
  const ar  = answerRelevancy(input.answer, input.question);
  const cp  = input.groundTruth ? contextPrecision(input.contexts, input.groundTruth) : ar;

  const scores  = [f, ar, cp];
  const harmMean = scores.some((s) => s === 0)
    ? 0
    : scores.length / scores.reduce((acc, s) => acc + 1 / s, 0);

  return {
    faithfulness:     Math.round(f        * 100) / 100,
    answerRelevancy:  Math.round(ar       * 100) / 100,
    contextPrecision: Math.round(cp       * 100) / 100,
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

// ── Aggregate metrics ─────────────────────────────────────────────────────────

export async function getMetricsSummary(): Promise<{
  totalEvaluations:    number;
  avgFaithfulness:     number;
  avgAnswerRelevancy:  number;
  avgContextPrecision: number;
  avgOverallScore:     number;
  passRate:            number;
}> {
  try {
    const rows = await db.select({
      total:           count(),
      avgFaith:        avg(ragEvaluations.faithfulness),
      avgRelevancy:    avg(ragEvaluations.answerRelevancy),
      avgCtxPrecision: avg(ragEvaluations.contextPrecision),
      avgOverall:      avg(ragEvaluations.overallScore),
    }).from(ragEvaluations);

    const r     = rows[0];
    const total = Number(r?.total ?? 0);

    // FIXED (Issue #25): previously counted ALL rows — now filters by pass = true
    const passRows = await db
      .select({ n: count() })
      .from(ragEvaluations)
      .where(eq(ragEvaluations.pass, true));   // ← THE FIX

    return {
      totalEvaluations:    total,
      avgFaithfulness:     Math.round(Number(r?.avgFaith        ?? 0) * 100) / 100,
      avgAnswerRelevancy:  Math.round(Number(r?.avgRelevancy    ?? 0) * 100) / 100,
      avgContextPrecision: Math.round(Number(r?.avgCtxPrecision ?? 0) * 100) / 100,
      avgOverallScore:     Math.round(Number(r?.avgOverall      ?? 0) * 100) / 100,
      passRate: total > 0 ? Math.round((Number(passRows[0]?.n ?? 0) / total) * 100) / 100 : 0,
    };
  } catch {
    return { totalEvaluations: 0, avgFaithfulness: 0, avgAnswerRelevancy: 0, avgContextPrecision: 0, avgOverallScore: 0, passRate: 0 };
  }
}

export async function getRecentEvaluations(limit = 20) {
  try {
    return await db.select().from(ragEvaluations)
      .orderBy(desc(ragEvaluations.createdAt))
      .limit(limit);
  } catch {
    return [];
  }
}

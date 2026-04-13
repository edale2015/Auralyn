/**
 * hybridRetriever.ts — Vector + Keyword fusion with Reciprocal Rank Fusion
 *
 * Article: "Hybrid retrieval is no longer optional. Pure vector search misses exact
 *  matches, pure BM25 misses semantics. Production RAG today runs both in parallel,
 *  merges results with Reciprocal Rank Fusion, and optionally reranks."
 *
 * Clinical relevance:
 *   "vancomycin MRSA 25 mg/kg" → BM25 wins (exact clinical terminology)
 *   "what drug for resistant gram-positive infection?" → vector wins (semantic)
 *   Hybrid → wins both cases
 *
 * Implementation:
 *   BM25-style: TF-IDF approximation (term frequency / doc length + IDF scaling)
 *   Vector: cosine similarity against stored embeddings (generated at index time)
 *   RRF: Reciprocal Rank Fusion (k=60) — merges ranked lists without score normalization
 *   Fallback: keyword-only when no embeddings stored
 */

import { db } from "../db";
import { knowledgeDocuments } from "@shared/schema";
import { desc, sql, like, or } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeDoc {
  id:        number;
  docId:     string;
  title:     string | null;
  content:   string;
  embedding: number[] | null;
  source:    string;
  metadata:  Record<string, unknown> | null;
}

export interface RankedDoc extends KnowledgeDoc {
  bm25Score:    number;
  vectorScore:  number;
  hybridScore:  number;
  rank:         number;
}

// ── Cosine similarity ─────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : Math.max(-1, Math.min(1, dot / denom));
}

// ── BM25-style keyword scoring ────────────────────────────────────────────────
// Simplified BM25 with TF normalization (no IDF corpus — approximate with heuristic)

const STOP_WORDS = new Set(["the", "and", "for", "that", "this", "with", "are", "was", "has", "have", "from", "not", "can", "its", "their"]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export function bm25Score(docContent: string, query: string, k1 = 1.5, b = 0.75): number {
  const avgDocLen   = 200;  // approximate for medical docs
  const docTokens   = tokenize(docContent);
  const queryTokens = tokenize(query);
  const docLen      = docTokens.length;

  const tf = new Map<string, number>();
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  let score = 0;
  for (const qt of queryTokens) {
    const freq = tf.get(qt) ?? 0;
    if (freq === 0) continue;
    // IDF approximation: rare clinical terms (length > 6) weighted more
    const idf  = qt.length > 6 ? 2.5 : 1.5;
    const tf_n = (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (docLen / avgDocLen)));
    score += idf * tf_n;
  }
  return score / Math.max(queryTokens.length, 1);
}

// ── Reciprocal Rank Fusion ────────────────────────────────────────────────────

function rrf(rank: number, k = 60): number {
  return 1 / (k + rank);
}

// ── Main hybrid retriever ─────────────────────────────────────────────────────

export async function hybridRetrieve(
  query:     string,
  embedding: number[] | null,
  topK  = 10,
  alpha = 0.5,   // 0 = pure BM25, 1 = pure vector
): Promise<RankedDoc[]> {
  // Fetch all documents (limit 500 for performance — in prod use pgvector ANN)
  const rows = await db.select().from(knowledgeDocuments).limit(500);

  if (rows.length === 0) return [];

  // ── BM25 ranking ──────────────────────────────────────────────────────────
  const bm25Ranked = rows
    .map((r) => ({ ...r, bm25Score: bm25Score(r.content, query) }))
    .sort((a, b) => b.bm25Score - a.bm25Score);

  // ── Vector ranking ────────────────────────────────────────────────────────
  const hasEmbeddings = embedding !== null && rows.some((r) => r.embedding && (r.embedding as unknown as number[]).length > 0);

  const vectorRanked = hasEmbeddings
    ? rows
        .map((r) => ({
          ...r,
          vectorScore: r.embedding
            ? cosineSimilarity(embedding!, r.embedding as unknown as number[])
            : 0,
        }))
        .sort((a, b) => b.vectorScore - a.vectorScore)
    : rows.map((r) => ({ ...r, vectorScore: 0 }));

  // ── RRF fusion ────────────────────────────────────────────────────────────
  const idToRRF = new Map<number, number>();

  bm25Ranked.forEach((doc, rank) => {
    idToRRF.set(doc.id, (idToRRF.get(doc.id) ?? 0) + (1 - alpha) * rrf(rank));
  });

  vectorRanked.forEach((doc, rank) => {
    idToRRF.set(doc.id, (idToRRF.get(doc.id) ?? 0) + alpha * rrf(rank));
  });

  // Build scored result map
  const bm25Map    = new Map(bm25Ranked.map((d) => [d.id, d.bm25Score]));
  const vectorMap  = new Map(vectorRanked.map((d) => [d.id, (d as { vectorScore: number }).vectorScore]));

  const results: RankedDoc[] = rows
    .map((r): RankedDoc => ({
      id:           r.id,
      docId:        r.docId,
      title:        r.title,
      content:      r.content,
      embedding:    r.embedding as unknown as number[] | null,
      source:       r.source,
      metadata:     r.metadata as Record<string, unknown> | null,
      bm25Score:    bm25Map.get(r.id) ?? 0,
      vectorScore:  vectorMap.get(r.id) ?? 0,
      hybridScore:  idToRRF.get(r.id) ?? 0,
      rank:         0,
    }))
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK)
    .map((d, i) => ({ ...d, rank: i + 1 }));

  return results;
}

// ── Keyword-only search (no AI, no embeddings) ────────────────────────────────

export async function keywordRetrieve(query: string, topK = 10): Promise<RankedDoc[]> {
  const rows = await db.select().from(knowledgeDocuments).limit(500);

  return rows
    .map((r): RankedDoc => {
      const score = bm25Score(r.content, query);
      return {
        id:          r.id,
        docId:       r.docId,
        title:       r.title,
        content:     r.content,
        embedding:   null,
        source:      r.source,
        metadata:    r.metadata as Record<string, unknown> | null,
        bm25Score:   score,
        vectorScore: 0,
        hybridScore: score,
        rank:        0,
      };
    })
    .filter((r) => r.bm25Score > 0)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK)
    .map((d, i) => ({ ...d, rank: i + 1 }));
}

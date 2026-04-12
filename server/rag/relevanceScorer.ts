/**
 * Relevance Scorer — scores and filters retrieved context chunks
 * Uses keyword-overlap TF-IDF-inspired scoring (no LLM needed — deterministic + fast)
 * Filters below threshold and returns top-N for clinical reasoning.
 */

import type { RetrievedChunk } from "./multiSourceRetriever";

export interface ScoredChunk extends RetrievedChunk {
  score:          number;
  matchedTerms:   string[];
  passed:         boolean;
}

const SOURCE_BOOST: Record<RetrievedChunk["source"], number> = {
  symptom_skill:   0.20,   // skill snippets are curated → high boost
  kb_entity:       0.05,   // KB entities match terminology
  knowledge_graph: 0.00,   // graph nodes are good structural context
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function idf(term: string, docs: string[][]): number {
  const df = docs.filter((d) => d.includes(term)).length;
  return df === 0 ? 0 : Math.log((docs.length + 1) / (df + 1));
}

export function scoreChunks(
  query:     string,
  chunks:    RetrievedChunk[],
  threshold  = 0.10,
  topN       = 5
): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const queryTerms  = tokenize(query);
  const chunkTokens = chunks.map((c) => tokenize(c.text));

  const scored = chunks.map((chunk, i) => {
    const docTerms     = chunkTokens[i];
    const matchedTerms = queryTerms.filter((t) => docTerms.includes(t));

    // TF: proportion of query terms found in document
    const tf = matchedTerms.length / (queryTerms.length || 1);

    // IDF sum for matched terms
    const idfSum = matchedTerms.reduce((s, t) => s + idf(t, chunkTokens), 0);
    const idfAvg = matchedTerms.length > 0 ? idfSum / matchedTerms.length : 0;

    // Overlap score
    const overlap = matchedTerms.length / (queryTerms.length + docTerms.length - matchedTerms.length || 1);

    const rawScore = (tf * 0.40) + (overlap * 0.35) + (idfAvg * 0.10);
    const boost    = SOURCE_BOOST[chunk.source] ?? 0;
    const score    = Math.min(1, rawScore + boost);

    return { ...chunk, score, matchedTerms, passed: score >= threshold };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export function filterContext(
  scored:    ScoredChunk[],
  threshold  = 0.10
): { context: ScoredChunk[]; filtered: number; avgScore: number } {
  const context  = scored.filter((s) => s.passed && s.score >= threshold);
  const filtered = scored.length - context.length;
  const avgScore = context.length > 0
    ? context.reduce((s, c) => s + c.score, 0) / context.length
    : 0;

  return { context, filtered, avgScore: Math.round(avgScore * 1000) / 1000 };
}

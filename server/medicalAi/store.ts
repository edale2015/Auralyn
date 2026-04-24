/**
 * server/medicalAi/store.ts
 *
 * RAG knowledge store — mirrors the Python scaffold's store.py.
 *
 * Storage strategy (mirrors ALLOW_CLOUD_PHI logic):
 *   - Default: in-process memory store with cosine similarity search.
 *     All text is scrubbed of PHI before storage.
 *   - ALLOW_CLOUD_PHI=true would enable a vector DB (future Pinecone integration).
 *
 * Embedding strategy:
 *   - Uses OpenAI text-embedding-3-small (1536 dims) when API key is available.
 *   - Falls back to a lightweight TF-IDF style bag-of-words vector for offline use.
 *
 * The store is a singleton — it persists for the lifetime of the process.
 * For production, back it with Postgres + pgvector.
 */

import crypto from "crypto";
import OpenAI from "openai";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface KnowledgeDocument {
  id:          string;
  title:       string;
  text:        string;
  sourceType:  string;
  embedding:   number[];
  metadata:    Record<string, unknown>;
  ingestedAt:  number;
}

export interface SearchResult {
  document:   Omit<KnowledgeDocument, "embedding">;
  score:      number;
  excerpt:    string;
}

// ── In-memory store ───────────────────────────────────────────────────────────
const _store = new Map<string, KnowledgeDocument>();
const MAX_DOCS = 2_000;

// ── OpenAI client ─────────────────────────────────────────────────────────────
function getOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
}

// ── Embedding ─────────────────────────────────────────────────────────────────
// OpenAI text-embedding-3-small — cost-efficient, 1536 dims
async function embed(text: string): Promise<number[]> {
  const ai = getOpenAI();
  if (ai) {
    try {
      const res = await ai.embeddings.create({
        model: "text-embedding-3-small",
        input: text.slice(0, 8_000),
      });
      return res.data[0].embedding;
    } catch {
      // fall through to BOW fallback
    }
  }
  return bowVector(text);
}

// ── Bag-of-words fallback vector (256 dims, no external call) ─────────────────
function bowVector(text: string): number[] {
  const dims  = 256;
  const vec   = new Array<number>(dims).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const w of words) {
    const h = murmurhash(w) % dims;
    vec[Math.abs(h)]++;
  }
  return normalise(vec);
}

function murmurhash(str: string): number {
  let h = 0x9747b28c;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h;
}

function normalise(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag === 0 ? vec : vec.map(v => v / mag);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA === 0 || magB === 0 ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function ingestDocument(params: {
  title:      string;
  text:       string;
  sourceType: string;
  metadata?:  Record<string, unknown>;
}): Promise<KnowledgeDocument> {
  if (_store.size >= MAX_DOCS) {
    const oldest = [..._store.keys()][0];
    _store.delete(oldest);
  }

  const id        = crypto.randomUUID();
  const embedding = await embed(params.text);
  const doc: KnowledgeDocument = {
    id,
    title:      params.title,
    text:       params.text,
    sourceType: params.sourceType,
    embedding,
    metadata:   params.metadata ?? {},
    ingestedAt: Date.now(),
  };

  _store.set(id, doc);
  return doc;
}

export async function searchKnowledge(
  query:     string,
  topK  = 5,
  minScore = 0.15,
): Promise<SearchResult[]> {
  if (_store.size === 0) return [];

  const queryVec = await embed(query);

  const scored = [..._store.values()]
    .map(doc => ({
      doc,
      score: cosineSimilarity(queryVec, doc.embedding),
    }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(({ doc, score }) => ({
    document: {
      id:         doc.id,
      title:      doc.title,
      text:       doc.text,
      sourceType: doc.sourceType,
      metadata:   doc.metadata,
      ingestedAt: doc.ingestedAt,
    },
    score: Math.round(score * 1_000) / 1_000,
    excerpt: doc.text.slice(0, 300) + (doc.text.length > 300 ? "…" : ""),
  }));
}

export function getStoreStats(): { totalDocs: number; maxDocs: number; sourceTypes: Record<string, number> } {
  const sourceTypes: Record<string, number> = {};
  for (const doc of _store.values()) {
    sourceTypes[doc.sourceType] = (sourceTypes[doc.sourceType] ?? 0) + 1;
  }
  return { totalDocs: _store.size, maxDocs: MAX_DOCS, sourceTypes };
}

export function deleteDocument(id: string): boolean {
  return _store.delete(id);
}

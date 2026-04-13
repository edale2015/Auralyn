/**
 * retrievalRoutes.ts — API surface for the hybrid RAG pipeline
 *
 * Routes:
 *   POST /api/retrieval/query         — Full pipeline: cache → agent → CRAG → cache store → eval
 *   POST /api/retrieval/index         — Index a document into knowledge_documents (with optional embedding)
 *   POST /api/retrieval/evaluate      — Run RAGAS-style evaluation without caching
 *   GET  /api/retrieval/documents     — List indexed knowledge documents
 *   DELETE /api/retrieval/cache       — Clear semantic cache
 *   GET  /api/retrieval/cache/stats   — Cache entry count + Redis health
 *   GET  /api/retrieval/eval/summary  — Aggregate metric trends (for CI dashboards)
 *   GET  /api/retrieval/eval/recent   — Last N evaluations
 *   GET  /api/retrieval/health        — Module health check
 */

import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  knowledgeDocuments,
  insertKnowledgeDocumentSchema,
  type InsertKnowledgeDocument,
} from "@shared/schema";
import { hybridRetrieve, keywordRetrieve } from "../retrieval/hybridRetriever";
import { cragQuery } from "../retrieval/cragEngine";
import { retrievalAgent, embedQuery } from "../retrieval/retrievalAgent";
import { checkCache, storeCache, clearCache, cacheStats } from "../cache/semanticCache";
import { evaluateAndStore, evaluateRAG, getMetricsSummary, getRecentEvaluations } from "../eval/ragEvaluator";
import { desc } from "drizzle-orm";

const router = Router();

// ── POST /api/retrieval/query ─────────────────────────────────────────────────

const QuerySchema = z.object({
  question:    z.string().min(3).max(2000),
  skipCache:   z.boolean().optional().default(false),
  skipEval:    z.boolean().optional().default(false),
  groundTruth: z.string().optional(),
  forceKeyword: z.boolean().optional().default(false),
});

router.post("/query", async (req, res) => {
  const parse = QuerySchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  try {
    const result = await retrievalAgent(parse.data.question, {
      skipCache:    parse.data.skipCache,
      skipEval:     parse.data.skipEval,
      groundTruth:  parse.data.groundTruth,
      forceKeyword: parse.data.forceKeyword,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/retrieval/index ─────────────────────────────────────────────────

const IndexSchema = insertKnowledgeDocumentSchema.extend({
  generateEmbedding: z.boolean().optional().default(false),
});

router.post("/index", async (req, res) => {
  const parse = IndexSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  try {
    const { generateEmbedding, ...doc } = parse.data;

    let embedding: number[] | null = null;
    if (generateEmbedding) {
      embedding = await embedQuery(doc.content.slice(0, 2000));
    }

    const toInsert: InsertKnowledgeDocument = {
      ...doc,
      embedding: (embedding as any) ?? doc.embedding ?? null,
    };

    const [created] = await db.insert(knowledgeDocuments).values(toInsert)
      .onConflictDoUpdate({
        target:       knowledgeDocuments.docId,
        set: {
          title:     toInsert.title,
          content:   toInsert.content,
          embedding: toInsert.embedding,
          source:    toInsert.source,
          metadata:  toInsert.metadata,
        },
      })
      .returning();

    return res.status(201).json({ doc: created, embeddingGenerated: embedding !== null });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/retrieval/evaluate ──────────────────────────────────────────────

const EvalSchema = z.object({
  question:    z.string().min(1),
  answer:      z.string().min(1),
  contexts:    z.array(z.string()),
  groundTruth: z.string().optional(),
  store:       z.boolean().optional().default(true),
});

router.post("/evaluate", async (req, res) => {
  const parse = EvalSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  try {
    if (parse.data.store) {
      const result = await evaluateAndStore(parse.data);
      return res.json(result);
    } else {
      const result = evaluateRAG(parse.data);
      return res.json(result);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/retrieval/documents ──────────────────────────────────────────────

router.get("/documents", async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);

    const rows = await db.select().from(knowledgeDocuments)
      .orderBy(desc(knowledgeDocuments.createdAt)).limit(limit).offset(offset);

    return res.json({
      documents: rows.map((d) => ({
        id:           d.id,
        docId:        d.docId,
        title:        d.title,
        source:       d.source,
        contentLen:   d.content.length,
        hasEmbedding: Array.isArray(d.embedding) && (d.embedding as unknown as number[]).length > 0,
        createdAt:    d.createdAt,
      })),
      total: rows.length,
      limit,
      offset,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/retrieval/cache ───────────────────────────────────────────────

router.delete("/cache", async (req, res) => {
  try {
    const result = await clearCache();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/retrieval/cache/stats ────────────────────────────────────────────

router.get("/cache/stats", async (req, res) => {
  try {
    const stats = await cacheStats();
    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/retrieval/eval/summary ───────────────────────────────────────────

router.get("/eval/summary", async (req, res) => {
  try {
    const summary = await getMetricsSummary();
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/retrieval/eval/recent ────────────────────────────────────────────

router.get("/eval/recent", async (req, res) => {
  try {
    const limit   = Math.min(Number(req.query.limit ?? 20), 100);
    const results = await getRecentEvaluations(limit);
    return res.json({ evaluations: results, count: results.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/retrieval/health ─────────────────────────────────────────────────

router.get("/health", async (req, res) => {
  try {
    const [cacheS, dbCount] = await Promise.all([
      cacheStats(),
      db.select().from(knowledgeDocuments).limit(1),
    ]);
    return res.json({
      status:          "operational",
      modules: {
        hybridRetriever: "active",
        cragEngine:      "active",
        retrievalAgent:  "active",
        semanticCache:   cacheS.redisConnected ? "active" : "degraded (Redis unavailable)",
        ragEvaluator:    "active",
      },
      knowledgeDocuments: { indexed: dbCount.length >= 0 ? "ok" : "error" },
      cache: cacheS,
      aiMode: !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    });
  } catch (err: any) {
    return res.status(500).json({ status: "error", error: err.message });
  }
});

export default router;

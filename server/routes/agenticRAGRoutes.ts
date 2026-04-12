/**
 * agenticRAGRoutes.ts — Agentic RAG pipeline HTTP endpoints
 * Mounted at /api/rag
 *
 * POST /api/rag/query          — Full agentic RAG (router + relevance + fallback)
 * POST /api/rag/query/simple   — Traditional single-pass RAG (no routing, no fallback)
 * POST /api/rag/compare        — Run both pipelines and diff the results
 * GET  /api/rag/collections    — List all knowledge collections with sizes
 * GET  /api/rag/collections/:name/search — Directly search a named collection
 * POST /api/rag/collections/:name/add   — Add chunks to a named collection
 * POST /api/rag/web-search     — Invoke the web search fallback directly
 * POST /api/rag/relevance      — Test the relevance checker on any context/query pair
 */

import express from "express";
import { runAgenticRAG, runSimpleRAG, compareRAGPipelines } from "../rag/agenticRAGPipeline";
import { listCollections, queryCollection, addToCollection, type CollectionName } from "../rag/ragCollectionStore";
import { searchWeb }       from "../rag/webSearchFallback";
import { checkRelevance }  from "../rag/llmRelevanceChecker";

const router = express.Router();

// ── Agentic RAG ────────────────────────────────────────────────────────────────

router.post("/query", async (req, res) => {
  const { query } = req.body as { query?: string };
  if (!query?.trim()) {
    return void res.status(400).json({ error: "query is required" });
  }
  try {
    const result = await runAgenticRAG(query.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Traditional RAG ────────────────────────────────────────────────────────────

router.post("/query/simple", async (req, res) => {
  const { query, collection } = req.body as { query?: string; collection?: CollectionName };
  if (!query?.trim()) {
    return void res.status(400).json({ error: "query is required" });
  }
  try {
    const result = await runSimpleRAG(query.trim(), collection ?? "clinical_guidelines");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Compare both pipelines ────────────────────────────────────────────────────

router.post("/compare", async (req, res) => {
  const { query } = req.body as { query?: string };
  if (!query?.trim()) {
    return void res.status(400).json({ error: "query is required" });
  }
  try {
    const result = await compareRAGPipelines(query.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Collections ────────────────────────────────────────────────────────────────

router.get("/collections", (_req, res) => {
  res.json({ collections: listCollections() });
});

router.get("/collections/:name/search", async (req, res) => {
  const name = req.params.name as CollectionName;
  const { q, n } = req.query as { q?: string; n?: string };
  if (!q) return void res.status(400).json({ error: "q (query) is required" });
  const results = queryCollection(name, q, n ? parseInt(n) : 3);
  res.json({ collection: name, query: q, results, count: results.length });
});

router.post("/collections/:name/add", (req, res) => {
  const name   = req.params.name as CollectionName;
  const chunks = req.body.chunks as Array<{ text: string; metadata?: Record<string, string | number | boolean> }>;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return void res.status(400).json({ error: "chunks array is required" });
  }
  const added = addToCollection(name, chunks.map((c) => ({ text: c.text, metadata: c.metadata ?? {} })));
  res.status(201).json({ ok: true, collection: name, added });
});

// ── Web search fallback ────────────────────────────────────────────────────────

router.post("/web-search", async (req, res) => {
  const { query } = req.body as { query?: string };
  if (!query?.trim()) return void res.status(400).json({ error: "query is required" });
  try {
    const result = await searchWeb(query.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Relevance checker ─────────────────────────────────────────────────────────

router.post("/relevance", async (req, res) => {
  const { query, context } = req.body as { query?: string; context?: string };
  if (!query || !context) {
    return void res.status(400).json({ error: "query and context are required" });
  }
  try {
    const result = await checkRelevance(query, context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

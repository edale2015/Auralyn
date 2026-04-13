/**
 * clinicalReasoningRoutes.ts — REST API for PageIndex clinical document reasoning
 *
 * Architecture file (System Upgrade — Folder):
 *   POST /api/clinical-reasoning/index           — ingest a clinical document into PageIndex tree
 *   POST /api/clinical-reasoning/ask             — ask a question, get AI-navigated answer
 *   GET  /api/clinical-reasoning/documents       — list all indexed documents
 *   GET  /api/clinical-reasoning/documents/:id/tree    — get full tree for a document
 *   GET  /api/clinical-reasoning/documents/:id/queries — get query log for a document
 *   POST /api/clinical-reasoning/documents/:id/refs    — build cross-reference graph
 *   GET  /api/clinical-reasoning/health          — module health check
 *
 * Context (Phase 5 reference vitals schema):
 *   Clinical questions will reference SOFA (bp, o2), CURB-65 (age, bp),
 *   HEART (chestPain), WELLS (hr), dosing (weight), contraindications (allergy).
 *   The reasoning engine navigates to the correct section in any clinical guideline
 *   that answers questions about these parameters.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getClinicalDocEngine } from "../clinical_reasoning/clinicalDocEngine";
import { PageIndexBuilder } from "../clinical_reasoning/pageIndexBuilder";
import { findReferences, resolveReference, buildReferenceGraph, flattenTree } from "../clinical_reasoning/crossReferenceNavigator";
import { ingestClinicalDoc, ingestFromText } from "../kb/ingestClinicalDoc";
import { db } from "../db";
import { guidelineDocuments, clinicalDocNodes } from "@shared/schema";
import { desc, eq, count } from "drizzle-orm";

const router = Router();
const engine  = getClinicalDocEngine();
const builder = new PageIndexBuilder();

// ── Validation schemas ────────────────────────────────────────────────────────

const IndexBodySchema = z.object({
  content: z.string().min(20, "Content must be at least 20 characters"),
  title:   z.string().min(1).default("Clinical Document"),
});

const AskBodySchema = z.object({
  documentId: z.number().int().positive().optional(),
  content:    z.string().optional(),    // ephemeral mode — no DB persist
  title:      z.string().optional(),
  question:   z.string().min(3, "Question must be at least 3 characters"),
});

// ── Health ────────────────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    module: "clinical-reasoning",
    version: "batch-57",
    capabilities: ["pageIndex", "treeNavigation", "crossReference", "aiExtraction", "keywordFallback"],
    timestamp: new Date().toISOString(),
  });
});

// ── POST /index — ingest a document into the PageIndex tree ──────────────────

router.post("/index", async (req: Request, res: Response) => {
  const parsed = IndexBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
  }

  const { content, title } = parsed.data;

  try {
    const result = await ingestClinicalDoc(content, title);
    return res.json({
      success:    true,
      documentId: result.documentId,
      title:      result.title,
      nodeCount:  result.nodeCount,
      status:     result.status,
      error:      result.error,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── POST /ask — navigate tree and extract answer ─────────────────────────────

router.post("/ask", async (req: Request, res: Response) => {
  const parsed = AskBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
  }

  const { documentId, content, title, question } = parsed.data;

  try {
    let result;

    if (documentId !== undefined) {
      // DB-backed mode
      result = await engine.answer(documentId, question);
    } else if (content) {
      // Ephemeral mode — index inline, answer, no DB write
      const epId     = `ephemeral_${Date.now()}`;
      const pageIndex = ingestFromText(content, epId);
      result          = await engine.answerFromIndex(pageIndex, question);
    } else {
      return res.status(400).json({ error: "Provide either documentId or content" });
    }

    return res.json({
      question,
      answer:     result.answer,
      nodeId:     result.nodeId,
      nodeTitle:  result.nodeTitle,
      confidence: result.confidence,
      mode:       result.mode,
      crossRefs:  result.crossRefs,
      queryId:    result.queryId,
      reasoning:  result.reasoning,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── GET /documents — list all indexed guideline documents ────────────────────

router.get("/documents", async (_req: Request, res: Response) => {
  try {
    const docs = await db.select({
      id:        guidelineDocuments.id,
      title:     guidelineDocuments.title,
      source:    guidelineDocuments.source,
      status:    guidelineDocuments.status,
      createdAt: guidelineDocuments.createdAt,
    }).from(guidelineDocuments).orderBy(desc(guidelineDocuments.createdAt)).limit(50);

    // Attach node counts
    const withCounts = await Promise.all(docs.map(async (d) => {
      const [row] = await db.select({ n: count() }).from(clinicalDocNodes)
        .where(eq(clinicalDocNodes.documentId, d.id));
      return { ...d, nodeCount: Number(row?.n ?? 0) };
    }));

    return res.json({ documents: withCounts, total: withCounts.length });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── GET /documents/:id/tree — get full PageIndex tree for a document ──────────

router.get("/documents/:id/tree", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid document id" });

  try {
    const tree = await engine.loadTree(id);
    if (tree.length === 0) {
      return res.status(404).json({ error: "No tree found for this document. Index it first." });
    }

    // Build a fast in-memory index for display
    const pageIndex = engine.getTree(String(id));
    const summary   = pageIndex ? engine.getTreeSummary(pageIndex) : null;

    return res.json({
      documentId: id,
      nodeCount:  flattenTree(tree).length,
      nodes:      tree,
      summary,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── GET /documents/:id/queries — query log ────────────────────────────────────

router.get("/documents/:id/queries", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid document id" });

  try {
    const queries = await engine.getQueryLog(id);
    return res.json({ documentId: id, queries, total: queries.length });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── POST /documents/:id/refs — build cross-reference graph ───────────────────

router.post("/documents/:id/refs", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid document id" });

  try {
    const graph = await engine.buildReferenceGraph(id);
    return res.json({
      documentId: id,
      graph,
      totalLinks: graph.reduce((s, e) => s + e.references.length, 0),
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ── POST /parse — parse text into a tree (preview, no DB persist) ─────────────

router.post("/parse", (req: Request, res: Response) => {
  const body = z.object({
    content: z.string().min(10),
    title:   z.string().optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "Validation failed", issues: body.error.issues });

  try {
    const pageIndex = builder.buildTreeFromText(body.data.content, "preview");
    const summary   = builder.generateTreeSummary(pageIndex);
    return res.json({ nodeCount: pageIndex.nodeCount, nodes: pageIndex.nodes, summary });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;

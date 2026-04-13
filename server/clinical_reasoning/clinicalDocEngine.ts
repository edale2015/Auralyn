/**
 * clinicalDocEngine.ts — Full clinical document reasoning orchestrator
 *
 * Article (Stop Chunking, Start Reasoning):
 *   "Step 2: Agentic retrieval — iterative loop:
 *    1. identify sections likely to contain the answer
 *    2. retrieve raw content for the most promising section
 *    3. extract relevant information
 *    4. either answer the question or return to tree and try another section"
 *
 * Architecture file (System Upgrade):
 *   "ClinicalDocEngine:
 *    1. buildTreeFromText  → tree from document
 *    2. findRelevantNode   → LLM navigates tree to best section
 *    3. extractAnswer      → LLM extracts answer with evidence + confidence
 *    4. findReferences     → detect cross-references in selected node
 *    5. resolveReference   → navigate tree to cross-referenced node
 *    6. extractAnswer      → extract additional context from cross-reference
 *    7. Log to DB          → reasoning_queries + cross_reference_logs"
 *
 * Document store (in-memory + DB):
 *   In-memory: fast, for single-session queries and testing
 *   DB: persistent, for KB integration, golden case generation, RLHF training
 */

import { PageIndexBuilder, type DocNode, type PageIndex } from "./pageIndexBuilder";
import { ReasoningRetriever } from "./reasoningRetriever";
import {
  findReferences as navFindRefs,
  resolveReference as navResolveRef,
  buildReferenceGraph as navBuildRefGraph,
  flattenTree,
} from "./crossReferenceNavigator";
import { db } from "../db";
import {
  clinicalDocNodes, clinicalReasoningQueries, clinicalCrossRefLogs,
  type InsertClinicalDocNode, type InsertClinicalReasoningQuery, type InsertClinicalCrossRefLog,
} from "@shared/schema";
import { eq } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EngineQueryResult {
  answer:        string;
  nodeId:        string;
  nodeTitle:     string;
  confidence:    number;
  mode:          "ai" | "keyword";
  crossRefs:     Array<{
    reference:         string;
    resolvedNode:      string;
    additionalContext: string;
  }>;
  queryId?:  number;
  reasoning?: string;
}

export interface IndexResult {
  documentId:   number;
  nodeCount:    number;
  title:        string;
  treeSnapshot: PageIndex;
}

// ── Module-level singletons ───────────────────────────────────────────────────

const _trees     = new Map<string, PageIndex>();
const _builder   = new PageIndexBuilder();
const _retriever = new ReasoningRetriever();

// ── ClinicalDocEngine ─────────────────────────────────────────────────────────

export class ClinicalDocEngine {
  // ── Index a document (build tree + persist nodes to DB) ──────────────────

  async indexDocument(content: string, title: string, documentId: number): Promise<IndexResult> {
    const docIdStr  = String(documentId);
    const pageIndex = _builder.buildTreeFromText(content, docIdStr);
    _trees.set(docIdStr, pageIndex);

    try {
      await db.delete(clinicalDocNodes).where(eq(clinicalDocNodes.documentId, documentId));
      for (const node of flattenTree(pageIndex.nodes)) {
        await db.insert(clinicalDocNodes).values({
          documentId,
          nodeId:       node.node_id,
          title:        node.title,
          startPage:    node.start_page,
          endPage:      node.end_page,
          summary:      node.summary,
          content:      node.content ?? "",
          parentNodeId: null,
          depth:        node.depth,
        } satisfies InsertClinicalDocNode);
      }
    } catch {
      // DB unavailable — in-memory tree is sufficient
    }

    return { documentId, nodeCount: pageIndex.nodeCount, title: pageIndex.title, treeSnapshot: pageIndex };
  }

  // ── Load tree (from memory cache or DB) ──────────────────────────────────

  async loadTree(documentId: number): Promise<DocNode[]> {
    const key = String(documentId);
    if (_trees.has(key)) return _trees.get(key)!.nodes;

    try {
      const rows = await db.select().from(clinicalDocNodes)
        .where(eq(clinicalDocNodes.documentId, documentId));
      if (rows.length === 0) return [];

      // Reconstruct flat tree from DB rows
      return rows.filter((r) => r.depth === 0).map((r): DocNode => ({
        node_id:    r.nodeId,
        title:      r.title,
        start_page: r.startPage ?? 0,
        end_page:   r.endPage ?? 0,
        summary:    r.summary ?? "",
        content:    r.content ?? "",
        depth:      0,
        children:   rows.filter((c) => c.depth === 1 && c.parentNodeId === r.nodeId)
          .map((c): DocNode => ({
            node_id:    c.nodeId,
            title:      c.title,
            start_page: c.startPage ?? 0,
            end_page:   c.endPage ?? 0,
            summary:    c.summary ?? "",
            content:    c.content ?? "",
            depth:      1,
            children:   [],
          })),
      }));
    } catch {
      return [];
    }
  }

  // ── Index directly from text (no DB) ─────────────────────────────────────

  indexFromText(content: string, docId = "ephemeral_0"): PageIndex {
    const pageIndex = _builder.buildTreeFromText(content, docId);
    _trees.set(docId, pageIndex);
    return pageIndex;
  }

  getTree(docId: string): PageIndex | undefined {
    return _trees.get(docId);
  }

  // ── Answer from documentId (DB-backed) ───────────────────────────────────

  async answer(documentId: number, question: string): Promise<EngineQueryResult> {
    const tree = await this.loadTree(documentId);
    return this._answerFromTree(tree, question, documentId);
  }

  // ── Answer from PageIndex (in-memory, may use AI) ────────────────────────

  async answerFromIndex(pageIndex: PageIndex, question: string): Promise<EngineQueryResult> {
    return this._answerFromTree(pageIndex.nodes, question);
  }

  // ── Synchronous keyword-only answer (no AI, no DB, deterministic) ─────────
  // Use in tests, CLI previews, or when AI is unavailable.

  answerFromIndexSync(pageIndex: PageIndex, question: string): EngineQueryResult {
    if (pageIndex.nodes.length === 0) {
      return { answer: "No document nodes found.", nodeId: "", nodeTitle: "", confidence: 0, mode: "keyword", crossRefs: [] };
    }
    const nodeId = _retriever.findRelevantNodeSync(pageIndex.nodes, question);
    const flat   = flattenTree(pageIndex.nodes);
    const node   = nodeId ? flat.find((n) => n.node_id === nodeId) : flat[0];
    if (!node) return { answer: "Could not navigate to a relevant section.", nodeId: "", nodeTitle: "", confidence: 0, mode: "keyword", crossRefs: [] };

    const extraction = _retriever.extractAnswerSync(node, question);
    const rawRefs    = navFindRefs(node.content ?? "");
    const crossRefs: EngineQueryResult["crossRefs"] = [];
    for (const ref of rawRefs.slice(0, 3)) {
      const resolved = navResolveRef(pageIndex.nodes, ref);
      if (!resolved.resolvedNode || resolved.confidence < 0.3) continue;
      const extra = _retriever.extractAnswerSync(resolved.resolvedNode, question);
      crossRefs.push({ reference: ref.raw, resolvedNode: resolved.resolvedNodeId ?? resolved.resolvedNode.node_id, additionalContext: extra.answer });
    }
    return { answer: extraction.answer, nodeId: node.node_id, nodeTitle: node.title, confidence: extraction.confidence, mode: "keyword", crossRefs };
  }

  // ── Core agentic retrieval loop ───────────────────────────────────────────

  private async _answerFromTree(
    tree:        DocNode[],
    question:    string,
    documentId?: number,
  ): Promise<EngineQueryResult> {
    if (tree.length === 0) {
      return { answer: "No document nodes found.", nodeId: "", nodeTitle: "", confidence: 0, mode: "keyword", crossRefs: [] };
    }

    // Step 1: navigate tree to most relevant node
    const nodeId = await _retriever.findRelevantNode(tree, question);
    const flat   = flattenTree(tree);
    const node   = nodeId ? flat.find((n) => n.node_id === nodeId) : flat[0];

    if (!node) {
      return { answer: "Could not navigate to a relevant section.", nodeId: "", nodeTitle: "", confidence: 0, mode: "keyword", crossRefs: [] };
    }

    // Step 2: extract answer from selected node
    const extraction = await _retriever.extractAnswer(node, question);

    // Step 3: follow cross-references for additional context
    const rawRefs  = navFindRefs(node.content ?? "");
    const crossRefs: EngineQueryResult["crossRefs"] = [];

    for (const ref of rawRefs.slice(0, 3)) {
      const resolved = navResolveRef(tree, ref);
      if (!resolved.resolvedNode || resolved.confidence < 0.3) continue;
      const extra = _retriever.extractAnswerSync(resolved.resolvedNode, question);
      crossRefs.push({
        reference:         ref.raw,
        resolvedNode:      resolved.resolvedNodeId ?? resolved.resolvedNode.node_id,
        additionalContext: extra.answer,
      });
    }

    // Step 4: persist to DB if documentId provided
    let queryId: number | undefined;
    try {
      if (documentId !== undefined) {
        const [queryRow] = await db.insert(clinicalReasoningQueries).values({
          documentId,
          question,
          selectedNode:  node.node_id,
          answer:        extraction.answer,
          confidence:    extraction.confidence,
          retrievalMode: extraction.mode,
        } satisfies InsertClinicalReasoningQuery).returning({ id: clinicalReasoningQueries.id });
        queryId = queryRow.id;

        for (const xref of crossRefs) {
          await db.insert(clinicalCrossRefLogs).values({
            queryId,
            reference:    xref.reference,
            resolvedNode: xref.resolvedNode,
            resolved:     true,
          } satisfies InsertClinicalCrossRefLog);
        }
      }
    } catch {
      // DB unavailable — continue without persistence
    }

    return {
      answer:     extraction.answer,
      nodeId:     node.node_id,
      nodeTitle:  node.title,
      confidence: extraction.confidence,
      mode:       extraction.mode,
      crossRefs,
      queryId,
      reasoning:  extraction.reasoning,
    };
  }

  // ── Query log ─────────────────────────────────────────────────────────────

  async getQueryLog(documentId: number) {
    try {
      return await db.select().from(clinicalReasoningQueries)
        .where(eq(clinicalReasoningQueries.documentId, documentId))
        .orderBy(clinicalReasoningQueries.createdAt);
    } catch {
      return [];
    }
  }

  // ── Reference graph for a document ───────────────────────────────────────

  async buildReferenceGraph(documentId: number) {
    const tree = await this.loadTree(documentId);
    return navBuildRefGraph(tree);
  }

  // ── Tree summary (for Control Tower display) ──────────────────────────────

  getTreeSummary(pageIndex: PageIndex): string {
    return _builder.generateTreeSummary(pageIndex);
  }

  static getInstance(): ClinicalDocEngine {
    return _sharedInstance;
  }
}

// Shared singleton
const _sharedInstance = new ClinicalDocEngine();
export function getClinicalDocEngine(): ClinicalDocEngine {
  return _sharedInstance;
}

// Re-export utilities used in routes
export { flattenTree, navFindRefs as findReferences, navBuildRefGraph as buildReferenceGraph };

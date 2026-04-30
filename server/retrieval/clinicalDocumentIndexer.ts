/**
 * clinicalDocumentIndexer.ts
 * server/retrieval/clinicalDocumentIndexer.ts
 *
 * PAGEINDEX ARCHITECTURE FOR AURALYN
 *
 * Hierarchical tree index of clinical documents — machine-readable table of
 * contents with LLM-navigable nodes. No vector database. No chunking.
 *
 * TWO PRIMARY USE CASES:
 *   1. GUIDELINE GROUNDING — KB Validator + Adversarial Review cite actual pages
 *   2. PRIOR AUTH NAVIGATION — Navigate payer policy → exact coverage criteria
 *
 * Step 1: generateIndex (once per doc) — Opus builds tree
 * Step 2: navigateTree (per query) — Sonnet follows branches
 * Step 3: retrievePages — fetch complete pages (unchunked)
 * Step 4: generateAnswer — Opus answers from full context
 */

import { llmGateway }       from "../gateway/llmGateway";
import { db }               from "../db";
import { sql }              from "drizzle-orm";
import { appendAuditEvent } from "../governance/audit";
import * as fs              from "fs";
import * as path            from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentIndexNode {
  id:       string;
  title:    string;
  summary:  string;
  pages?:   [number, number];
  depth:    number;
  children: DocumentIndexNode[];
}

export interface DocumentIndex {
  documentId:  string;
  title:       string;
  type:        "clinical_guideline" | "prior_auth_policy" | "formulary" | "protocol";
  source:      string;
  indexedAt:   string;
  totalPages:  number;
  tree:        DocumentIndexNode;
}

export interface NavigationResult {
  nodes:          DocumentIndexNode[];
  pagesAccessed:  number[];
  navigationPath: string[];
}

export interface DocumentQueryResult {
  answer:         string;
  citations:      string[];
  navigationPath: string[];
  retrievedText:  string;
  confidence:     "high" | "moderate" | "low";
  documentSource: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const INDEXES_DIR = path.join(process.cwd(), ".document-indexes");

function ensureIndexesDir() {
  if (!fs.existsSync(INDEXES_DIR)) fs.mkdirSync(INDEXES_DIR, { recursive: true });
}

function saveIndex(index: DocumentIndex): void {
  ensureIndexesDir();
  fs.writeFileSync(
    path.join(INDEXES_DIR, `${index.documentId}.json`),
    JSON.stringify(index, null, 2)
  );
}

function loadIndex(documentId: string): DocumentIndex | null {
  const p = path.join(INDEXES_DIR, `${documentId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function listIndexes(): DocumentIndex[] {
  ensureIndexesDir();
  return fs.readdirSync(INDEXES_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(INDEXES_DIR, f), "utf-8")); }
      catch { return null; }
    })
    .filter(Boolean) as DocumentIndex[];
}

function countDepth(node: DocumentIndexNode): number {
  if (!node.children?.length) return node.depth;
  return Math.max(...node.children.map(countDepth));
}

function countNodes(node: DocumentIndexNode): number {
  return 1 + (node.children ?? []).reduce((sum, c) => sum + countNodes(c), 0);
}

// ─── Step 1: Index generation ─────────────────────────────────────────────────

export async function generateDocumentIndex(
  documentId:    string,
  documentText:  string,
  documentTitle: string,
  documentType:  DocumentIndex["type"],
  source:        string,
  totalPages:    number
): Promise<DocumentIndex> {

  const words = documentText.split(" ");

  const indexResult = await llmGateway.complete({
    purpose:   "clinical_brain",   // Opus — one-time expensive index generation
    messages:  [{
      role:    "user",
      content: `Document: ${documentTitle}\nType: ${documentType}\nTotal pages: ${totalPages}\n\nDocument text (first 8000 words):\n${words.slice(0, 8000).join(" ")}\n\nBuild a hierarchical index tree. Return JSON:\n{\n  "id": "root",\n  "title": "${documentTitle}",\n  "summary": "overall document summary and what questions it answers",\n  "pages": [1, ${totalPages}],\n  "depth": 0,\n  "children": [...]\n}`,
    }],
    system:    `You are building a hierarchical index of a clinical document.
Your job: analyze the document structure and create a machine-readable tree index,
like an extremely detailed table of contents where each node describes what
questions that section can answer.

For each node include:
- A clear title (what the section covers)
- A summary: what specific questions this section can answer (be specific about clinical content)
- Page range: [startPage, endPage] (approximate)
- Children: sub-sections with their own titles, summaries, and page ranges

Clinical guideline sections to identify:
- Scope / Applicability
- Clinical presentation / Risk stratification
- Diagnostic criteria and workup
- Treatment recommendations
- Disposition criteria
- Special populations (elderly, pediatric, pregnant)
- Evidence grading / Guideline strength
- Appendices and tables

For prior auth policies:
- Coverage criteria
- Clinical indications by procedure/diagnosis code
- Documentation requirements
- Step therapy requirements
- Appeal procedures

Return ONLY valid JSON matching DocumentIndexNode structure. No markdown.`,
    maxTokens: 4000,
    skipCache: true,
  });

  const clean = indexResult.content.replace(/```json|```/g, "").trim();

  let tree: DocumentIndexNode;
  try {
    tree = JSON.parse(clean);
  } catch {
    tree = {
      id:       "root",
      title:    documentTitle,
      summary:  `${documentType} document. Contains clinical guidance.`,
      pages:    [1, totalPages],
      depth:    0,
      children: [],
    };
  }

  const index: DocumentIndex = {
    documentId,
    title:      documentTitle,
    type:       documentType,
    source,
    indexedAt:  new Date().toISOString(),
    totalPages,
    tree,
  };

  saveIndex(index);

  await db.execute(sql`
    INSERT INTO clinical_document_indexes (
      document_id, title, doc_type, source, total_pages, indexed_at, tree_json
    ) VALUES (
      ${documentId}, ${documentTitle}, ${documentType}, ${source},
      ${totalPages}, ${index.indexedAt}, ${JSON.stringify(tree)}::jsonb
    )
    ON CONFLICT (document_id) DO UPDATE SET
      tree_json  = ${JSON.stringify(tree)}::jsonb,
      indexed_at = ${index.indexedAt}
  `).catch(console.error);

  await appendAuditEvent({
    actor:      "system",
    action:     "DOCUMENT_INDEXED",
    entityId:   documentId,
    entityType: "document_index",
    details: {
      documentType,
      source,
      totalPages,
      treeDepth: countDepth(tree),
      nodeCount: countNodes(tree),
    },
  }).catch(console.error);

  return index;
}

// ─── Step 2: Tree navigation ──────────────────────────────────────────────────

async function navigateTree(
  query: string,
  node:  DocumentIndexNode,
  path:  string[] = []
): Promise<NavigationResult> {
  const currentPath = [...path, node.title];

  if (!node.children?.length) {
    return {
      nodes:          [node],
      pagesAccessed:  node.pages ? [node.pages[0], node.pages[1]] : [],
      navigationPath: currentPath,
    };
  }

  const childrenSummary = node.children.map((child, i) =>
    `[${i}] ${child.title}: ${child.summary}`
  ).join("\n");

  const gatewayResult = await llmGateway.complete({
    purpose:  "retrieval_pruner",
    messages: [{
      role:    "user",
      content: `Clinical query: "${query}"\n\nCurrent section: ${node.title}\n\nAvailable subsections:\n${childrenSummary}\n\nWhich subsections likely contain the answer? Return JSON: {"indices": [0, 2]} or {"indices": []} if none are relevant and the current section itself is the answer.`,
    }],
    system:   `You are navigating a clinical document index to find sections relevant to a query.
Be precise. Select ONLY subsections that are directly relevant to answering the query.
If the current section itself answers the question, return {"indices": []}.
Return ONLY valid JSON with an "indices" array. No explanation.`,
    maxTokens: 100,
    cacheKey:  `nav:${node.id}:${query.slice(0, 50)}`,
  });

  let selectedIndices: number[] = [];
  try {
    const parsed = JSON.parse(gatewayResult.content.replace(/```json|```/g, "").trim());
    selectedIndices = parsed.indices ?? [];
  } catch {
    selectedIndices = [];
  }

  if (selectedIndices.length === 0) {
    return {
      nodes:          [node],
      pagesAccessed:  node.pages ? [node.pages[0], node.pages[1]] : [],
      navigationPath: currentPath,
    };
  }

  const allNodes: DocumentIndexNode[] = [];
  const allPages: number[]            = [];

  for (const idx of selectedIndices) {
    if (idx >= 0 && idx < node.children.length) {
      const subResult = await navigateTree(query, node.children[idx], currentPath);
      allNodes.push(...subResult.nodes);
      allPages.push(...subResult.pagesAccessed);
    }
  }

  return {
    nodes:          allNodes,
    pagesAccessed:  [...new Set(allPages)].sort((a, b) => a - b),
    navigationPath: currentPath,
  };
}

// ─── Step 3 + 4: Retrieve and answer ─────────────────────────────────────────

export async function queryDocument(
  documentId: string,
  query:      string,
  pageTexts:  Record<number, string>
): Promise<DocumentQueryResult> {

  const index = loadIndex(documentId);
  if (!index) {
    throw new Error(`Document index not found for: ${documentId}. Run generateDocumentIndex() first.`);
  }

  const navigation = await navigateTree(query, index.tree);

  const retrievedParts: string[] = [];
  const citations:      string[] = [];

  for (const node of navigation.nodes) {
    if (!node.pages) continue;
    const [startPage, endPage] = node.pages;
    for (let p = startPage; p <= Math.min(endPage, startPage + 5); p++) {
      if (pageTexts[p]) {
        retrievedParts.push(`--- Page ${p} ---\n${pageTexts[p]}`);
        citations.push(`p.${p}`);
      }
    }
  }

  if (retrievedParts.length === 0) {
    return {
      answer:         "Could not retrieve relevant sections from the document index.",
      citations:      [],
      navigationPath: navigation.navigationPath,
      retrievedText:  "",
      confidence:     "low",
      documentSource: index.source,
    };
  }

  const context = retrievedParts.join("\n\n");

  const answerResult = await llmGateway.complete({
    purpose:  "clinical_brain",
    messages: [{
      role:    "user",
      content: `Document sections:\n${context}\n\nClinical question: ${query}\n\nAnswer based on the guideline text. Quote exact criteria, thresholds, and recommendations. Note the evidence grade if mentioned.`,
    }],
    system:   `You are answering a clinical question using retrieved guideline or policy sections.
Be precise. Quote specific criteria, thresholds, and recommendations from the text.
If the answer involves numbers or criteria, quote them exactly.
If the guideline doesn't clearly address the question, say so explicitly.
Note the section and evidence grade when available.`,
    maxTokens: 800,
    cacheKey:  `answer:${documentId}:${query.slice(0, 60)}`,
  });

  const confidence: "high" | "moderate" | "low" =
    navigation.nodes.length > 0 && citations.length > 0 ? "high" :
    navigation.nodes.length > 0 ? "moderate" : "low";

  await appendAuditEvent({
    actor:      "system",
    action:     "DOCUMENT_QUERIED",
    entityId:   documentId,
    entityType: "document_index",
    details: {
      documentType:   index.type,
      nodesRetrieved: navigation.nodes.length,
      pagesAccessed:  navigation.pagesAccessed.length,
      confidence,
    },
  }).catch(console.error);

  return {
    answer:         answerResult.content,
    citations:      [...new Set(citations)],
    navigationPath: navigation.navigationPath,
    retrievedText:  context,
    confidence,
    documentSource: index.source,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const ClinicalDocumentIndexer = {
  generateIndex: generateDocumentIndex,
  query:         queryDocument,
  loadIndex,
  listIndexes,
};

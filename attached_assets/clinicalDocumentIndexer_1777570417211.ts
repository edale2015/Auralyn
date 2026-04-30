/**
 * clinicalDocumentIndexer.ts
 * Drop into: server/retrieval/clinicalDocumentIndexer.ts
 *
 * PAGEINDEX ARCHITECTURE FOR AURALYN
 *
 * WHAT THE ARTICLE TAUGHT US:
 * "Similarity is not relevance. Vector chunking destroys document hierarchy.
 * A human analyst navigates a table of contents, jumps to the relevant section,
 * reads with awareness of context. PageIndex does the same thing."
 *
 * THE PROBLEM IN AURALYN:
 * Clinical guidelines (ACEP, AAP, AHA) and payer prior auth policies are
 * long, hierarchically structured documents. Auralyn's KB rules were typed
 * manually from these guidelines. When a KB validator challenges a rule,
 * there's no way to ground the challenge in the actual source document.
 *
 * WHAT THIS BUILDS:
 * A hierarchical tree index of clinical documents — essentially a machine-readable
 * table of contents with LLM-navigable nodes. When the KB validator, adversarial
 * reviewer, or prior auth engine needs to verify a clinical claim, it navigates
 * the index tree to find the exact guideline section, not a semantically-similar
 * chunk that may be about something different.
 *
 * TWO PRIMARY USE CASES:
 *
 * 1. GUIDELINE GROUNDING (KB Validator + Adversarial Review)
 *    "What does ACEP say about chest pain in diabetics?"
 *    → Navigate ACEP Clinical Policy index → Chest Pain section → retrieve pages
 *    → Ground KB rule generation in actual guideline text
 *
 * 2. PRIOR AUTH NAVIGATION (Win 9 priorAuthSkeleton.ts enhancement)
 *    "Does United Healthcare require prior auth for MRI Brain in a patient with headache?"
 *    → Navigate payer policy index → Imaging section → Neurology → Brain MRI
 *    → Extract actual policy rule with page citation
 *
 * NO VECTOR DATABASE. NO CHUNKING. Hierarchical index + LLM tree navigation.
 *
 * ARCHITECTURE:
 *   Step 1: Index generation — analyze document structure, build tree (once per doc)
 *   Step 2: Tree navigation — LLM reads nodes and reasons which branch to follow
 *   Step 3: Section retrieval — fetch complete pages from original document
 *   Step 4: Answer generation — reasoning model answers from full, unchunked context
 */

import Anthropic from "@anthropic-ai/sdk";
import { db }    from "../db";
import { sql }   from "drizzle-orm";
import { appendAuditEvent } from "../governance/audit";
import { llmGateway }       from "../gateway/llmGateway";
import * as fs   from "fs";
import * as path from "path";

const anthropic = new Anthropic();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentIndexNode {
  id:       string;
  title:    string;
  summary:  string;          // what questions this section can answer
  pages?:   [number, number]; // [start, end] page range in original document
  depth:    number;
  children: DocumentIndexNode[];
}

export interface DocumentIndex {
  documentId:  string;
  title:       string;
  type:        "clinical_guideline" | "prior_auth_policy" | "formulary" | "protocol";
  source:      string;        // e.g., "ACEP Clinical Policy: Chest Pain 2025"
  indexedAt:   string;
  totalPages:  number;
  tree:        DocumentIndexNode;
}

export interface NavigationResult {
  nodes:         DocumentIndexNode[];
  pagesAccessed: number[];
  navigationPath: string[];   // which nodes were traversed (for explainability)
}

export interface DocumentQueryResult {
  answer:          string;
  citations:       string[];     // "p.42", "p.43" etc.
  navigationPath:  string[];     // the index tree path taken
  retrievedText:   string;       // the actual guideline text retrieved
  confidence:      "high" | "moderate" | "low";
  documentSource:  string;
}

// ─── Document index storage ───────────────────────────────────────────────────

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

// ─── Step 1: Index generation ─────────────────────────────────────────────────
// Analyzes document text and builds a hierarchical tree index.
// This runs ONCE per document and is stored — not on every query.

export async function generateDocumentIndex(
  documentId: string,
  documentText: string,        // full text of the document
  documentTitle: string,
  documentType: DocumentIndex["type"],
  source: string,
  totalPages: number
): Promise<DocumentIndex> {

  // Split into page-approximate sections for the indexer
  // We process in chunks to stay within context limits, but the INDEX preserves structure
  const wordsPerPage   = Math.ceil(documentText.split(" ").length / Math.max(totalPages, 1));
  const words          = documentText.split(" ");
  const pageTexts: string[] = [];

  for (let p = 0; p < totalPages; p++) {
    const start = p * wordsPerPage;
    const end   = Math.min((p + 1) * wordsPerPage, words.length);
    pageTexts.push(words.slice(start, end).join(" "));
  }

  // Use Opus to build the hierarchical index — this is the expensive one-time step
  const response = await anthropic.messages.create({
    model:      "claude-opus-4-20250514",
    max_tokens: 4000,
    system: `You are building a hierarchical index of a clinical document.
Your job: analyze the document structure and create a machine-readable tree index,
like an extremely detailed table of contents where each node describes what
questions that section can answer.

For each node include:
- A clear title (what the section covers)
- A summary: what specific questions this section can answer (be specific about clinical content)
- Page range: [startPage, endPage] (approximate)
- Children: sub-sections with their own titles, summaries, and page ranges

Clinical guideline sections you should always identify if present:
- Scope / Applicability
- Clinical presentation / Risk stratification
- Diagnostic criteria and workup
- Treatment recommendations
- Disposition criteria (who goes to ED, who can be discharged, etc.)
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
    messages: [{
      role:    "user",
      content: `Document: ${documentTitle}\nType: ${documentType}\nTotal pages: ${totalPages}\n\nDocument text (first 8000 words):\n${words.slice(0, 8000).join(" ")}\n\nBuild a hierarchical index tree. Return JSON:\n{\n  "id": "root",\n  "title": "${documentTitle}",\n  "summary": "overall document summary and what questions it answers",\n  "pages": [1, ${totalPages}],\n  "depth": 0,\n  "children": [...]\n}`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();

  let tree: DocumentIndexNode;
  try {
    tree = JSON.parse(clean);
  } catch {
    // Fallback: create a simple flat index
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

  // Store in Postgres for query
  await db.execute(sql`
    INSERT INTO clinical_document_indexes (
      document_id, title, doc_type, source, total_pages, indexed_at, tree_json
    ) VALUES (
      ${documentId}, ${documentTitle}, ${documentType}, ${source},
      ${totalPages}, ${index.indexedAt}, ${JSON.stringify(tree)}
    )
    ON CONFLICT (document_id) DO UPDATE SET
      tree_json   = ${JSON.stringify(tree)},
      indexed_at  = ${index.indexedAt}
  `).catch(console.error);

  await appendAuditEvent({
    actor:      "system",
    action:     "DOCUMENT_INDEXED",
    entityId:   documentId,
    entityType: "document_index",
    details: {
      documentType, source, totalPages,
      treeDepth: countDepth(tree),
      nodeCount: countNodes(tree),
    },
  }).catch(console.error);

  return index;
}

function countDepth(node: DocumentIndexNode): number {
  if (!node.children?.length) return node.depth;
  return Math.max(...node.children.map(countDepth));
}

function countNodes(node: DocumentIndexNode): number {
  return 1 + (node.children ?? []).reduce((sum, c) => sum + countNodes(c), 0);
}

// ─── Step 2: Tree navigation ──────────────────────────────────────────────────
// LLM reads index nodes and reasons which branch to follow.
// This is the core PageIndex insight — structured reasoning over document hierarchy.

async function navigateTree(
  query:   string,
  node:    DocumentIndexNode,
  path:    string[] = []
): Promise<NavigationResult> {
  const currentPath = [...path, node.title];

  // Leaf node — this is a relevant section
  if (!node.children?.length) {
    return {
      nodes:          [node],
      pagesAccessed:  node.pages ? [node.pages[0], node.pages[1]] : [],
      navigationPath: currentPath,
    };
  }

  // Ask the gateway (Sonnet — navigation is fast, doesn't need Opus)
  const childrenSummary = node.children.map((child, i) =>
    `[${i}] ${child.title}: ${child.summary}`
  ).join("\n");

  const gatewayResult = await llmGateway.complete({
    purpose:  "retrieval_pruner",  // Sonnet — navigation is cheap, fast
    messages: [{
      role:    "user",
      content: `Clinical query: "${query}"\n\nCurrent section: ${node.title}\n\nAvailable subsections:\n${childrenSummary}\n\nWhich subsections likely contain the answer? Return JSON: {"indices": [0, 2]} or {"indices": []} if none are relevant and the current section itself is the answer.`,
    }],
    system:   `You are navigating a clinical document index to find sections relevant to a query.
Be precise. Select ONLY subsections that are directly relevant to answering the query.
If the current section itself answers the question (no children are more specific), return {"indices": []}.
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

  // No children selected — current node is the answer
  if (selectedIndices.length === 0) {
    return {
      nodes:          [node],
      pagesAccessed:  node.pages ? [node.pages[0], node.pages[1]] : [],
      navigationPath: currentPath,
    };
  }

  // Recurse into selected branches
  const allNodes:   DocumentIndexNode[] = [];
  const allPages:   number[]            = [];
  const allPaths:   string[]            = currentPath;

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
    navigationPath: allPaths,
  };
}

// ─── Step 3 + 4: Retrieve and answer ─────────────────────────────────────────

export async function queryDocument(
  documentId: string,
  query:      string,
  pageTexts:  Record<number, string>   // page number → full page text
): Promise<DocumentQueryResult> {

  const index = loadIndex(documentId);
  if (!index) {
    throw new Error(`Document index not found for: ${documentId}. Run generateDocumentIndex() first.`);
  }

  // Navigate the tree
  const navigation = await navigateTree(query, index.tree);

  // Retrieve complete page text from identified nodes (unchunked — full pages)
  const retrievedParts: string[] = [];
  const citations:      string[] = [];

  for (const node of navigation.nodes) {
    if (!node.pages) continue;
    const [startPage, endPage] = node.pages;
    for (let p = startPage; p <= Math.min(endPage, startPage + 5); p++) {
      // Limit to 5 pages per node to stay within context
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

  // Generate answer using Opus (clinical accuracy matters here)
  const answerResult = await llmGateway.complete({
    purpose:  "clinical_brain",  // Opus — clinical answer generation
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

  // Assess confidence based on navigation quality
  const confidence: "high" | "moderate" | "low" =
    navigation.nodes.length > 0 && citations.length > 0 ? "high" :
    navigation.nodes.length > 0 ? "moderate" : "low";

  await appendAuditEvent({
    actor:      "system",
    action:     "DOCUMENT_QUERIED",
    entityId:   documentId,
    entityType: "document_index",
    details: {
      documentType:  index.type,
      nodesRetrieved: navigation.nodes.length,
      pagesAccessed: navigation.pagesAccessed.length,
      confidence,
      // query text omitted — may contain clinical specifics
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

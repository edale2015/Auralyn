/**
 * reasoningRetriever.ts — LLM-driven tree navigation and answer extraction
 *
 * Article (Stop Chunking, Start Reasoning):
 *   "Step 2: Agentic retrieval: When a user asks a question, the LLM reads the
 *    tree and follows an iterative loop:
 *    1. identify sections likely to contain the answer
 *    2. retrieve the raw content for the most promising section
 *    3. extract relevant information
 *    4. either answer the question or return to the tree and try another section"
 *
 *   "This is how the model follows a cross-reference like 'see Appendix G'. It reads
 *    the cue, navigates the tree to Appendix G, and retrieves the actual data."
 *
 * Architecture file: "ReasoningRetriever — findRelevantNode(tree, query) → node_id
 *  extractAnswer(content, query) → answer + evidence + confidence"
 *
 * Two modes (for testability and cost control):
 *   AI mode (default): LLM reasons over tree metadata, identifies the best node,
 *     extracts answer with supporting evidence and confidence score
 *   Keyword mode (fallback): TF-IDF-style keyword matching when AI is unavailable
 *     This mode runs in all tests without API calls, returns deterministic results
 *
 * PageIndex vs RAPTOR distinction:
 *   RAPTOR: tree improves the index, but retrieval is still embedding-based
 *   PageIndex/this: tree IS the index, retrieval is reasoning-based — no embeddings at any stage
 *
 * Clinical translation:
 *   Query: "What is the first-line antibiotic for gram-positive sepsis?"
 *   AI navigates: root → TREATMENT → Antimicrobial Therapy → Gram-Positive Coverage
 *   Extracts: "Vancomycin is first-line for suspected MRSA. Dose: 25-30 mg/kg IV."
 *   Evidence: "Table 3 — Empiric Antibiotic Selection"
 *   Confidence: 0.92
 */

import OpenAI from "openai";
import type { DocNode } from "./pageIndexBuilder";
import { PageIndexBuilder } from "./pageIndexBuilder";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetrievalResult {
  nodeId:     string;
  nodeTitle:  string;
  answer:     string;
  evidence:   string;
  confidence: number;    // 0-1
  mode:       "ai" | "keyword";
  reasoning?: string;    // LLM's step-by-step navigation (AI mode only)
}

// ── Lazy OpenAI initialization ─────────────────────────────────────────────────

let _openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  const key     = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!key) return null;
  if (!_openaiClient) {
    _openaiClient = new OpenAI({ apiKey: key, baseURL });
  }
  return _openaiClient;
}

// ── Keyword-based fallback retrieval ─────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
}

const STOP_WORDS = new Set(["the", "and", "for", "that", "this", "with", "are", "was", "has", "have", "from", "not"]);

function scoreNodeKeyword(node: DocNode, queryTokens: string[]): number {
  const titleTokens   = tokenize(node.title);
  const contentTokens = tokenize(node.content ?? node.summary ?? "");
  const nodeTokens    = [...titleTokens, ...contentTokens];
  const uniqueNode    = new Set(nodeTokens.filter((t) => !STOP_WORDS.has(t)));

  let score = 0;
  for (const qt of queryTokens) {
    if (STOP_WORDS.has(qt)) continue;
    if (titleTokens.includes(qt))   score += 3;   // title match worth more
    else if (uniqueNode.has(qt))    score += 1;
  }
  return score;
}

function findBestNodeKeyword(tree: DocNode[], query: string): DocNode | null {
  const queryTokens = tokenize(query).filter((t) => !STOP_WORDS.has(t));
  if (queryTokens.length === 0) return null;

  let best: DocNode | null = null;
  let bestScore = 0;

  for (const node of PageIndexBuilder.flatten(tree)) {
    const score = scoreNodeKeyword(node, queryTokens);
    if (score > bestScore) { bestScore = score; best = node; }
  }

  return bestScore > 0 ? best : null;
}

function extractAnswerKeyword(node: DocNode, query: string): RetrievalResult {
  const content  = node.content ?? node.summary ?? "";
  const queryTok = new Set(tokenize(query).filter((t) => !STOP_WORDS.has(t)));

  // Score each sentence by query overlap
  const sentences = content.split(/[.!?]\s+/).filter((s) => s.length > 20);
  let bestSentence = sentences[0] ?? content.slice(0, 300);
  let bestScore    = 0;

  for (const sent of sentences) {
    const sentTok = tokenize(sent);
    const overlap = sentTok.filter((t) => queryTok.has(t)).length;
    if (overlap > bestScore) { bestScore = overlap; bestSentence = sent; }
  }

  const evidence = sentences
    .filter((s) => s !== bestSentence)
    .filter((s) => tokenize(s).some((t) => queryTok.has(t)))
    .slice(0, 2)
    .join(". ");

  const confidence = Math.min(0.4 + (bestScore / Math.max(queryTok.size, 1)) * 0.4, 0.7);

  return {
    nodeId:    node.node_id,
    nodeTitle: node.title,
    answer:    bestSentence.trim(),
    evidence:  evidence.trim(),
    confidence: Math.round(confidence * 100) / 100,
    mode:      "keyword",
  };
}

// ── AI-based retrieval ────────────────────────────────────────────────────────

function buildTreeMetadataPrompt(tree: DocNode[]): string {
  const lines: string[] = [];
  for (const node of PageIndexBuilder.flatten(tree)) {
    const indent = "  ".repeat(node.depth);
    lines.push(`${indent}node_id: "${node.node_id}" | title: "${node.title}" | summary: "${(node.summary ?? "").slice(0, 150)}"`);
  }
  return lines.join("\n");
}

async function findRelevantNodeAI(tree: DocNode[], query: string): Promise<string | null> {
  const ai = getOpenAI();
  if (!ai) return null;

  const treeStr = buildTreeMetadataPrompt(tree);
  const prompt = `You are a clinical reasoning engine navigating a medical document tree.

Document structure (node_id | title | summary):
${treeStr.slice(0, 12000)}

Clinical question: ${query}

Step 1: Identify which section title most likely contains the answer.
Step 2: Return ONLY the node_id of that section (e.g. "node_0003"). Nothing else.`;

  try {
    const res = await ai.chat.completions.create({
      model:       "gpt-4o",
      messages:    [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens:  20,
    });
    const nodeId = (res.choices[0].message.content ?? "").trim().replace(/[^a-z0-9_]/g, "");
    return nodeId || null;
  } catch {
    return null;
  }
}

async function extractAnswerAI(
  node:  DocNode,
  query: string,
): Promise<RetrievalResult> {
  const ai = getOpenAI();
  if (!ai) return extractAnswerKeyword(node, query);

  const prompt = `You are a clinical expert. Answer the question based ONLY on the text below.

TEXT (from section "${node.title}"):
${(node.content ?? node.summary ?? "").slice(0, 8000)}

QUESTION: ${query}

Return JSON:
{
  "answer": "...",
  "evidence": "...",
  "confidence": 0.0-1.0,
  "reasoning": "step-by-step navigation reasoning"
}`;

  try {
    const res = await ai.chat.completions.create({
      model:           "gpt-4o",
      messages:        [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
    return {
      nodeId:     node.node_id,
      nodeTitle:  node.title,
      answer:     parsed.answer    ?? "No answer found in this section.",
      evidence:   parsed.evidence  ?? "",
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
      reasoning:  parsed.reasoning,
      mode:       "ai",
    };
  } catch {
    return extractAnswerKeyword(node, query);
  }
}

// ── ReasoningRetriever ────────────────────────────────────────────────────────

export class ReasoningRetriever {
  async findRelevantNode(tree: DocNode[], query: string): Promise<string | null> {
    // Try AI first, fall back to keyword matching
    const aiNodeId = await findRelevantNodeAI(tree, query);
    if (aiNodeId) return aiNodeId;

    const keywordNode = findBestNodeKeyword(tree, query);
    return keywordNode?.node_id ?? null;
  }

  async extractAnswer(node: DocNode, query: string): Promise<RetrievalResult> {
    const ai = getOpenAI();
    return ai
      ? extractAnswerAI(node, query)
      : extractAnswerKeyword(node, query);
  }

  // Deterministic keyword mode (for tests, no AI calls)
  extractAnswerSync(node: DocNode, query: string): RetrievalResult {
    return extractAnswerKeyword(node, query);
  }

  findRelevantNodeSync(tree: DocNode[], query: string): string | null {
    return findBestNodeKeyword(tree, query)?.node_id ?? null;
  }
}

/**
 * retrievalAgent.ts — Adaptive/Agentic retrieval decision layer
 *
 * Article: "The agent is the retrieval system — it decides when to search,
 *  which strategy to use, grades its own results, and loops back if the answer
 *  is not grounded."
 *
 * Article (MCP): "Retrieval becomes just another tool the agent can invoke
 *  strategically, rather than a fixed step that runs on every query.
 *  The agent decides whether to retrieve at all. This is the core of adaptive
 *  RAG — the model participates in retrieval decisions instead of retrieval
 *  happening to it."
 *
 * Three decision paths:
 *   NO_RETRIEVE   → question can be answered from clinical constants (e.g. "what is sepsis?")
 *   KEYWORD_ONLY  → structured factual query, keyword search sufficient
 *   FULL_CRAG     → complex clinical reasoning, needs hybrid + CRAG loop
 *
 * Embedding generation:
 *   Uses OpenAI text-embedding-3-small for query embeddings.
 *   Falls back to null (keyword-only) when AI unavailable.
 *
 * Control Tower integration:
 *   Every query + decision + result is returned in a structured trace for
 *   the "Document Intelligence Panel" — so physicians can see WHY the engine
 *   chose a retrieval strategy.
 */

import OpenAI from "openai";
import { cragQuery, type CRAGResult } from "./cragEngine";
import { keywordRetrieve } from "./hybridRetriever";
import { checkCache, storeCache } from "../cache/semanticCache";
import { evaluateAndStore } from "../eval/ragEvaluator";

// ── OpenAI lazy init ──────────────────────────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) return null;
  if (!_openai) _openai = new OpenAI({ apiKey: key, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
  return _openai;
}

// ── Embedding ─────────────────────────────────────────────────────────────────

export async function embedQuery(query: string): Promise<number[] | null> {
  const ai = getOpenAI();
  if (!ai) return null;

  try {
    const res = await ai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    return res.data[0].embedding;
  } catch {
    return null;
  }
}

// ── Retrieval decision heuristics ─────────────────────────────────────────────

export type RetrievalDecision = "NO_RETRIEVE" | "KEYWORD_ONLY" | "FULL_CRAG";

// Questions answerable from clinical constants — no retrieval needed
const NO_RETRIEVE_PATTERNS = [
  /^what (is|are) (sepsis|sofa|news2|qsofa|curb[-\s]?65|wells|heart score)/i,
  /^define /i,
  /^what does .{2,30} stand for/i,
  /^(hello|hi|how are you)/i,
  /^who (are|is) you/i,
];

// Structured factual queries — keyword sufficient, skip embedding
const KEYWORD_PATTERNS = [
  /\b(dose|dosage|mg\/kg|mg per|mcg|units)\b/i,
  /contraindic/i,
  /\b(avoid|do not use)\b/i,
  /\b(first.line|second.line|empiric)\b/i,
];

function decideRetrievalStrategy(question: string): RetrievalDecision {
  for (const p of NO_RETRIEVE_PATTERNS) {
    if (p.test(question)) return "NO_RETRIEVE";
  }
  for (const p of KEYWORD_PATTERNS) {
    if (p.test(question)) return "KEYWORD_ONLY";
  }
  return "FULL_CRAG";
}

// ── AI-based retrieval decision (optional) ────────────────────────────────────

async function shouldRetrieveAI(question: string): Promise<boolean> {
  const ai = getOpenAI();
  if (!ai) return true; // default: retrieve

  try {
    const res = await ai.chat.completions.create({
      model:    "gpt-4o",
      messages: [
        { role: "system", content: "Does this question require searching external clinical knowledge? Reply only 'yes' or 'no'." },
        { role: "user",   content: question },
      ],
      max_tokens:  5,
      temperature: 0,
    });
    return !(res.choices[0].message.content?.toLowerCase().includes("no") ?? false);
  } catch {
    return true;
  }
}

// ── Direct answer (no retrieval) ──────────────────────────────────────────────

function directAnswer(question: string): string {
  const q = question.toLowerCase();
  if (/sepsis/.test(q)) return "Sepsis is life-threatening organ dysfunction caused by a dysregulated host response to infection. Diagnosed using qSOFA (≥2 criteria: RR≥22, AMS, SBP<100) or SOFA score increase ≥2.";
  if (/sofa/.test(q))   return "SOFA (Sequential Organ Failure Assessment) scores organ dysfunction across 6 systems: respiration, coagulation, liver, cardiovascular, CNS, and renal. Score ≥2 suggests organ dysfunction.";
  if (/news2/.test(q))  return "NEWS2 (National Early Warning Score 2) assesses respiration rate, oxygen saturation, supplemental O2, temperature, systolic BP, heart rate, and level of consciousness. Score ≥7 requires urgent response.";
  if (/curb/.test(q))   return "CURB-65 scores community-acquired pneumonia severity: Confusion, Urea >7mmol/L, Respiratory rate ≥30, BP <90/60mmHg, Age ≥65. Score 0-1: outpatient; 2: inpatient; 3-5: ICU.";
  return "I can answer this question directly without retrieval based on clinical knowledge.";
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentQueryResult {
  question:    string;
  answer:      string;
  decision:    RetrievalDecision;
  cacheHit:    boolean;
  mode:        "ai" | "keyword" | "direct";
  confidence:  number;
  docsUsed:    number;
  evalId?:     number;
  trace:       string[];
}

// ── Main adaptive retrieval agent ─────────────────────────────────────────────

export async function retrievalAgent(
  question:     string,
  options: {
    skipCache?:    boolean;
    skipEval?:     boolean;
    groundTruth?:  string;
    forceKeyword?: boolean;
  } = {},
): Promise<AgentQueryResult> {
  const trace: string[] = [];

  // Step 1: decide retrieval strategy
  const decision = decideRetrievalStrategy(question);
  trace.push(`[1] Decision: ${decision}`);

  // Step 2: direct answer path
  if (decision === "NO_RETRIEVE") {
    const answer = directAnswer(question);
    trace.push("[2] Direct answer — no retrieval needed");
    return { question, answer, decision, cacheHit: false, mode: "direct", confidence: 0.9, docsUsed: 0, trace };
  }

  // Step 3: embed query
  const embedding = options.forceKeyword ? null : await embedQuery(question);
  trace.push(`[3] Embedding: ${embedding ? `${embedding.length}d vector` : "not available (keyword mode)"}`);

  // Step 4: check semantic cache
  if (!options.skipCache && embedding) {
    const cached = await checkCache(question, embedding);
    if (cached) {
      trace.push("[4] Cache HIT — returning cached answer");
      return { question, answer: cached, decision, cacheHit: true, mode: "ai", confidence: 0.95, docsUsed: 0, trace };
    }
    trace.push("[4] Cache MISS — proceeding to retrieval");
  }

  // Step 5: retrieve + generate
  let cragResult: CRAGResult;

  if (decision === "KEYWORD_ONLY") {
    const docs   = await keywordRetrieve(question, 5);
    trace.push(`[5] Keyword retrieval — ${docs.length} docs`);
    const answer = docs.length > 0
      ? docs.map((d) => d.content.slice(0, 300)).join("\n").slice(0, 800)
      : "No relevant documents found.";
    cragResult = {
      answer,
      grounded:       true,
      iterations:     1,
      relevanceScore: docs.length > 0 ? 0.7 : 0,
      faithfulScore:  0.7,
      mode:           "keyword",
      docs,
    };
  } else {
    trace.push("[5] CRAG loop starting (hybrid retrieval + self-correction)");
    cragResult = await cragQuery(question, embedding, options.forceKeyword);
    trace.push(`[5] CRAG complete — ${cragResult.iterations} iterations, faithful=${cragResult.faithfulScore}`);
  }

  // Step 6: store in semantic cache
  if (!options.skipCache && embedding && cragResult.answer) {
    await storeCache(question, embedding, cragResult.answer);
    trace.push("[6] Answer stored in semantic cache");
  }

  // Step 7: evaluate + store metrics
  let evalId: number | undefined;
  if (!options.skipEval && cragResult.docs.length > 0) {
    const evalResult = await evaluateAndStore({
      question,
      answer:         cragResult.answer,
      contexts:       cragResult.docs.map((d) => d.content),
      groundTruth:    options.groundTruth,
      retrievalCount: cragResult.docs.length,
      cacheHit:       false,
    });
    evalId = evalResult.id;
    trace.push(`[7] Eval stored — faithful=${evalResult.faithfulness}, relevancy=${evalResult.answerRelevancy}`);
  }

  const confidence = Math.min(0.99, (cragResult.relevanceScore + cragResult.faithfulScore) / 2 + 0.1);

  return {
    question,
    answer:     cragResult.answer,
    decision,
    cacheHit:   false,
    mode:       cragResult.mode,
    confidence: Math.round(confidence * 100) / 100,
    docsUsed:   cragResult.docs.length,
    evalId,
    trace,
  };
}

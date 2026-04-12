/**
 * agenticRAGPipeline.ts — Full Agentic RAG state graph
 *
 * Article architecture (§ "Agentic RAG - Code Implementation"):
 *
 *   query → Router (LLM classifies: clinical_guidelines | drug_protocols |
 *                   device_manuals | case_studies | web_search)
 *         → Retrieve (chosen collection)
 *         → Relevance_Checker (LLM Yes/No)
 *         → if Yes: Augment → Generate → END
 *         → if No: Web_Search → Relevance_Checker (loop, max 3 iterations)
 *
 * vs. Traditional RAG (also provided for comparison):
 *   query → Retrieve (single collection) → Augment → Generate → END
 *
 * Key differences from existing CDE (clinicalDecisionEngine.ts):
 *   - LLM router (vs. keyword heuristics)
 *   - Named collection targeting (vs. fixed 3 DB sources)
 *   - Explicit Yes/No relevance gate (vs. TF-IDF score threshold)
 *   - Web search fallback with iteration cap (vs. no fallback)
 *   - Full execution trace for audit/comparison
 */

import OpenAI from "openai";
import {
  queryCollection, type CollectionName, type RAGQueryResult,
} from "./ragCollectionStore";
import { checkRelevance, type RelevanceCheckResult } from "./llmRelevanceChecker";
import { searchWeb, type WebSearchResult }           from "./webSearchFallback";

// ── Types ────────────────────────────────────────────────────────────────────

export type RAGSource = CollectionName | "web_search";

export interface RAGGraphState {
  query:          string;
  source:         RAGSource | null;
  context:        string;
  retrievedChunks: RAGQueryResult[];
  isRelevant:     boolean | null;
  iterationCount: number;
  prompt:         string;
  response:       string;
  webResult?:     WebSearchResult;
  executionTrace: RAGTraceStep[];
  totalLatencyMs: number;
  error?:         string;
}

export interface RAGTraceStep {
  node:    string;
  at:      string;
  summary: Record<string, unknown>;
}

export interface AgenticRAGResult {
  query:    string;
  response: string;
  source:   RAGSource | null;
  relevant: boolean | null;
  iterations: number;
  trace:    RAGTraceStep[];
  latencyMs: number;
  mode:     "agentic" | "simple";
}

// ── OpenAI lazy init ──────────────────────────────────────────────────────────

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (_client) return _client;
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) return null;
  _client = new OpenAI({
    apiKey:  key,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  });
  return _client;
}

// ── LLM-based Router ─────────────────────────────────────────────────────────
// Article: "You are a routing agent. Based on the user query, decide where to look."

const ROUTER_PROMPT = (query: string) => `
You are a clinical knowledge routing agent. Based on the user query, decide 
which knowledge source to search first.

Sources:
- clinical_guidelines: if the query is about treatment protocols, clinical criteria, 
  diagnosis, triage, emergency management, or evidence-based guidelines.
- drug_protocols: if the query is about medication dosing, drug interactions, 
  pharmacology, prescribing, or contraindications.
- device_manuals: if the query is about medical devices, equipment operation, 
  specifications, or device indications/contraindications.
- case_studies: if the query is about specific patient scenarios or clinical cases.
- web_search: if the query is about recent news, regulatory updates, current events, 
  tariffs, new drug approvals, or topics unlikely in a clinical reference database.

Query: "${query}"

Respond with ONLY one of: clinical_guidelines, drug_protocols, device_manuals, case_studies, web_search
`.trim();

const SOURCE_KEYWORDS: Record<RAGSource, string[]> = {
  clinical_guidelines: ["treatment", "protocol", "guideline", "criteria", "diagnosis", "manage", "triage", "sepsis", "stroke", "chest pain", "emergency"],
  drug_protocols:      ["drug", "medication", "dose", "dosing", "mg", "mcg", "antibiotic", "antiviral", "contraindicated", "interaction", "prescribe", "pharmacy"],
  device_manuals:      ["device", "machine", "ventilator", "defibrillator", "monitor", "equipment", "pump", "ultrasound", "ecg", "dialysis"],
  case_studies:        ["case", "patient", "presented", "year old", "yo male", "yo female", "history", "admitted", "scenario"],
  web_search:          ["news", "tariff", "export", "2025", "recent", "latest", "new approval", "fda approved", "current"],
};

function heuristicRoute(query: string): RAGSource {
  const q = query.toLowerCase();
  let best: RAGSource = "clinical_guidelines";
  let bestScore = 0;
  for (const [src, keywords] of Object.entries(SOURCE_KEYWORDS) as [RAGSource, string[]][]) {
    const score = keywords.filter((k) => q.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = src; }
  }
  return best;
}

async function routeQuery(query: string): Promise<{ source: RAGSource; method: "llm" | "heuristic" }> {
  const client = getClient();
  if (!client) return { source: heuristicRoute(query), method: "heuristic" };

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: ROUTER_PROMPT(query) }],
      max_tokens: 20,
      temperature: 0,
    });
    const raw = (resp.choices[0]?.message?.content ?? "").trim().toLowerCase().replace(/[^a-z_]/g, "");
    const valid: RAGSource[] = ["clinical_guidelines", "drug_protocols", "device_manuals", "case_studies", "web_search"];
    const source = valid.find((v) => raw.includes(v)) ?? heuristicRoute(query);
    return { source, method: "llm" };
  } catch {
    return { source: heuristicRoute(query), method: "heuristic" };
  }
}

// ── LLM Generator ────────────────────────────────────────────────────────────

const GENERATE_PROMPT = (context: string, query: string) => `
Answer the following clinical query using the retrieved context below.
Context:
${context.slice(0, 2000)}
Query: ${query}
Provide a concise, evidence-based answer in 100 words or fewer. 
If the context does not fully answer the question, state what is known and what requires further lookup.
`.trim();

async function generateResponse(context: string, query: string): Promise<string> {
  const client = getClient();
  if (!client) {
    // Offline fallback: extract first relevant sentence from context
    const sentences = context.split(/[.!?]/).filter((s) => s.trim().length > 20);
    return sentences.slice(0, 3).join(". ").trim() || "No clinical context available for this query.";
  }
  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: GENERATE_PROMPT(context, query) }],
      max_tokens: 200,
      temperature: 0.2,
    });
    return resp.choices[0]?.message?.content?.trim() ?? "Unable to generate response.";
  } catch {
    const sentences = context.split(/[.!?]/).filter((s) => s.trim().length > 20);
    return sentences.slice(0, 3).join(". ").trim() || "No clinical context available for this query.";
  }
}

// ── Pipeline nodes ────────────────────────────────────────────────────────────

function trace(state: RAGGraphState, node: string, summary: Record<string, unknown>): void {
  state.executionTrace.push({ node, at: new Date().toISOString(), summary });
}

async function nodeRouter(state: RAGGraphState): Promise<void> {
  const { source, method } = await routeQuery(state.query);
  state.source = source;
  trace(state, "Router", { decision: source, method });
}

async function nodeRetrieve(state: RAGGraphState): Promise<void> {
  if (state.source === "web_search") {
    await nodeWebSearch(state);
    return;
  }
  const results = queryCollection(state.source as CollectionName, state.query, 3);
  state.retrievedChunks = results;
  state.context         = results.map((r) => r.chunk.text).join("\n\n");
  trace(state, `Retrieve_${state.source}`, {
    collection: state.source,
    chunksFound: results.length,
    topScore:    results[0]?.score ?? 0,
    preview:     state.context.slice(0, 100),
  });
}

async function nodeWebSearch(state: RAGGraphState): Promise<void> {
  const result = await searchWeb(state.query);
  state.webResult = result;
  state.context   = result.context;
  state.source    = "web_search";
  trace(state, "Web_Search", {
    source:    result.source,
    snippets:  result.snippets.length,
    latencyMs: result.latencyMs,
  });
}

async function nodeRelevanceChecker(state: RAGGraphState): Promise<RelevanceCheckResult> {
  const result = await checkRelevance(state.query, state.context);
  state.isRelevant      = result.relevant;
  state.iterationCount += 1;

  // Article: "Limiting to max 3 iterations"
  if (state.iterationCount >= 3 && !result.relevant) {
    state.isRelevant = true; // Force proceed after max iterations
    trace(state, "Relevance_Checker", { forced: true, reason: "max_iterations_reached", iterations: state.iterationCount });
    return { ...result, relevant: true };
  }

  trace(state, "Relevance_Checker", {
    relevant:    result.relevant,
    method:      result.method,
    confidence:  result.confidence,
    iteration:   state.iterationCount,
  });
  return result;
}

async function nodeAugment(state: RAGGraphState): Promise<void> {
  state.prompt = GENERATE_PROMPT(state.context, state.query);
  trace(state, "Augment", { promptLength: state.prompt.length });
}

async function nodeGenerate(state: RAGGraphState): Promise<void> {
  state.response = await generateResponse(state.context, state.query);
  trace(state, "Generate", { responseLength: state.response.length, preview: state.response.slice(0, 80) });
}

// ── Agentic RAG pipeline ──────────────────────────────────────────────────────

export async function runAgenticRAG(query: string): Promise<AgenticRAGResult> {
  const t0    = Date.now();
  const state: RAGGraphState = {
    query,
    source:         null,
    context:        "",
    retrievedChunks: [],
    isRelevant:     null,
    iterationCount: 0,
    prompt:         "",
    response:       "",
    executionTrace: [],
    totalLatencyMs: 0,
  };

  try {
    // Step 1: Route
    await nodeRouter(state);

    // Step 2: Retrieve from chosen source
    await nodeRetrieve(state);

    // Step 3-4: Relevance check → fallback loop
    let relevant = await nodeRelevanceChecker(state);
    while (!relevant.relevant && state.iterationCount < 3) {
      await nodeWebSearch(state);
      relevant = await nodeRelevanceChecker(state);
    }

    // Step 5: Augment + Generate
    await nodeAugment(state);
    await nodeGenerate(state);

  } catch (err: unknown) {
    state.error    = err instanceof Error ? err.message : String(err);
    state.response = "Pipeline error — please retry.";
    state.executionTrace.push({ node: "ERROR", at: new Date().toISOString(), summary: { error: state.error } });
  }

  state.totalLatencyMs = Date.now() - t0;
  return {
    query,
    response:   state.response,
    source:     state.source,
    relevant:   state.isRelevant,
    iterations: state.iterationCount,
    trace:      state.executionTrace,
    latencyMs:  state.totalLatencyMs,
    mode:       "agentic",
  };
}

// ── Traditional RAG pipeline (for comparison) ─────────────────────────────────
// Article: "Simple RAG: Query → Retrieve → Prompt Building → Generate"

export async function runSimpleRAG(
  query:      string,
  collection: CollectionName = "clinical_guidelines"
): Promise<AgenticRAGResult> {
  const t0    = Date.now();
  const trace: RAGTraceStep[] = [];

  // 1. Retrieve
  trace.push({ node: "Retriever", at: new Date().toISOString(), summary: { collection } });
  const results  = queryCollection(collection, query, 3);
  const context  = results.map((r) => r.chunk.text).join("\n\n");
  trace.push({ node: "Augment",   at: new Date().toISOString(), summary: { chunksFound: results.length } });

  // 2. Generate (no routing, no relevance check)
  const response = await generateResponse(context, query);
  trace.push({ node: "Generate",  at: new Date().toISOString(), summary: { responseLength: response.length } });

  return {
    query,
    response,
    source:     collection,
    relevant:   null,   // simple RAG doesn't check relevance
    iterations: 0,
    trace,
    latencyMs:  Date.now() - t0,
    mode:       "simple",
  };
}

// ── Compare both pipelines on same query ──────────────────────────────────────

export async function compareRAGPipelines(query: string): Promise<{
  simple:  AgenticRAGResult;
  agentic: AgenticRAGResult;
  queryHandled: boolean;
  addedValueFromAgentic: string;
}> {
  const [simple, agentic] = await Promise.all([
    runSimpleRAG(query),
    runAgenticRAG(query),
  ]);

  const agenticUsedWebSearch = agentic.source === "web_search";
  const fallbackTriggered    = agentic.iterations > 1;

  return {
    simple,
    agentic,
    queryHandled: agentic.response.length > 10,
    addedValueFromAgentic: agenticUsedWebSearch
      ? "Agentic RAG fell back to web search — out-of-scope query handled, simple RAG would have hallucinated."
      : fallbackTriggered
        ? `Agentic RAG triggered relevance fallback (${agentic.iterations} iterations) to find relevant context.`
        : "Query was in-scope for both pipelines; agentic RAG validated context relevance before answering.",
  };
}

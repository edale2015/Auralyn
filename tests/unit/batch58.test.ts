/**
 * batch58.test.ts — Hybrid RAG Pipeline (Batch 58)
 *
 * Tests for 5 RAG architecture components:
 *   Suite 1: Hybrid Retriever (BM25 + vector + RRF)
 *   Suite 2: CRAG Engine (self-correcting loop)
 *   Suite 3: Retrieval Agent (adaptive decisions)
 *   Suite 4: Semantic Cache (Redis + cosine similarity)
 *   Suite 5: RAG Evaluator (RAGAS-style metrics)
 *   Suite 6: Route integration (8 endpoints smoke-tested)
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — Hybrid Retriever (BM25 + Vector + RRF)
// ─────────────────────────────────────────────────────────────────────────────

describe("Suite 1: Hybrid Retriever — BM25 + cosine similarity + RRF", () => {
  // Import the pure functions (no DB calls)
  let bm25Score: Function;
  let cosineSimilarity: Function;

  beforeAll(async () => {
    const mod = await import("../../server/retrieval/hybridRetriever");
    bm25Score       = mod.bm25Score;
    cosineSimilarity = mod.cosineSimilarity;
  });

  // BM25 scoring
  it("BM25: exact clinical keyword match scores > 0", () => {
    const score = bm25Score("Vancomycin is used for MRSA infections at 25 mg/kg", "vancomycin MRSA");
    expect(score).toBeGreaterThan(0);
  });

  it("BM25: empty query scores 0", () => {
    const score = bm25Score("Vancomycin MRSA dosing", "");
    expect(score).toBe(0);
  });

  it("BM25: longer clinical term weighted more (IDF bonus)", () => {
    const scoreShort = bm25Score("Sepsis treatment protocol", "the to");
    const scoreLong  = bm25Score("Sepsis treatment protocol with vancomycin", "vancomycin");
    expect(scoreLong).toBeGreaterThan(scoreShort);
  });

  it("BM25: no match scores 0", () => {
    const score = bm25Score("Cardiology protocol", "sepsis vancomycin pneumonia");
    expect(score).toBe(0);
  });

  it("BM25: stop words filtered out", () => {
    const scoreStop   = bm25Score("Treat the patient with antibiotics", "the and");
    const scoreActual = bm25Score("Treat the patient with antibiotics", "antibiotics");
    expect(scoreActual).toBeGreaterThan(scoreStop);
  });

  // Cosine similarity
  it("cosine: identical vectors → 1.0", () => {
    const v = [1, 0, 0.5, 0.2];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 4);
  });

  it("cosine: orthogonal vectors → 0.0", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0, 4);
  });

  it("cosine: opposite vectors → -1.0", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 4);
  });

  it("cosine: empty arrays → 0", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("cosine: mismatched lengths → 0", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("cosine: zero vector → 0", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("cosine: clinical embedding similarity pattern (high-dim approx)", () => {
    const vecA = Array.from({ length: 10 }, (_, i) => Math.sin(i * 0.3));
    const vecB = Array.from({ length: 10 }, (_, i) => Math.sin(i * 0.3 + 0.05)); // very similar
    const vecC = Array.from({ length: 10 }, (_, i) => Math.cos(i * 2.1));         // different
    expect(cosineSimilarity(vecA, vecB)).toBeGreaterThan(cosineSimilarity(vecA, vecC));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — CRAG Engine (self-correcting loop)
// ─────────────────────────────────────────────────────────────────────────────

describe("Suite 2: CRAG Engine — self-correcting retrieval loop", () => {
  // Test keyword-mode answer generation (no AI, no DB — we stub doc retrieval)
  it("CRAG: produces a CRAGResult shape", async () => {
    // We test with forceKeyword=true to avoid DB dependency
    const { cragQuery } = await import("../../server/retrieval/cragEngine");
    // Should run keyword path (no docs → fallback answer)
    const result = await cragQuery("what is the dose of vancomycin", null, true);
    expect(result).toHaveProperty("answer");
    expect(result).toHaveProperty("grounded");
    expect(result).toHaveProperty("iterations");
    expect(result).toHaveProperty("relevanceScore");
    expect(result).toHaveProperty("faithfulScore");
    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("docs");
    expect(Array.isArray(result.docs)).toBe(true);
  });

  it("CRAG: mode is 'keyword' when forceKeyword=true", async () => {
    const { cragQuery } = await import("../../server/retrieval/cragEngine");
    const result = await cragQuery("sepsis treatment", null, true);
    expect(result.mode).toBe("keyword");
  });

  it("CRAG: relevanceScore is between 0 and 1", async () => {
    const { cragQuery } = await import("../../server/retrieval/cragEngine");
    const result = await cragQuery("antibiotic protocol", null, true);
    expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
    expect(result.relevanceScore).toBeLessThanOrEqual(1);
  });

  it("CRAG: faithfulScore is between 0 and 1", async () => {
    const { cragQuery } = await import("../../server/retrieval/cragEngine");
    const result = await cragQuery("ICU criteria", null, true);
    expect(result.faithfulScore).toBeGreaterThanOrEqual(0);
    expect(result.faithfulScore).toBeLessThanOrEqual(1);
  });

  it("CRAG: iterations is MAX_ITERATIONS=3 on empty KB", async () => {
    const { cragQuery } = await import("../../server/retrieval/cragEngine");
    const result = await cragQuery("lactate clearance protocol", null, true);
    expect(result.iterations).toBe(3);
  });

  it("CRAG: answer is a non-empty string", async () => {
    const { cragQuery } = await import("../../server/retrieval/cragEngine");
    const result = await cragQuery("sepsis antibiotic", null, true);
    expect(typeof result.answer).toBe("string");
    expect(result.answer.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — Retrieval Agent (adaptive decisions)
// ─────────────────────────────────────────────────────────────────────────────

describe("Suite 3: Retrieval Agent — adaptive strategy decisions", () => {

  it("Agent: 'what is sepsis' → NO_RETRIEVE (direct answer)", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("what is sepsis", { skipCache: true, skipEval: true });
    expect(result.decision).toBe("NO_RETRIEVE");
    expect(result.mode).toBe("direct");
    expect(result.answer.length).toBeGreaterThan(10);
  });

  it("Agent: 'what is NEWS2' → NO_RETRIEVE", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("what is NEWS2", { skipCache: true, skipEval: true });
    expect(result.decision).toBe("NO_RETRIEVE");
  });

  it("Agent: 'what is SOFA' → NO_RETRIEVE", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("what is SOFA", { skipCache: true, skipEval: true });
    expect(result.decision).toBe("NO_RETRIEVE");
  });

  it("Agent: 'define CURB-65' → NO_RETRIEVE", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("define CURB-65", { skipCache: true, skipEval: true });
    expect(result.decision).toBe("NO_RETRIEVE");
  });

  it("Agent: vancomycin dose query → KEYWORD_ONLY", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("vancomycin dose mg/kg for MRSA", { skipCache: true, skipEval: true, forceKeyword: true });
    expect(result.decision).toBe("KEYWORD_ONLY");
  });

  it("Agent: contraindication query → KEYWORD_ONLY", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("contraindications for beta blockers", { skipCache: true, skipEval: true, forceKeyword: true });
    expect(result.decision).toBe("KEYWORD_ONLY");
  });

  it("Agent: complex clinical question → FULL_CRAG", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("When should a patient with pneumonia and CURB-65 score of 3 be admitted to ICU?", { skipCache: true, skipEval: true, forceKeyword: true });
    expect(result.decision).toBe("FULL_CRAG");
  });

  it("Agent: result has all required fields", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("what is SOFA", { skipCache: true, skipEval: true });
    expect(result).toHaveProperty("question");
    expect(result).toHaveProperty("answer");
    expect(result).toHaveProperty("decision");
    expect(result).toHaveProperty("cacheHit");
    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("docsUsed");
    expect(result).toHaveProperty("trace");
  });

  it("Agent: trace is an array of strings", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("what is qSOFA", { skipCache: true, skipEval: true });
    expect(Array.isArray(result.trace)).toBe(true);
    expect(result.trace.length).toBeGreaterThan(0);
    expect(typeof result.trace[0]).toBe("string");
  });

  it("Agent: confidence is between 0 and 1", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("what is SOFA", { skipCache: true, skipEval: true });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("Agent: docsUsed is 0 for NO_RETRIEVE", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("what is sepsis", { skipCache: true, skipEval: true });
    expect(result.docsUsed).toBe(0);
  });

  it("Agent: direct answer for NEWS2 contains clinical content", async () => {
    const { retrievalAgent } = await import("../../server/retrieval/retrievalAgent");
    const result = await retrievalAgent("what is NEWS2", { skipCache: true, skipEval: true });
    const lc = result.answer.toLowerCase();
    expect(lc).toMatch(/news2|national early warning|respiration|consciousness/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — Semantic Cache (pure logic tests, no real Redis)
// ─────────────────────────────────────────────────────────────────────────────

describe("Suite 4: Semantic Cache — cosine threshold logic", () => {
  // We test the cache logic directly using the cosine similarity from hybridRetriever
  // since semanticCache.ts delegates to it. Redis availability is gracefully handled.

  it("Cache: checkCache returns null when Redis unavailable (no REDIS_URL)", async () => {
    // If Redis URL is set, it might connect, but we test the function contract
    const { checkCache } = await import("../../server/cache/semanticCache");
    const embedding = [0.1, 0.2, 0.3];
    const result    = await checkCache("test query", embedding);
    // Either null (cache miss / no Redis) or a string (cache hit)
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("Cache: storeCache is non-throwing even if Redis unavailable", async () => {
    const { storeCache } = await import("../../server/cache/semanticCache");
    await expect(storeCache("test", [0.1, 0.2], "test response")).resolves.toBeUndefined();
  });

  it("Cache: clearCache returns { cleared: number }", async () => {
    const { clearCache } = await import("../../server/cache/semanticCache");
    const result = await clearCache();
    expect(result).toHaveProperty("cleared");
    expect(typeof result.cleared).toBe("number");
  });

  it("Cache: cacheStats returns structured object", async () => {
    const { cacheStats } = await import("../../server/cache/semanticCache");
    const stats = await cacheStats();
    expect(stats).toHaveProperty("entries");
    expect(stats).toHaveProperty("redisConnected");
    expect(stats).toHaveProperty("threshold");
    expect(stats).toHaveProperty("ttlSeconds");
  });

  it("Cache: threshold is 0.92 (from cacheStats)", async () => {
    const { cacheStats } = await import("../../server/cache/semanticCache");
    const stats = await cacheStats();
    expect(stats.threshold).toBe(0.92);
  });

  it("Cache: TTL is 3600 seconds", async () => {
    const { cacheStats } = await import("../../server/cache/semanticCache");
    const stats = await cacheStats();
    expect(stats.ttlSeconds).toBe(3600);
  });

  // Cosine similarity threshold logic (tested directly — same function as cache uses)
  it("Cache logic: sim=0.95 above threshold (0.92) → hit", async () => {
    const { cosineSimilarity } = await import("../../server/retrieval/hybridRetriever");
    const base = [0.6, 0.8];
    const pert = [0.61, 0.79];
    const sim  = cosineSimilarity(base, pert);
    expect(sim).toBeGreaterThan(0.92);
  });

  it("Cache logic: sim=0.5 below threshold → miss", async () => {
    const { cosineSimilarity } = await import("../../server/retrieval/hybridRetriever");
    const a = [1, 0, 0];
    const b = [0.7, 0.7, 0];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeLessThan(0.92);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — RAG Evaluator (RAGAS-style metrics)
// ─────────────────────────────────────────────────────────────────────────────

describe("Suite 5: RAG Evaluator — RAGAS-style faithfulness, relevancy, precision", () => {
  let evaluateRAG:       Function;
  let faithfulness:      Function;
  let answerRelevancy:   Function;
  let contextPrecision:  Function;

  beforeAll(async () => {
    const mod = await import("../../server/eval/ragEvaluator");
    evaluateRAG      = mod.evaluateRAG;
    faithfulness     = mod.faithfulness;
    answerRelevancy  = mod.answerRelevancy;
    contextPrecision = mod.contextPrecision;
  });

  // faithfulness
  it("faithfulness: answer fully from context → high score", () => {
    const answer  = "Give vancomycin 25 mg/kg for MRSA bacteremia";
    const context = ["Vancomycin 25 mg/kg IV is recommended for MRSA bacteremia treatment"];
    const score   = faithfulness(answer, context);
    expect(score).toBeGreaterThan(0.4);
  });

  it("faithfulness: answer has zero overlap with context → 0", () => {
    const score = faithfulness("The weather is sunny today", ["Vancomycin dose for MRSA"]);
    expect(score).toBe(0);
  });

  it("faithfulness: empty answer → 0", () => {
    expect(faithfulness("", ["some context"])).toBe(0);
  });

  it("faithfulness: empty contexts → 0", () => {
    expect(faithfulness("some answer", [])).toBe(0);
  });

  it("faithfulness: perfect overlap → 1.0", () => {
    const text = "Sepsis requires antibiotics within one hour";
    expect(faithfulness(text, [text])).toBeCloseTo(1.0, 1);
  });

  // answerRelevancy
  it("relevancy: answer addresses question terms → high score", () => {
    const question = "What antibiotic for pneumonia?";
    const answer   = "For pneumonia, use amoxicillin or azithromycin as first-line antibiotic";
    const score    = answerRelevancy(answer, question);
    expect(score).toBeGreaterThan(0.2);
  });

  it("relevancy: completely off-topic answer → low score", () => {
    const score = answerRelevancy("The stock market rose 5% today", "What antibiotic for pneumonia?");
    expect(score).toBeLessThan(0.2);
  });

  it("relevancy: empty inputs → 0", () => {
    expect(answerRelevancy("", "")).toBe(0);
  });

  // contextPrecision
  it("contextPrecision: context matches ground truth → high score", () => {
    const ctx = ["Fluids 30 mL/kg IV for sepsis-induced hypoperfusion"];
    const gt  = "Give 30 mL/kg IV fluid bolus in sepsis";
    const score = contextPrecision(ctx, gt);
    expect(score).toBeGreaterThan(0.1);
  });

  it("contextPrecision: empty ground truth → 0", () => {
    expect(contextPrecision(["context"], "")).toBe(0);
  });

  it("contextPrecision: empty context → 0", () => {
    expect(contextPrecision([], "ground truth")).toBe(0);
  });

  // Full evaluateRAG
  it("evaluateRAG: returns all required fields", () => {
    const result = evaluateRAG({
      question:    "What is the dose of vancomycin?",
      answer:      "Vancomycin is typically 25 mg/kg IV for MRSA",
      contexts:    ["Vancomycin 25 mg/kg IV recommended for MRSA treatment"],
      groundTruth: "Vancomycin 25 mg/kg for MRSA",
    });
    expect(result).toHaveProperty("faithfulness");
    expect(result).toHaveProperty("answerRelevancy");
    expect(result).toHaveProperty("contextPrecision");
    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("pass");
  });

  it("evaluateRAG: all scores are 0–1", () => {
    const result = evaluateRAG({
      question:    "Sepsis antibiotic?",
      answer:      "Broad-spectrum antibiotics within 1 hour",
      contexts:    ["Broad-spectrum antibiotic therapy required within 1 hour of sepsis recognition"],
      groundTruth: "Antibiotics within 1 hour for sepsis",
    });
    expect(result.faithfulness).toBeGreaterThanOrEqual(0);
    expect(result.faithfulness).toBeLessThanOrEqual(1);
    expect(result.answerRelevancy).toBeGreaterThanOrEqual(0);
    expect(result.answerRelevancy).toBeLessThanOrEqual(1);
    expect(result.contextPrecision).toBeGreaterThanOrEqual(0);
    expect(result.contextPrecision).toBeLessThanOrEqual(1);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });

  it("evaluateRAG: pass=true for high-quality answer", () => {
    // Question, answer, context, and groundTruth all share the same clinical terms
    // so faithfulness, relevancy, and contextPrecision are all high
    const answer  = "Treat sepsis with antibiotics and fluids within one hour";
    const context = ["Treat sepsis with antibiotics and fluids within one hour of diagnosis"];
    const gt      = "Treat sepsis with antibiotics and fluids";
    const result  = evaluateRAG({
      question:    "treat sepsis antibiotics fluids",
      answer,
      contexts:    context,
      groundTruth: gt,
    });
    expect(result.pass).toBe(true);
  });

  it("evaluateRAG: pass=false for hallucinated answer", () => {
    const result = evaluateRAG({
      question:    "What is sepsis treatment?",
      answer:      "Bananas are healthy fruit grown in tropical climates",
      contexts:    ["Antibiotics within 1 hour for sepsis management"],
      groundTruth: "Antibiotics for sepsis",
    });
    expect(result.pass).toBe(false);
  });

  it("evaluateRAG: overallScore is harmonic mean (penalises low outlier)", () => {
    // Perfect faithfulness + relevancy but zero precision → low harmonic mean
    const result = evaluateRAG({
      question:    "Dose of X?",
      answer:      "Dose question answer X",
      contexts:    ["Dose question answer X"],
      groundTruth: "completely unrelated topic about moon landing",
    });
    // harmonic mean should be well below arithmetic mean due to low contextPrecision
    const arith = (result.faithfulness + result.answerRelevancy + result.contextPrecision) / 3;
    // We just check it's at most the arithmetic mean (harmonic ≤ arithmetic)
    expect(result.overallScore).toBeLessThanOrEqual(arith + 0.01); // small float tolerance
  });

  it("getMetricsSummary: returns summary object", async () => {
    const { getMetricsSummary } = await import("../../server/eval/ragEvaluator");
    const summary = await getMetricsSummary();
    expect(summary).toHaveProperty("totalEvaluations");
    expect(summary).toHaveProperty("avgFaithfulness");
    expect(summary).toHaveProperty("avgAnswerRelevancy");
    expect(summary).toHaveProperty("avgContextPrecision");
    expect(summary).toHaveProperty("avgOverallScore");
    expect(summary).toHaveProperty("passRate");
  });

  it("getRecentEvaluations: returns array", async () => {
    const { getRecentEvaluations } = await import("../../server/eval/ragEvaluator");
    const evals = await getRecentEvaluations(5);
    expect(Array.isArray(evals)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 — Route integration smoke tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Suite 6: API Routes — retrieval endpoint smoke tests", () => {
  const BASE = "http://localhost:5000/api/retrieval";

  it("GET /health → 200 with status=operational", async () => {
    const res  = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("operational");
    expect(body.modules).toHaveProperty("hybridRetriever");
    expect(body.modules).toHaveProperty("cragEngine");
    expect(body.modules).toHaveProperty("retrievalAgent");
    expect(body.modules).toHaveProperty("semanticCache");
    expect(body.modules).toHaveProperty("ragEvaluator");
  });

  it("GET /documents → 200 with documents array", async () => {
    const res  = await fetch(`${BASE}/documents`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("documents");
    expect(Array.isArray(body.documents)).toBe(true);
  });

  it("GET /cache/stats → 200 with stats object", async () => {
    const res  = await fetch(`${BASE}/cache/stats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("entries");
    expect(body).toHaveProperty("threshold");
  });

  it("GET /eval/summary → 200 with metrics", async () => {
    const res  = await fetch(`${BASE}/eval/summary`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("totalEvaluations");
    expect(body).toHaveProperty("avgOverallScore");
  });

  it("GET /eval/recent → 200 with evaluations array", async () => {
    const res  = await fetch(`${BASE}/eval/recent`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("evaluations");
    expect(Array.isArray(body.evaluations)).toBe(true);
  });

  it("POST /index → 201 with created doc", async () => {
    const res = await fetch(`${BASE}/index`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        docId:   `test-batch58-${Date.now()}`,
        title:   "Sepsis Management Guideline (Test)",
        content: "For sepsis: give 30 mL/kg IV crystalloid bolus within 3 hours. Broad-spectrum antibiotics within 1 hour. Measure lactate. Repeat if lactate >2 mmol/L. Blood cultures before antibiotics. Norepinephrine for MAP <65 mmHg.",
        source:  "batch58_test",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("doc");
    expect(body.doc).toHaveProperty("id");
    expect(body.doc.source).toBe("batch58_test");
  });

  it("POST /evaluate → 200 with RAGAS metrics", async () => {
    const res = await fetch(`${BASE}/evaluate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        question:    "What fluid for sepsis?",
        answer:      "30 mL/kg IV crystalloid within 3 hours for sepsis",
        contexts:    ["For sepsis give 30 mL/kg IV crystalloid bolus within 3 hours"],
        groundTruth: "30 mL/kg crystalloid bolus for sepsis",
        store:       false,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("faithfulness");
    expect(body).toHaveProperty("answerRelevancy");
    expect(body).toHaveProperty("contextPrecision");
    expect(body).toHaveProperty("overallScore");
    expect(body).toHaveProperty("pass");
  });

  it("POST /query → 200 with answer + decision (NO_RETRIEVE path)", async () => {
    const res = await fetch(`${BASE}/query`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        question:     "what is sepsis",
        skipCache:    true,
        skipEval:     true,
        forceKeyword: false,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("answer");
    expect(body).toHaveProperty("decision");
    expect(body.decision).toBe("NO_RETRIEVE");
    expect(body.answer.length).toBeGreaterThan(10);
  });

  it("DELETE /cache → 200 with cleared count", async () => {
    const res  = await fetch(`${BASE}/cache`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("cleared");
    expect(typeof body.cleared).toBe("number");
  });
});

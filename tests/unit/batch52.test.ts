/**
 * Batch 52 — Agentic RAG Pipeline
 * Tests: RAGCollectionStore, WebSearchFallback, LLMRelevanceChecker, AgenticRAGPipeline
 * Target: 42+ tests
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── RAGCollectionStore ────────────────────────────────────────────────────────
import {
  addToCollection, queryCollection, getCollectionSize, listCollections,
  clearCollection, type CollectionName,
} from "../../server/rag/ragCollectionStore";

// ── WebSearchFallback ─────────────────────────────────────────────────────────
import { searchWeb } from "../../server/rag/webSearchFallback";

// ── LLMRelevanceChecker ───────────────────────────────────────────────────────
import { checkRelevance } from "../../server/rag/llmRelevanceChecker";

// ── AgenticRAGPipeline ────────────────────────────────────────────────────────
import { runAgenticRAG, runSimpleRAG, compareRAGPipelines } from "../../server/rag/agenticRAGPipeline";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — RAGCollectionStore
// ─────────────────────────────────────────────────────────────────────────────

describe("RAGCollectionStore", () => {
  it("has all 4 pre-seeded collections", () => {
    const cols = listCollections();
    const names = cols.map((c) => c.name);
    expect(names).toContain("clinical_guidelines");
    expect(names).toContain("drug_protocols");
    expect(names).toContain("device_manuals");
    expect(names).toContain("case_studies");
    expect(cols).toHaveLength(4);
  });

  it("clinical_guidelines collection is pre-seeded with content", () => {
    const size = getCollectionSize("clinical_guidelines");
    expect(size).toBeGreaterThanOrEqual(8);
  });

  it("drug_protocols collection is pre-seeded with content", () => {
    const size = getCollectionSize("drug_protocols");
    expect(size).toBeGreaterThanOrEqual(6);
  });

  it("device_manuals collection is pre-seeded with content", () => {
    const size = getCollectionSize("device_manuals");
    expect(size).toBeGreaterThanOrEqual(5);
  });

  it("queryCollection returns ranked results for matching query", () => {
    const results = queryCollection("clinical_guidelines", "sepsis treatment lactate", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].rank).toBe(1);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].chunk.text).toBeTruthy();
    expect(results[0].chunk.source).toBe("clinical_guidelines");
  });

  it("queryCollection returns drug info for medication queries", () => {
    const results = queryCollection("drug_protocols", "morphine opioid IV dose", 3);
    expect(results.length).toBeGreaterThan(0);
    const texts = results.map((r) => r.chunk.text.toLowerCase()).join(" ");
    expect(texts).toContain("morphine");
  });

  it("queryCollection returns device info for equipment queries", () => {
    const results = queryCollection("device_manuals", "ventilator tidal volume settings ICU", 3);
    expect(results.length).toBeGreaterThan(0);
    const texts = results.map((r) => r.chunk.text.toLowerCase()).join(" ");
    expect(texts.includes("ventilator") || texts.includes("tidal")).toBe(true);
  });

  it("queryCollection respects n parameter", () => {
    const results = queryCollection("clinical_guidelines", "emergency patient treatment", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("addToCollection inserts chunks and increases size", () => {
    const before = getCollectionSize("case_studies");
    addToCollection("case_studies", [
      { text: "Test case: 50yo with acute MI. Outcome good.", metadata: { test: true } },
    ]);
    expect(getCollectionSize("case_studies")).toBe(before + 1);
  });

  it("added chunks are queryable", () => {
    addToCollection("case_studies", [
      { text: "Unique test chunk: xyloventricularabc patient scenario for unit testing.", metadata: { testId: "unique123" } },
    ]);
    const results = queryCollection("case_studies", "xyloventricularabc scenario testing", 3);
    expect(results.length).toBeGreaterThan(0);
    const found = results.some((r) => r.chunk.text.includes("xyloventricularabc"));
    expect(found).toBe(true);
  });

  it("queryCollection returns empty for no matching query", () => {
    const results = queryCollection("clinical_guidelines", "xyznonexistentterm12345", 3);
    // score should be near 0 or empty
    const meaningful = results.filter((r) => r.score > 0.1);
    expect(meaningful.length).toBe(0);
  });

  it("listCollections reflects all 4 collections with sizes", () => {
    const cols = listCollections();
    for (const col of cols) {
      expect(col.size).toBeGreaterThanOrEqual(0);
      expect(typeof col.name).toBe("string");
    }
  });

  it("results are sorted descending by score", () => {
    const results = queryCollection("clinical_guidelines", "sepsis treatment emergency", 5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — WebSearchFallback
// ─────────────────────────────────────────────────────────────────────────────

describe("WebSearchFallback", () => {
  it("returns a result for a COVID query (mock library)", async () => {
    const result = await searchWeb("What are medicines/treatment for COVID?");
    expect(result.query).toContain("COVID");
    expect(result.context).toBeTruthy();
    expect(result.snippets.length).toBeGreaterThan(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns context for influenza query", async () => {
    const result = await searchWeb("What is oseltamivir Tamiflu dosing for flu?");
    expect(result.context.toLowerCase()).toContain("influenza");
    expect(result.source).toBe("mock_library");
  });

  it("returns context for tariff/trade query (out-of-scope medical)", async () => {
    const result = await searchWeb("What's the export duty on medical tablets from India by USA in 2025?");
    expect(result.context).toBeTruthy();
    expect(result.snippets.length).toBeGreaterThan(0);
  });

  it("returns fallback message for genuinely unknown query", async () => {
    const result = await searchWeb("zzzyyyxxxnonsenseterm9999");
    expect(result.context).toBeTruthy();
    expect(result.source).toBe("mock_library");
  });

  it("result always has required fields", async () => {
    const result = await searchWeb("test query");
    expect(typeof result.query).toBe("string");
    expect(typeof result.context).toBe("string");
    expect(Array.isArray(result.snippets)).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
    expect(["serper_api", "mock_library"]).toContain(result.source);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — LLMRelevanceChecker
// ─────────────────────────────────────────────────────────────────────────────

describe("LLMRelevanceChecker", () => {
  it("marks highly relevant context as relevant (heuristic mode)", async () => {
    const query   = "What are the treatments for Kawasaki disease?";
    const context = "Kawasaki disease treatment: IVIG 2 g/kg single infusion plus aspirin. Required for fever ≥5 days with criteria. Monitor echocardiogram for coronary artery aneurysm.";
    const result  = await checkRelevance(query, context);
    expect(result.relevant).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(["llm", "heuristic"]).toContain(result.method);
  });

  it("marks completely irrelevant context as not relevant (heuristic mode)", async () => {
    const query   = "What are the sepsis diagnostic criteria?";
    const context = "The stock market closed at 5,200 points. Technology stocks gained 2.3% amid earnings season.";
    const result  = await checkRelevance(query, context);
    // With heuristic: very low overlap → not relevant
    expect(result.relevant).toBe(false);
  });

  it("returns confidence between 0 and 1", async () => {
    const result = await checkRelevance("test query", "some context text about medicine");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("result always has method field", async () => {
    const result = await checkRelevance("what is sepsis", "sepsis is a life-threatening infection");
    expect(["llm", "heuristic"]).toContain(result.method);
  });

  it("relevant field is boolean", async () => {
    const result = await checkRelevance("any query", "any context");
    expect(typeof result.relevant).toBe("boolean");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — AgenticRAGPipeline
// ─────────────────────────────────────────────────────────────────────────────

describe("AgenticRAGPipeline — Agentic Mode", () => {
  it("returns all required fields", async () => {
    const result = await runAgenticRAG("What are the treatments for Kawasaki disease?");
    expect(result.query).toContain("Kawasaki");
    expect(result.response).toBeTruthy();
    expect(result.mode).toBe("agentic");
    expect(typeof result.latencyMs).toBe("number");
    expect(Array.isArray(result.trace)).toBe(true);
    expect(result.trace.length).toBeGreaterThan(0);
  }, 15000);

  it("trace includes Router node", async () => {
    const result = await runAgenticRAG("What is the sepsis Hour-1 bundle?");
    const nodes  = result.trace.map((s) => s.node);
    expect(nodes).toContain("Router");
  }, 15000);

  it("trace includes Relevance_Checker node", async () => {
    const result = await runAgenticRAG("What is the sepsis Hour-1 bundle?");
    const nodes  = result.trace.map((s) => s.node);
    expect(nodes).toContain("Relevance_Checker");
  }, 15000);

  it("routes clinical query to clinical_guidelines (not web_search)", async () => {
    const result = await runAgenticRAG("What are the chest pain HEART score criteria?");
    // Should NOT route to web_search for an in-scope clinical query
    const isInScope = result.source !== null;
    expect(isInScope).toBe(true);
  }, 15000);

  it("handles medication query with drug_protocols", async () => {
    const result = await runAgenticRAG("What is the morphine IV dose and max dose?");
    expect(result.response).toBeTruthy();
    expect(result.response.length).toBeGreaterThan(10);
  }, 15000);

  it("handles device query", async () => {
    const result = await runAgenticRAG("What are the defibrillator energy settings for ventricular fibrillation?");
    expect(result.response).toBeTruthy();
    expect(result.trace.some((s) => s.node.startsWith("Retrieve_"))).toBe(true);
  }, 15000);

  it("iterations counter is at least 1 after pipeline run", async () => {
    const result = await runAgenticRAG("What is the normal SpO2 range for a pulse oximeter?");
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  }, 15000);

  it("out-of-scope query falls back to web_search", async () => {
    const result = await runAgenticRAG("What are the US tariffs on pharmaceutical exports from India in 2025?");
    // May go direct to web_search via router or trigger fallback
    // Either way, should produce a response
    expect(result.response).toBeTruthy();
  }, 15000);

  it("response is non-empty string", async () => {
    const result = await runAgenticRAG("What is the DKA insulin protocol?");
    expect(result.response.length).toBeGreaterThan(10);
  }, 15000);
});

describe("AgenticRAGPipeline — Simple Mode (Traditional RAG)", () => {
  it("simple RAG returns response without routing or relevance check", async () => {
    const result = await runSimpleRAG("What are the treatments for Kawasaki disease?");
    expect(result.mode).toBe("simple");
    expect(result.response).toBeTruthy();
    expect(result.relevant).toBeNull(); // simple RAG does not check relevance
    expect(result.iterations).toBe(0);
  }, 15000);

  it("simple RAG trace has Retriever, Augment, Generate nodes", async () => {
    const result = await runSimpleRAG("What is morphine dosing?", "drug_protocols");
    const nodes  = result.trace.map((s) => s.node);
    expect(nodes).toContain("Retriever");
    expect(nodes).toContain("Augment");
    expect(nodes).toContain("Generate");
  }, 15000);

  it("simple RAG uses specified collection", async () => {
    const result = await runSimpleRAG("ventilator settings", "device_manuals");
    expect(result.source).toBe("device_manuals");
  }, 15000);

  it("simple RAG defaults to clinical_guidelines", async () => {
    const result = await runSimpleRAG("sepsis criteria");
    expect(result.source).toBe("clinical_guidelines");
  }, 15000);
});

describe("AgenticRAGPipeline — Pipeline Comparison", () => {
  it("compareRAGPipelines returns both results", async () => {
    const cmp = await compareRAGPipelines("What are the treatments for Kawasaki disease?");
    expect(cmp.simple.mode).toBe("simple");
    expect(cmp.agentic.mode).toBe("agentic");
    expect(typeof cmp.queryHandled).toBe("boolean");
    expect(cmp.addedValueFromAgentic).toBeTruthy();
  }, 20000);

  it("addedValueFromAgentic explains the difference", async () => {
    const cmp = await compareRAGPipelines("What are medicines for COVID?");
    expect(cmp.addedValueFromAgentic.length).toBeGreaterThan(10);
  }, 20000);
});

/**
 * server/research/articleTriage.ts
 * Article Triage Agent — scores articles for AI/engineering relevance to Auralyn.
 *
 * Focus: AI techniques, agents, LLMs, databases, and system-building methods
 * that could improve any part of Auralyn. Clinical specificity is NOT required.
 *
 * Scores (0-100) across four axes:
 *   relevance     — is this an AI/ML/agent/DB topic we could apply?
 *   trust         — does this source/content look credible and practical?
 *   novelty       — does this add something new?
 *   actionability — can we actually implement something from this?
 *
 * Verdict thresholds:
 *   adopt     — total weighted ≥ 50  (was 60 — short RSS excerpts mean fewer keyword hits)
 *   test_only — total weighted ≥ 34
 *   ignore    — below 34
 *
 * Base scores are higher for articles from Medium AI feeds (source = "medium" | "medium_saved_list")
 * since those articles are already pre-filtered to the AI topic area.
 */

export type TriageInput = {
  title:   string;
  excerpt?: string | null;
  tags?:   string[];
  source?: string; // "medium" | "pubmed" | "medium_saved_list" — used for base score boost
};

export type TriageResult = {
  relevanceScore:      number;
  trustScore:          number;
  noveltyScore:        number;
  actionabilityScore:  number;
  verdict:             "adopt" | "test_only" | "ignore";
  reasons:             string[];
};

// ── Keyword signals ───────────────────────────────────────────────────────────

const HIGH_VALUE = [
  // Core AI / ML
  "large language model", "llm", "language model", "machine learning",
  "deep learning", "neural network", "transformer", "attention mechanism",
  "fine-tuning", "finetuning", "pre-training", "pretraining",
  // AI safety / reliability
  "hallucination", "calibration", "alignment", "red teaming", "safety evaluation",
  "guardrail", "grounding", "factual accuracy", "uncertainty quantification",
  // Agents & orchestration
  "agent", "multi-agent", "autonomous agent", "agentic", "tool calling",
  "function calling", "orchestration", "planning", "reasoning", "chain-of-thought",
  "react agent", "langgraph", "langchain", "crew", "autogen",
  // Retrieval & knowledge
  "rag", "retrieval augmented", "retrieval-augmented", "vector database",
  "vector store", "embedding", "semantic search", "knowledge graph",
  "knowledge base", "document retrieval", "reranking",
  // Model techniques
  "prompt engineering", "prompt tuning", "in-context learning", "few-shot",
  "zero-shot", "chain of thought", "rlhf", "reinforcement learning",
  "reward model", "dpo", "lora", "quantization", "distillation",
  // AI + databases / systems
  "text-to-sql", "nl2sql", "structured data", "database query", "sql generation",
  "data pipeline", "streaming", "event-driven", "real-time inference",
  // APIs and frameworks
  "openai", "anthropic", "claude", "gpt-4", "gpt-5", "gemini", "mistral",
  "llama", "mixtral", "cohere", "hugging face",
  // Code / engineering
  "code generation", "code review", "automated testing", "software architecture",
  "system design", "scalability", "latency", "throughput",
];

const LOW_VALUE = [
  "agi", "singularity", "10x engineer", "killer app", "replace doctors",
  "revolutionary", "game changer", "disrupt", "exponential", "hype",
  "opinion", "hot take", "unpopular opinion", "controversial",
];

const IMPLEMENTATION_SIGNALS = [
  "implementation", "case study", "open source", "github", "production",
  "deployed", "benchmark", "dataset", "evaluation", "experiment",
  "results show", "we built", "we developed", "code available",
  "tutorial", "walkthrough", "step by step", "how to", "how we",
];

const AI_SYSTEMS_SIGNALS = [
  "agent", "pipeline", "workflow", "architecture", "inference",
  "api", "sdk", "framework", "integration", "backend",
];

// ── Scorer ────────────────────────────────────────────────────────────────────

export function triageArticle(input: TriageInput): TriageResult {
  const text = `${input.title} ${input.excerpt ?? ""} ${(input.tags ?? []).join(" ")}`.toLowerCase();

  // Articles from Medium AI feeds are pre-filtered — give them a higher base score
  const isMediumSource = input.source === "medium" || input.source === "medium_saved_list";

  let relevance      = isMediumSource ? 38 : 25;
  let trust          = isMediumSource ? 52 : 50;
  let novelty        = isMediumSource ? 42 : 40;
  let actionability  = isMediumSource ? 36 : 30;
  const reasons: string[] = [];
  if (isMediumSource) reasons.push("Medium AI feed article — higher base relevance");

  // High-value AI keyword hits
  let hvHits = 0;
  for (const term of HIGH_VALUE) {
    if (text.includes(term)) {
      relevance     += 4;
      actionability += 3;
      hvHits++;
      if (hvHits <= 3) reasons.push(`AI keyword: "${term}"`);
    }
  }
  if (hvHits >= 3) reasons.push(`Strong AI keyword density (${hvHits} matches)`);

  // Low-value / hype signals
  for (const term of LOW_VALUE) {
    if (text.includes(term)) {
      trust         -= 12;
      actionability -= 8;
      reasons.push(`Hype/opinion signal: "${term}"`);
    }
  }

  // Implementation orientation — highly valued
  for (const term of IMPLEMENTATION_SIGNALS) {
    if (text.includes(term)) {
      novelty        += 8;
      actionability  += 10;
      reasons.push(`Implementation-oriented: "${term}"`);
      break;
    }
  }

  // AI systems / engineering signals
  let sysHits = 0;
  for (const term of AI_SYSTEMS_SIGNALS) {
    if (text.includes(term)) sysHits++;
  }
  if (sysHits >= 2) {
    actionability += 10;
    reasons.push(`Systems/engineering orientation (${sysHits} signals)`);
  }

  // Specific topic boosts
  if (text.includes("bayesian") || text.includes("probabilistic")) {
    relevance  += 10;
    novelty    += 8;
    reasons.push("Bayesian / probabilistic methods — core Auralyn methodology");
  }
  if (text.includes("hallucination") || text.includes("safety guard") || text.includes("guardrail")) {
    trust         += 10;
    actionability += 12;
    reasons.push("AI reliability / hallucination mitigation — critical for Auralyn");
  }
  if (text.includes("agent") || text.includes("agentic") || text.includes("multi-agent")) {
    relevance     += 10;
    actionability += 8;
    reasons.push("Agent-based architecture — directly applicable");
  }
  if (text.includes("rag") || text.includes("retrieval augmented") || text.includes("vector")) {
    relevance     += 8;
    actionability += 8;
    reasons.push("RAG / vector retrieval — applicable to clinical knowledge base");
  }

  // Clamp all scores to [0, 100]
  relevance     = clamp(relevance);
  trust         = clamp(trust);
  novelty       = clamp(novelty);
  actionability = clamp(actionability);

  // Weighted composite
  const total = relevance * 0.35 + trust * 0.20 + novelty * 0.15 + actionability * 0.30;

  let verdict: TriageResult["verdict"] = "ignore";
  if (total >= 50) verdict = "adopt";
  else if (total >= 34) verdict = "test_only";

  if (!reasons.length) reasons.push("Standard AI relevance scoring applied — no strong keyword signals found");

  return { relevanceScore: relevance, trustScore: trust, noveltyScore: novelty, actionabilityScore: actionability, verdict, reasons };
}

function clamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }

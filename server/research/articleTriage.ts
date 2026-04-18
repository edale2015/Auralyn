/**
 * server/research/articleTriage.ts
 * Article Triage Agent — scores every article for clinical relevance to Auralyn.
 *
 * Scores (0-100) across four axes:
 *   relevance     — is this topic relevant to our system?
 *   trust         — does this source/content look credible?
 *   novelty       — does this add something new?
 *   actionability — can we actually implement something from this?
 *
 * Verdict thresholds:
 *   adopt     — total weighted ≥ 72
 *   test_only — total weighted ≥ 50
 *   ignore    — below 50
 */

export type TriageInput = {
  title:   string;
  excerpt?: string | null;
  tags?:   string[];
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
  "clinical", "medical", "sepsis", "fhir", "audit", "bayesian", "validation",
  "hallucination", "calibration", "triage", "decision support", "ehr",
  "electronic health", "diagnosis", "prediction", "safety", "risk score",
  "early warning", "deterioration", "shock", "septic", "pneumonia",
  "fda", "samd", "510k", "hipaa", "phi", "rlhf", "reinforcement",
];

const LOW_VALUE = [
  "agi", "singularity", "10x engineer", "killer app", "replace doctors",
  "revolutionary", "game changer", "disrupt", "exponential", "hype",
];

const IMPLEMENTATION_SIGNALS = [
  "implementation", "case study", "open source", "github", "production",
  "deployed", "benchmark", "dataset", "evaluation", "experiment",
  "results show", "we built", "we developed", "code available",
];

const REGULATORY_SIGNALS = [
  "fda", "fhir", "hl7", "calibration", "hipaa", "audit trail",
  "510k", "samd", "iso 13485", "iec 62304",
];

// ── Scorer ────────────────────────────────────────────────────────────────────

export function triageArticle(input: TriageInput): TriageResult {
  const text = `${input.title} ${input.excerpt ?? ""} ${(input.tags ?? []).join(" ")}`.toLowerCase();

  let relevance      = 20;
  let trust          = 50;
  let novelty        = 40;
  let actionability  = 30;
  const reasons: string[] = [];

  // High-value keyword hits
  let hvHits = 0;
  for (const term of HIGH_VALUE) {
    if (text.includes(term)) {
      relevance     += 5;
      actionability += 3;
      hvHits++;
    }
  }
  if (hvHits >= 4) reasons.push(`Strong clinical keyword density (${hvHits} matches)`);

  // Low-value / hype signals
  for (const term of LOW_VALUE) {
    if (text.includes(term)) {
      trust         -= 12;
      actionability -= 8;
      reasons.push(`Hype signal detected: "${term}"`);
    }
  }

  // Implementation orientation
  for (const term of IMPLEMENTATION_SIGNALS) {
    if (text.includes(term)) {
      novelty        += 6;
      actionability  += 8;
      reasons.push(`Implementation-oriented: "${term}"`);
      break;
    }
  }

  // Regulatory / standards relevance
  for (const term of REGULATORY_SIGNALS) {
    if (text.includes(term)) {
      trust         += 8;
      relevance     += 4;
      reasons.push(`Regulatory/standards relevance: "${term}"`);
      break;
    }
  }

  // Auralyn-specific topic boosts
  if (text.includes("sepsis") || text.includes("deteriorat")) {
    relevance     += 15;
    actionability += 10;
    reasons.push("Directly relevant: sepsis/deterioration detection");
  }
  if (text.includes("bayesian") || text.includes("posterior")) {
    relevance     += 10;
    novelty       += 8;
    reasons.push("Bayesian inference — core Auralyn methodology");
  }
  if (text.includes("hallucination") || text.includes("safety guard")) {
    trust         += 10;
    actionability += 12;
    reasons.push("AI hallucination / safety — critical for clinical use");
  }

  // Clamp all scores to [0, 100]
  relevance     = clamp(relevance);
  trust         = clamp(trust);
  novelty       = clamp(novelty);
  actionability = clamp(actionability);

  // Weighted composite
  const total = relevance * 0.35 + trust * 0.20 + novelty * 0.15 + actionability * 0.30;

  let verdict: TriageResult["verdict"] = "ignore";
  if (total >= 72) verdict = "adopt";
  else if (total >= 50) verdict = "test_only";

  if (!reasons.length) reasons.push("Standard relevance/trust/novelty/actionability scoring applied");

  return { relevanceScore: relevance, trustScore: trust, noveltyScore: novelty, actionabilityScore: actionability, verdict, reasons };
}

function clamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }

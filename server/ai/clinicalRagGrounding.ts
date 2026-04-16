/**
 * Clinical RAG Grounding.
 *
 * Retrieval-Augmented Generation strictly limited to the clinical
 * knowledge base.  No general model memory is used — if the KB has
 * no relevant entries the answer explicitly states this.
 *
 * Safety boundary:
 *   kbOnly: true  — this module never sets patient disposition.
 */

import { searchClinicalKnowledge, ClinicalKnowledgeRow } from "../services/clinicalKnowledgeService";

const LOW_CONFIDENCE_THRESHOLD = 60;

export interface GroundedAnswerSource {
  id:        number;
  title:     string;
  content:   string;
  category:  string;
  source:    string;
  updatedAt: Date | null;
}

export interface GroundedAnswer {
  answer:                string;
  sources:               GroundedAnswerSource[];
  confidenceScore:       number;
  needsPhysicianReview:  boolean;
  rawQuery:              string;
  kbOnly:                true;   // always true — enforced at type level
}

// ─── Confidence scoring ────────────────────────────────────────────────────

function scoreConfidence(query: string, sources: ClinicalKnowledgeRow[]): number {
  if (!sources.length) return 10;

  let score = 40;

  // More sources → higher confidence, capped at 25 pts
  score += Math.min(25, sources.length * 8);

  // Term overlap with top result
  const qTokens = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const topText = `${sources[0].title} ${sources[0].content}`.toLowerCase();
  const overlap = [...qTokens].filter((t) => topText.includes(t)).length;
  score += Math.min(20, overlap * 4);

  // Recency bonus
  const newest  = sources[0]?.updatedAt ? new Date(sources[0].updatedAt).getTime() : 0;
  const ageDays = newest ? (Date.now() - newest) / 86_400_000 : 9999;
  if (ageDays <= 180) score += 10;
  else if (ageDays <= 365) score += 5;

  return Math.max(0, Math.min(100, score));
}

// ─── Answer builder ────────────────────────────────────────────────────────

function buildGroundedAnswer(
  query:           string,
  sources:         ClinicalKnowledgeRow[],
  confidenceScore: number,
): string {
  if (!sources.length) {
    return [
      "No sufficiently relevant clinical knowledge base entries were found for this query.",
      "This system does not answer from general model memory.",
      "Please verify using a primary source or request physician review.",
    ].join(" ");
  }

  const cited = sources.map(
    (s, i) =>
      `Source ${i + 1}: ${s.title} (${s.source}${
        s.updatedAt ? `, updated ${new Date(s.updatedAt).toISOString().slice(0, 10)}` : ""
      })`,
  );

  const excerpts = sources.map((s, i) => `Source ${i + 1}: ${s.content.slice(0, 500)}`);

  const confidenceNote =
    confidenceScore < LOW_CONFIDENCE_THRESHOLD
      ? "Confidence is limited. Review the cited sources carefully; physician verification is required."
      : "This answer is grounded in the cited knowledge base sources.";

  return [`Query: ${query}`, confidenceNote, ...cited, "", "Grounded summary:", ...excerpts].join("\n");
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Retrieve a KB-grounded answer for a clinical query.
 * Never falls back to general LLM memory.
 */
export async function getGroundedAnswer(query: string): Promise<GroundedAnswer> {
  const sources        = await searchClinicalKnowledge(query);
  const confidenceScore = scoreConfidence(query, sources);
  const answer          = buildGroundedAnswer(query, sources, confidenceScore);

  return {
    answer,
    sources:              sources as GroundedAnswerSource[],
    confidenceScore,
    needsPhysicianReview: confidenceScore < LOW_CONFIDENCE_THRESHOLD,
    rawQuery:             query,
    kbOnly:               true,
  };
}

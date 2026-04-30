/**
 * guidelineGrounding.ts
 * server/retrieval/guidelineGrounding.ts
 *
 * CLINICAL GUIDELINE GROUNDING SERVICE
 *
 * Connects KB Validator + Adversarial Review to indexed clinical guidelines so
 * challenges cite specific guideline pages — not LLM training knowledge.
 *
 * INTEGRATED INTO:
 *   1. adversarialKBValidator.ts — grounds proposed rules in guideline text
 *   2. clinicalQualityReviewLoop.ts — Prosecutor/Defender cite actual pages
 *   3. KB validation reports — exact page citations with evidence strength
 */

import { ClinicalDocumentIndexer } from "./clinicalDocumentIndexer";
import { llmGateway }              from "../gateway/llmGateway";
import { appendAuditEvent }        from "../governance/audit";

// ─── Guideline registry ───────────────────────────────────────────────────────

interface GuidelineEntry {
  documentId:     string;
  name:           string;
  organization:   string;
  year:           number;
  complaintSlugs: string[];
}

const GUIDELINE_REGISTRY: Record<string, GuidelineEntry> = {};

// ─── Complaint → guideline mapping ───────────────────────────────────────────

const COMPLAINT_TO_GUIDELINES: Record<string, string[]> = {
  chest_pain:           ["acep_chest_pain_2025", "aha_hypertension_2023"],
  headache:             ["acep_headache_2024"],
  hypertensive_urgency: ["aha_hypertension_2023"],
  sore_throat:          ["acep_uti_2024"],
  uti:                  ["acep_uti_2024", "cdc_antibiotic_2023"],
  asthma_exacerbation:  ["acep_chest_pain_2025"],
  pediatric_fever:      ["aap_fever_2021"],
};

// ─── Guideline query ──────────────────────────────────────────────────────────

export interface GuidelineQueryResult {
  found:          boolean;
  answer:         string;
  citation:       string;
  guidelineName:  string;
  organization:   string;
  evidenceGrade?: string;
  complaintSlug:  string;
  query:          string;
}

export async function queryGuidelines(
  complaintSlug: string,
  clinicalQuery: string,
  pageTexts:     Record<number, string> = {}
): Promise<GuidelineQueryResult[]> {

  const guidelineIds = COMPLAINT_TO_GUIDELINES[complaintSlug] ?? [];
  const results: GuidelineQueryResult[] = [];

  for (const guidelineId of guidelineIds) {
    const entry = GUIDELINE_REGISTRY[guidelineId];
    if (!entry) continue;

    const index = ClinicalDocumentIndexer.loadIndex(guidelineId);
    if (!index) continue;

    try {
      const queryResult = await ClinicalDocumentIndexer.query(
        guidelineId,
        clinicalQuery,
        pageTexts
      );

      const evidenceGradeMatch = queryResult.retrievedText.match(
        /(?:Level of Evidence|Recommendation Grade|Evidence Grade)[:\s]+([A-C][0-9]?|Level [I-III]+|Class [I-III]+)/i
      );

      results.push({
        found:         queryResult.confidence !== "low",
        answer:        queryResult.answer,
        citation:      queryResult.citations.join(", "),
        guidelineName: entry.name,
        organization:  entry.organization,
        evidenceGrade: evidenceGradeMatch?.[1],
        complaintSlug,
        query:         clinicalQuery,
      });

    } catch (err: any) {
      console.warn(`[GuidelineGrounding] Failed to query ${guidelineId}: ${err.message}`);
    }
  }

  await appendAuditEvent({
    actor:      "system",
    action:     "GUIDELINE_QUERIED",
    entityId:   complaintSlug,
    entityType: "guideline_grounding",
    details: {
      complaintSlug,
      guidelinesQueried: guidelineIds.length,
      guidelinesFound:   results.filter(r => r.found).length,
    },
  }).catch(console.error);

  return results;
}

// ─── KB rule grounding ────────────────────────────────────────────────────────

export async function groundKBRuleInGuidelines(
  complaintSlug: string,
  proposedRule:  string,
  pageTexts:     Record<number, string> = {}
): Promise<{
  grounded:         boolean;
  groundingText:    string;
  citations:        string[];
  evidenceStrength: "strong" | "moderate" | "weak" | "not_found";
}> {

  const query = `Does the clinical guideline support or contradict this rule: "${proposedRule}"? What does the guideline specifically say about this?`;

  const results     = await queryGuidelines(complaintSlug, query, pageTexts);
  const foundResults = results.filter(r => r.found);

  if (foundResults.length === 0) {
    return {
      grounded:         false,
      groundingText:    "No indexed guideline found for this complaint/rule combination.",
      citations:        [],
      evidenceStrength: "not_found",
    };
  }

  const combinedText = foundResults.map(r => `[${r.organization}] ${r.answer}`).join("\n\n");
  const allCitations = foundResults.flatMap(r => r.citation ? [r.citation] : []);
  const highestGrade = foundResults.find(r => r.evidenceGrade);

  const synthesis = await llmGateway.complete({
    purpose:  "retrieval_pruner",
    messages: [{
      role:    "user",
      content: `Proposed KB rule: "${proposedRule}"\n\nGuideline evidence:\n${combinedText}\n\nDoes the guideline evidence SUPPORT, CONTRADICT, or neither address this rule? Respond in 2-3 sentences.`,
    }],
    system:   `You are assessing whether a clinical KB rule is supported by guideline evidence.
Be direct: state whether the guideline supports, contradicts, or doesn't address the rule.
Quote the specific guideline language that is most relevant.`,
    maxTokens: 300,
    cacheKey:  `ground:${complaintSlug}:${proposedRule.slice(0, 50)}`,
  });

  const supports    = synthesis.content.toLowerCase().includes("support");
  const contradicts = synthesis.content.toLowerCase().includes("contradict");

  return {
    grounded:         supports || contradicts,
    groundingText:    synthesis.content,
    citations:        allCitations,
    evidenceStrength: highestGrade?.evidenceGrade ? "strong" : supports ? "moderate" : "weak",
  };
}

// ─── Guideline upload helper ──────────────────────────────────────────────────

export async function indexGuideline(
  guidelineId:    string,
  name:           string,
  organization:   string,
  year:           number,
  documentText:   string,
  totalPages:     number,
  complaintSlugs: string[]
): Promise<void> {

  await ClinicalDocumentIndexer.generateIndex(
    guidelineId,
    documentText,
    name,
    "clinical_guideline",
    `${organization} (${year})`,
    totalPages
  );

  GUIDELINE_REGISTRY[guidelineId] = { documentId: guidelineId, name, organization, year, complaintSlugs };

  for (const slug of complaintSlugs) {
    if (!COMPLAINT_TO_GUIDELINES[slug]) COMPLAINT_TO_GUIDELINES[slug] = [];
    if (!COMPLAINT_TO_GUIDELINES[slug].includes(guidelineId)) {
      COMPLAINT_TO_GUIDELINES[slug].push(guidelineId);
    }
  }

  console.log(`[GuidelineGrounding] Indexed: ${name} (${totalPages} pages) for: ${complaintSlugs.join(", ")}`);
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function getGroundingStatus(): {
  indexedGuidelines:   number;
  coveredComplaints:   string[];
  uncoveredComplaints: string[];
  guidelines:          Array<{ id: string; name: string; organization: string; year: number }>;
} {
  const covered   = Object.keys(GUIDELINE_REGISTRY).flatMap(id => GUIDELINE_REGISTRY[id].complaintSlugs);
  const allSlugs  = ["chest_pain", "sore_throat", "uti", "hypertensive_urgency", "headache",
                     "asthma_exacerbation", "pediatric_fever", "hyperglycemia", "leg_swelling",
                     "shortness_of_breath", "abdominal_pain", "back_pain"];
  const uncovered = allSlugs.filter(s => !covered.includes(s));

  return {
    indexedGuidelines:   Object.keys(GUIDELINE_REGISTRY).length,
    coveredComplaints:   [...new Set(covered)],
    uncoveredComplaints: uncovered,
    guidelines:          Object.values(GUIDELINE_REGISTRY).map(g => ({
      id:           g.documentId,
      name:         g.name,
      organization: g.organization,
      year:         g.year,
    })),
  };
}

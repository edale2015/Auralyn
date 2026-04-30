/**
 * guidelineGrounding.ts
 * Drop into: server/retrieval/guidelineGrounding.ts
 *
 * CLINICAL GUIDELINE GROUNDING SERVICE
 *
 * WHAT THIS SOLVES:
 * The KB Validator (Win 11) and Adversarial Clinical Review (Win 18 skill)
 * currently generate and challenge KB rules using the LLM's training knowledge.
 * When the Evaluator challenges "ACEP says X about chest pain," there's no way
 * to verify that claim against the actual ACEP document.
 *
 * This service connects those systems to indexed clinical guidelines so that:
 * - KB rule generation is grounded in actual guideline text
 * - Adversarial challenges can cite specific guideline pages
 * - Rule validation produces exact quotes, not paraphrases
 *
 * INTEGRATED INTO:
 * 1. adversarialKBValidator.ts — Generator grounds proposed rules in guidelines
 * 2. clinicalQualityReviewLoop.ts — Prosecutor/Defender cite actual guideline pages
 * 3. KB validation reports — include exact page citations with evidence strength
 *
 * GUIDELINE REGISTRY:
 * Pre-indexed clinical guidelines for urgent care.
 * Add new guidelines by calling indexGuideline() with the PDF text.
 *
 * AVAILABLE GUIDELINES (add as indexed):
 *   acep_chest_pain_2025     — ACEP Clinical Policy: Chest Pain
 *   acep_headache_2024       — ACEP Clinical Policy: Headache
 *   acep_afib_2023           — ACEP Clinical Policy: Atrial Fibrillation
 *   aap_fever_2021           — AAP Clinical Practice Guideline: Fever
 *   aha_hypertension_2023    — AHA/ACC Hypertension Guidelines
 *   cdc_antibiotic_2023      — CDC Antibiotic Use Guidelines
 *   acep_uti_2024            — ACEP Clinical Policy: Urinary Tract Infections
 */

import { ClinicalDocumentIndexer } from "./clinicalDocumentIndexer";
import { llmGateway }              from "../gateway/llmGateway";
import { appendAuditEvent }        from "../governance/audit";

// ─── Guideline registry ───────────────────────────────────────────────────────

interface GuidelineEntry {
  documentId:    string;
  name:          string;
  organization:  string;
  year:          number;
  complaintSlugs: string[];   // which Auralyn complaints this guideline covers
}

// Populated as guidelines are indexed — starts empty, grows with uploads
const GUIDELINE_REGISTRY: Record<string, GuidelineEntry> = {
  // Example — populated when indexGuideline() is called:
  // acep_chest_pain_2025: {
  //   documentId:    "acep_chest_pain_2025",
  //   name:          "ACEP Clinical Policy: Critical Issues in the Evaluation of Adult Patients Presenting to the Emergency Department with Acute Chest Pain",
  //   organization:  "ACEP",
  //   year:          2025,
  //   complaintSlugs: ["chest_pain", "shortness_of_breath"],
  // },
};

// ─── Complaint → guideline mapping ───────────────────────────────────────────

const COMPLAINT_TO_GUIDELINES: Record<string, string[]> = {
  chest_pain:          ["acep_chest_pain_2025", "aha_hypertension_2023"],
  headache:            ["acep_headache_2024"],
  hypertensive_urgency: ["aha_hypertension_2023"],
  sore_throat:         ["acep_uti_2024"],   // placeholder — add sore throat guideline
  uti:                 ["acep_uti_2024", "cdc_antibiotic_2023"],
  asthma_exacerbation: ["acep_chest_pain_2025"], // placeholder
  pediatric_fever:     ["aap_fever_2021"],
};

// ─── Guideline query ──────────────────────────────────────────────────────────

export interface GuidelineQueryResult {
  found:          boolean;
  answer:         string;
  citation:       string;
  guidelineName:  string;
  organization:   string;
  evidenceGrade?: string;   // extracted from guideline if present
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

      // Extract evidence grade if mentioned in the retrieved text
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
// Used by adversarialKBValidator.ts to ground proposed rule changes
// in actual guideline text before presenting them to the physician.

export async function groundKBRuleInGuidelines(
  complaintSlug:   string,
  proposedRule:    string,
  pageTexts:       Record<number, string> = {}
): Promise<{
  grounded:        boolean;
  groundingText:   string;
  citations:       string[];
  evidenceStrength: "strong" | "moderate" | "weak" | "not_found";
}> {

  const query = `Does the clinical guideline support or contradict this rule: "${proposedRule}"? What does the guideline specifically say about this?`;

  const results = await queryGuidelines(complaintSlug, query, pageTexts);
  const foundResults = results.filter(r => r.found);

  if (foundResults.length === 0) {
    return {
      grounded:         false,
      groundingText:    "No indexed guideline found for this complaint/rule combination.",
      citations:        [],
      evidenceStrength: "not_found",
    };
  }

  // Combine findings from multiple guidelines
  const combinedText  = foundResults.map(r => `[${r.organization}] ${r.answer}`).join("\n\n");
  const allCitations  = foundResults.flatMap(r => r.citation ? [r.citation] : []);
  const highestGrade  = foundResults.find(r => r.evidenceGrade);

  // Use gateway to synthesize the grounding assessment
  const synthesis = await llmGateway.complete({
    purpose:  "retrieval_pruner",   // Sonnet is sufficient for synthesis
    messages: [{
      role:    "user",
      content: `Proposed KB rule: "${proposedRule}"\n\nGuideline evidence:\n${combinedText}\n\nDoes the guideline evidence SUPPORT, CONTRADICT, or neither address this rule? Respond in 2-3 sentences.`,
    }],
    system:   `You are assessing whether a clinical KB rule is supported by guideline evidence.
Be direct: state whether the guideline supports, contradicts, or doesn't address the rule.
Quote the specific guideline language that is most relevant.`,
    maxTokens: 300,
    cacheKey: `ground:${complaintSlug}:${proposedRule.slice(0, 50)}`,
  });

  const supports     = synthesis.content.toLowerCase().includes("support");
  const contradicts  = synthesis.content.toLowerCase().includes("contradict");

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

  // Wire complaint mapping
  for (const slug of complaintSlugs) {
    if (!COMPLAINT_TO_GUIDELINES[slug]) COMPLAINT_TO_GUIDELINES[slug] = [];
    if (!COMPLAINT_TO_GUIDELINES[slug].includes(guidelineId)) {
      COMPLAINT_TO_GUIDELINES[slug].push(guidelineId);
    }
  }

  console.log(`[GuidelineGrounding] Indexed: ${name} (${totalPages} pages) for complaints: ${complaintSlugs.join(", ")}`);
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

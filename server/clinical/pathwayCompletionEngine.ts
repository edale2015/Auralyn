/**
 * pathwayCompletionEngine.ts
 * server/clinical/pathwayCompletionEngine.ts
 *
 * WIN 22 — PATHWAY COMPLETION ENGINE
 *
 * PURPOSE:
 * You have 188 missing pathways and 23 partial ones.
 * The sheetMigrator imports your Google Sheets data.
 * This engine takes the imported partial pathways and drafts
 * the missing clinical fields for PHYSICIAN REVIEW.
 *
 * CRITICAL DESIGN PRINCIPLE:
 * This engine DRAFTS. It does NOT auto-approve.
 * Every output goes to a physician review queue before touching the KB.
 * The physician approves each field before it becomes clinical truth.
 *
 * WHAT IT FILLS IN (draft only, physician must approve):
 *   - Differential diagnosis LR tables (from clinical decision rules)
 *   - Physical exam required components (from clinical standards)
 *   - Workup recommendations (from guidelines)
 *   - Treatment first-line options (from guidelines)
 *   - Patient communication templates
 *   - Follow-up protocol
 *   - Drift canary test case
 *
 * WHAT IT NEVER FILLS IN (always physician):
 *   - mustNotMiss flags — your clinical judgment only
 *   - Disposition defaults — your clinical experience only
 *   - Treatment doses — verify against current references always
 *   - Red flag action levels — ER_IMMEDIATE vs ER_URGENT is your call
 *
 * WORKFLOW:
 *   1. Run sheetMigrator on your CSV exports
 *   2. Run pathwayCompletionEngine on each partial pathway
 *   3. Review the draft in PhysicianPathwayReview dashboard
 *   4. Approve, modify, or reject each field
 *   5. Approved pathway loads into KB
 *
 * RATE: Targeting ~5 pathways per physician session (30-45 minutes each)
 * Priority order: P1 critical pathways first
 */

import { llmGateway }      from "../gateway/llmGateway";
import { appendAuditEvent } from "../governance/audit";
import { validatePathway }  from "./complaintPathwaySchema";
import type { ComplaintPathway, DifferentialDiagnosis } from "./complaintPathwaySchema";
import { db }  from "../db";
import { sql } from "drizzle-orm";

// ─── Draft completion request ─────────────────────────────────────────────────

export interface CompletionRequest {
  partialPathway:    Partial<ComplaintPathway>;
  guidelineSources?: string[];
  priorityFields?:   Array<keyof ComplaintPathway>;
}

export interface CompletionDraft {
  slug:             string;
  displayName:      string;
  draftedAt:        string;
  fieldsCompleted:  string[];
  fieldsSkipped:    string[];
  draft:            Partial<ComplaintPathway>;
  validationScore:  number;
  validationErrors: string[];
  requiresPhysicianReview: string[];
  draftConfidence:  "high" | "moderate" | "low";
}

// ─── Field drafters ───────────────────────────────────────────────────────────

async function draftLRTables(
  pathway: Partial<ComplaintPathway>
): Promise<DifferentialDiagnosis[]> {
  if (!pathway.differential?.length) return [];

  const result = await llmGateway.complete({
    purpose:  "kb_validator",
    messages: [{
      role:    "user",
      content: `Draft likelihood ratio tables for this urgent care complaint pathway.

Complaint: ${pathway.displayName} (${pathway.slug})
System: ${pathway.system}

Diagnoses to cover:
${pathway.differential.map(d => `- ${d.diagnosis} (prior: ${d.prior})`).join("\n")}

For each diagnosis, provide 3-5 supporting clinical findings with likelihood ratios.
Base LR values on published clinical decision rules or systematic reviews.
Always cite the source.

Return JSON array matching this structure:
[
  {
    "diagnosis": "string",
    "icdCode": "string",
    "prior": number,
    "urgency": "emergent|urgent|routine|chronic",
    "mustNotMiss": false,
    "likelihoodRatios": {
      "supportingFindings": [
        {
          "finding": "specific clinical finding",
          "lr": 3.5,
          "source": "Clinical decision rule or study name"
        }
      ]
    },
    "treatmentPrinciples": "string",
    "dispositionDefault": "ER_SEND|URGENT_CARE|PCP|SELF_CARE"
  }
]

IMPORTANT NOTES FOR PHYSICIAN REVIEW:
- mustNotMiss is set to false on all — physician must review and flag life-threatening diagnoses
- dispositionDefault is a suggestion — physician must verify each
- LR values are from published sources but must be verified before clinical use`,
    }],
    system: `You are drafting clinical decision support content for an urgent care AI system.
All content is for PHYSICIAN REVIEW before clinical use — never for autonomous AI decision making.
Use only evidence-based likelihood ratios from published clinical decision rules (Centor, HEART, Wells,
Ottawa, PERC, HINTS, etc.) or peer-reviewed systematic reviews.
Always cite your source. When uncertain, use lr: 1.0 and note "evidence limited".
Return ONLY valid JSON array. No markdown.`,
    maxTokens: 3000,
    cacheKey:  `lr-draft:${pathway.slug}`,
  });

  try {
    const clean = result.content.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return pathway.differential ?? [];
  }
}

async function draftPhysicalExam(
  pathway: Partial<ComplaintPathway>
): Promise<ComplaintPathway["physicalExam"]> {
  const result = await llmGateway.complete({
    purpose:  "retrieval_pruner",
    messages: [{
      role:    "user",
      content: `Draft physical exam requirements for: ${pathway.displayName}

Differential includes: ${pathway.differential?.map(d => d.diagnosis).join(", ") ?? "not specified"}

Return JSON:
{
  "required": ["exam component 1", "exam component 2"],
  "conditional": [
    { "perform": "specific exam", "when": "clinical indication" }
  ],
  "findings": [
    { "finding": "specific finding", "indicates": "clinical significance", "urgency": "red_flag|important|informational" }
  ]
}`,
    }],
    system:   "Draft physical exam protocols for urgent care. Be specific. Return ONLY valid JSON.",
    maxTokens: 1000,
    cacheKey:  `exam-draft:${pathway.slug}`,
  });

  try {
    const clean = result.content.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return pathway.physicalExam ?? { required: [], conditional: [], findings: [] };
  }
}

async function draftPatientCommunication(
  pathway: Partial<ComplaintPathway>
): Promise<ComplaintPathway["patientCommunication"]> {
  const result = await llmGateway.complete({
    purpose:  "discharge_generator",
    messages: [{
      role:    "user",
      content: `Draft patient communication templates for: ${pathway.displayName}

Most common diagnosis: ${pathway.differential?.[0]?.diagnosis ?? "not specified"}
Acuity: ${pathway.acuityClass}

Return JSON:
{
  "diagnosisExplanation": "plain English explanation for patient",
  "treatmentExplanation": "what we're doing and why",
  "returnPrecautions": ["specific warning sign 1", "specific warning sign 2", "specific warning sign 3"],
  "followUpInstructions": "when and where to follow up",
  "preventionCounseling": "relevant prevention advice",
  "npsDrivers": ["what improves patient satisfaction for this complaint"]
}`,
    }],
    system:   `Write patient-facing clinical communication at a 6th grade reading level.
Be specific about warning signs — vague precautions do not protect patients.
Return ONLY valid JSON.`,
    maxTokens: 800,
    cacheKey:  `patient-comm-draft:${pathway.slug}`,
  });

  try {
    const clean = result.content.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return pathway.patientCommunication ?? {
      diagnosisExplanation: "REVIEW REQUIRED",
      treatmentExplanation: "REVIEW REQUIRED",
      returnPrecautions:    [],
      followUpInstructions: "REVIEW REQUIRED",
      preventionCounseling: "REVIEW REQUIRED",
      npsDrivers:           [],
    };
  }
}

async function draftDriftCanary(
  pathway: Partial<ComplaintPathway>
): Promise<{
  id:                    string;
  complaint:             string;
  symptoms:              string[];
  expectedDisposition:   string;
  expectedTopDiagnosis:  string;
  confidenceFloor:       number;
  mustHaveRedFlag:       boolean;
}> {
  const topDx    = pathway.differential?.find(d => d.mustNotMiss) ?? pathway.differential?.[0];
  const commonDx = pathway.differential?.find(d => !d.mustNotMiss && d.prior > 0.2) ?? pathway.differential?.[1];
  const targetDx = commonDx ?? topDx;

  return {
    id:                   `${pathway.slug}_typical`,
    complaint:            pathway.slug ?? "",
    symptoms:             pathway.intakeQuestions
      ?.filter(q => q.type === "boolean")
      ?.slice(0, 3)
      ?.map(q => q.question.replace(/\?$/, "").toLowerCase()) ?? ["typical presentation"],
    expectedDisposition:  targetDx?.dispositionDefault?.toLowerCase() ?? "urgent_care",
    expectedTopDiagnosis: targetDx?.diagnosis ?? "REVIEW REQUIRED",
    confidenceFloor:      0.55,
    mustHaveRedFlag:      false,
  };
}

// ─── Main completion engine ───────────────────────────────────────────────────

export async function completePathwayDraft(
  request: CompletionRequest
): Promise<CompletionDraft> {

  const { partialPathway } = request;
  const slug       = partialPathway.slug ?? "unknown";
  const draftedAt  = new Date().toISOString();
  const fieldsCompleted:          string[] = [];
  const fieldsSkipped:            string[] = [];
  const requiresPhysicianReview:  string[] = [];

  const draft: Partial<ComplaintPathway> = { ...partialPathway };

  // ── Draft LR tables if missing or incomplete ─────────────────────────────
  const hasMissingLR = draft.differential?.some(d =>
    d.likelihoodRatios.supportingFindings.length === 0 ||
    d.likelihoodRatios.supportingFindings[0]?.source === "Imported from Google Sheets — add evidence source"
  );

  if (hasMissingLR || !draft.differential?.length) {
    try {
      draft.differential = await draftLRTables(draft);
      fieldsCompleted.push("differential.likelihoodRatios");
      requiresPhysicianReview.push(
        "LR tables — verify each LR value against the cited source before clinical use",
        "mustNotMiss flags — review each diagnosis and flag life-threatening ones",
        "dispositionDefault — verify each diagnosis disposition reflects your clinical judgment",
      );
    } catch {
      fieldsSkipped.push("differential.likelihoodRatios");
    }
  }

  // ── Draft physical exam if missing ────────────────────────────────────────
  if (!draft.physicalExam?.required?.length ||
      draft.physicalExam.required[0] === "REVIEW REQUIRED — add required exam components") {
    try {
      draft.physicalExam = await draftPhysicalExam(draft);
      fieldsCompleted.push("physicalExam");
      requiresPhysicianReview.push("Physical exam — verify required components match your clinical standard");
    } catch {
      fieldsSkipped.push("physicalExam");
    }
  }

  // ── Draft patient communication if missing ────────────────────────────────
  if (!draft.patientCommunication?.returnPrecautions?.length ||
      draft.patientCommunication.returnPrecautions[0] === "REVIEW REQUIRED — add return precautions") {
    try {
      draft.patientCommunication = await draftPatientCommunication(draft);
      fieldsCompleted.push("patientCommunication");
      requiresPhysicianReview.push("Return precautions — verify each warning sign is specific and actionable");
    } catch {
      fieldsSkipped.push("patientCommunication");
    }
  }

  // ── Generate drift canary ──────────────────────────────────────────────────
  const canary = await draftDriftCanary(draft);
  requiresPhysicianReview.push(
    `Drift canary — verify that "${canary.expectedTopDiagnosis}" is the correct expected diagnosis for a typical presentation`
  );

  // ── Validate the draft ────────────────────────────────────────────────────
  let validationScore  = 0;
  let validationErrors: string[] = [];
  try {
    const validation = validatePathway(draft as ComplaintPathway);
    validationScore  = validation.score;
    validationErrors = validation.errors;
  } catch {
    validationScore  = 0;
    validationErrors = ["Validation failed — pathway missing required fields"];
  }

  const draftConfidence: "high" | "moderate" | "low" =
    validationScore >= 80 && fieldsSkipped.length === 0 ? "moderate" :
    validationScore >= 60 ? "low" : "low";

  // ── Audit ──────────────────────────────────────────────────────────────────
  await appendAuditEvent({
    actor:      "system",
    action:     "PATHWAY_DRAFT_COMPLETED",
    entityId:   slug,
    entityType: "complaint_pathway",
    details: {
      fieldsCompleted:     fieldsCompleted.length,
      fieldsSkipped:       fieldsSkipped.length,
      validationScore,
      draftConfidence,
      requiresReviewCount: requiresPhysicianReview.length,
    },
  }).catch(console.error);

  // ── Save draft for physician review (never auto-load to KB) ───────────────
  await db.execute(sql`
    INSERT INTO pathway_drafts (
      slug, display_name, drafted_at, validation_score,
      draft_json, review_items, status
    ) VALUES (
      ${slug}, ${draft.displayName ?? slug}, ${draftedAt}, ${validationScore},
      ${JSON.stringify(draft)}, ${JSON.stringify(requiresPhysicianReview)},
      'pending_physician_review'
    )
    ON CONFLICT (slug) DO UPDATE SET
      draft_json       = ${JSON.stringify(draft)},
      drafted_at       = ${draftedAt},
      validation_score = ${validationScore},
      status           = 'pending_physician_review'
  `).catch(console.error);

  return {
    slug,
    displayName:             draft.displayName ?? slug,
    draftedAt,
    fieldsCompleted,
    fieldsSkipped,
    draft,
    validationScore,
    validationErrors,
    requiresPhysicianReview,
    draftConfidence,
  };
}

// ─── Batch completion ─────────────────────────────────────────────────────────
// Processes a list of P1 critical pathway slugs as a background job.

export async function runBatchCompletion(
  slugs:       string[],
  onProgress?: (slug: string, score: number) => void
): Promise<{ completed: number; failed: number; totalScore: number }> {

  let completed  = 0;
  let failed     = 0;
  let totalScore = 0;

  for (const slug of slugs) {
    try {
      const existing = await db.execute(sql`
        SELECT pathway_json FROM clinical_pathways WHERE slug = ${slug}
      `).catch(() => ({ rows: [] }));

      const partialPathway: Partial<ComplaintPathway> = existing.rows[0]
        ? JSON.parse((existing.rows[0] as any).pathway_json)
        : { slug, displayName: slug.replace(/_/g, " ") };

      const draft = await completePathwayDraft({ partialPathway });
      totalScore += draft.validationScore;
      completed++;

      onProgress?.(slug, draft.validationScore);

      // Rate-limit — avoid overwhelming the LLM gateway
      await new Promise(r => setTimeout(r, 3000));

    } catch (err: any) {
      console.error(`[PathwayCompletion] Failed for ${slug}: ${err.message}`);
      failed++;
    }
  }

  return { completed, failed, totalScore: Math.round(totalScore / Math.max(completed, 1)) };
}

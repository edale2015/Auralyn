/**
 * priorAuthWithIndex.ts
 * Drop into: server/integrations/ehr/priorAuthWithIndex.ts
 *
 * ENHANCED PRIOR AUTH USING PAGEINDEX NAVIGATION
 *
 * THE PROBLEM WITH priorAuthSkeleton.ts:
 * The current implementation has 14 hardcoded CMS-style rules.
 * Real payer prior auth policies (United, Aetna, Cigna, Humana) are
 * 50-200 page PDFs with complex hierarchical rule structures:
 *   Part I: General requirements
 *   Part II: Imaging (MRI, CT, PET, Nuclear)
 *     Section A: Brain/Neurology
 *       2.1 MRI Brain — clinical indications, criteria, documentation
 *   Part III: Procedures
 *   etc.
 *
 * The hardcoded rules miss 95% of real policy complexity.
 * A physician asking "does this MRI need prior auth?" gets a yes/no
 * from 14 rules when the actual policy has 200 clinical criteria.
 *
 * THE SOLUTION:
 * Index real payer policy PDFs using ClinicalDocumentIndexer.
 * Navigate the index tree to find the specific procedure/diagnosis combination.
 * Return the actual policy text with exact citation.
 *
 * HOW IT WORKS:
 *   1. Payer policy PDF uploaded once → index generated and stored
 *   2. Prior auth query arrives with CPT code + diagnosis + patient info
 *   3. Tree navigation finds the specific coverage section
 *   4. Full policy section retrieved (not a chunk — the complete criteria)
 *   5. LLM extracts: required? documentation needed? alternatives required?
 *   6. Returns structured response with page citation for physician
 *
 * FALLBACK:
 * If no index exists for a payer, falls back to priorAuthSkeleton.ts rules.
 * This ensures the existing functionality is never broken.
 *
 * WIRING:
 * In priorAuthSkeleton.ts, replace the assessPriorAuth() function call with:
 *   import { assessPriorAuthWithIndex } from "./priorAuthWithIndex";
 *   // Enhanced version tries index first, falls back to skeleton rules
 */

import { ClinicalDocumentIndexer } from "../../retrieval/clinicalDocumentIndexer";
import { assessPriorAuth }          from "./priorAuthSkeleton";
import { appendAuditEvent }         from "../../governance/audit";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriorAuthInput {
  caseId:           string;
  cptCode:          string;     // e.g., "70553" for MRI Brain with contrast
  diagnosisCode:    string;     // ICD-10, e.g., "G43.909" for migraine
  procedureDisplay: string;     // e.g., "MRI Brain with contrast"
  diagnosisDisplay: string;     // e.g., "Migraine without aura"
  payerId:          string;     // e.g., "united_healthcare", "aetna", "cigna"
  patientAge?:      number;
  clinicalNotes?:   string;     // physician notes for context
}

export interface PriorAuthResult {
  required:          boolean;
  confidence:        "high" | "moderate" | "low";
  authStatus:        "required" | "not_required" | "conditional" | "unknown";
  documentationNeeded: string[];
  stepTherapyRequired: boolean;
  stepTherapyDetails?: string;
  policyText:        string;    // the actual policy language
  citation:          string;    // page reference
  policySource:      string;    // which policy document was used
  usedIndex:         boolean;   // true = navigated real policy, false = used skeleton rules
  rawAnswer:         string;    // full LLM answer from policy navigation
}

// ─── Payer document ID registry ───────────────────────────────────────────────
// Maps payer IDs to their indexed policy document IDs.
// When a new policy PDF is uploaded and indexed, add its documentId here.

const PAYER_POLICY_REGISTRY: Record<string, {
  documentId: string;
  policyName: string;
  effectiveDate: string;
}> = {
  // Example entries — populate as real policies are uploaded and indexed
  // "united_healthcare": {
  //   documentId: "uhc-2025-medical-policy-prior-auth",
  //   policyName: "UnitedHealthcare Medical Policy Prior Authorization Guide 2025",
  //   effectiveDate: "2025-01-01",
  // },
  // "aetna": {
  //   documentId: "aetna-2025-clinical-policy-bulletins",
  //   policyName: "Aetna Clinical Policy Bulletins 2025",
  //   effectiveDate: "2025-01-01",
  // },
};

// ─── Query builder ────────────────────────────────────────────────────────────
// Constructs the clinical query for navigating the payer policy index.

function buildPriorAuthQuery(input: PriorAuthInput): string {
  return [
    `Prior authorization requirement for: ${input.procedureDisplay} (CPT ${input.cptCode})`,
    `Diagnosis: ${input.diagnosisDisplay} (${input.diagnosisCode})`,
    input.patientAge ? `Patient age: ${input.patientAge}` : "",
    `Does this procedure require prior authorization?`,
    `What clinical documentation is required?`,
    `Are there step therapy requirements?`,
  ].filter(Boolean).join("\n");
}

// ─── Answer parser ────────────────────────────────────────────────────────────
// Extracts structured prior auth determination from the LLM's policy navigation answer.

function parsePriorAuthAnswer(
  rawAnswer: string,
  citation:  string,
  source:    string
): Omit<PriorAuthResult, "caseId" | "usedIndex"> {

  const lower = rawAnswer.toLowerCase();

  // Determine requirement
  const required =
    lower.includes("prior authorization is required") ||
    lower.includes("requires prior authorization") ||
    lower.includes("authorization required") ||
    lower.includes("must obtain prior authorization");

  const notRequired =
    lower.includes("does not require prior authorization") ||
    lower.includes("no prior authorization required") ||
    lower.includes("prior authorization is not required") ||
    lower.includes("not subject to prior authorization");

  const conditional =
    lower.includes("may require") ||
    lower.includes("conditionally requires") ||
    lower.includes("depending on") ||
    lower.includes("clinical criteria must be met");

  const authStatus =
    notRequired   ? "not_required" :
    conditional   ? "conditional"  :
    required      ? "required"     : "unknown";

  // Extract documentation requirements
  const docPatterns = [
    /documentation (?:required|needed|must include)[:\s]+([^.]+\.)/gi,
    /must (?:include|provide|submit)[:\s]+([^.]+\.)/gi,
    /clinical (?:records|notes|documentation)[:\s]+([^.]+\.)/gi,
  ];

  const documentationNeeded: string[] = [];
  for (const pattern of docPatterns) {
    const matches = rawAnswer.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) documentationNeeded.push(match[1].trim());
    }
  }

  // Step therapy detection
  const stepTherapyRequired =
    lower.includes("step therapy") ||
    lower.includes("fail first") ||
    lower.includes("conservative treatment") ||
    lower.includes("prior trial of");

  // Confidence based on specificity of the answer
  const confidence: "high" | "moderate" | "low" =
    authStatus !== "unknown" && citation ? "high" :
    authStatus !== "unknown"             ? "moderate" : "low";

  return {
    required:            authStatus === "required" || authStatus === "conditional",
    confidence,
    authStatus,
    documentationNeeded: [...new Set(documentationNeeded)].slice(0, 5),
    stepTherapyRequired,
    stepTherapyDetails:  stepTherapyRequired
      ? rawAnswer.match(/step therapy[^.]+\./i)?.[0]
      : undefined,
    policyText:    rawAnswer.slice(0, 500),
    citation,
    policySource:  source,
    rawAnswer,
  };
}

// ─── Main enhanced prior auth assessor ───────────────────────────────────────

export async function assessPriorAuthWithIndex(
  input: PriorAuthInput,
  pageTexts?: Record<number, string>   // pass page texts if available; optional
): Promise<PriorAuthResult> {

  const payerPolicy = PAYER_POLICY_REGISTRY[input.payerId];

  // ── Try document index if policy is registered ─────────────────────────────
  if (payerPolicy && pageTexts) {
    try {
      const query  = buildPriorAuthQuery(input);
      const result = await ClinicalDocumentIndexer.query(
        payerPolicy.documentId,
        query,
        pageTexts
      );

      if (result.confidence !== "low" && result.answer) {
        const parsed = parsePriorAuthAnswer(
          result.answer,
          result.citations.join(", "),
          result.documentSource
        );

        await appendAuditEvent({
          actor:      "system",
          action:     "PRIOR_AUTH_ASSESSED_WITH_INDEX",
          entityId:   input.caseId,
          entityType: "prior_auth",
          details: {
            cptCode:    input.cptCode,
            payerId:    input.payerId,
            authStatus: parsed.authStatus,
            confidence: result.confidence,
            usedIndex:  true,
            pagesAccessed: result.citations.length,
          },
        }).catch(console.error);

        return {
          ...parsed,
          usedIndex: true,
        };
      }
    } catch (err: any) {
      console.warn(`[PriorAuthIndex] Index navigation failed for ${input.payerId}: ${err.message}. Falling back to skeleton rules.`);
    }
  }

  // ── Fallback: existing skeleton rules ──────────────────────────────────────
  const skeletonResult = await assessPriorAuth({
    caseId:           input.caseId,
    primaryDiagnosis: input.diagnosisCode,
    proposedOrders: [{
      type:    "imaging",
      code:    input.cptCode,
      display: input.procedureDisplay,
    }],
  });

  const matchingOrder = skeletonResult.orders.find(o => o.code === input.cptCode);

  await appendAuditEvent({
    actor:      "system",
    action:     "PRIOR_AUTH_ASSESSED_SKELETON",
    entityId:   input.caseId,
    entityType: "prior_auth",
    details: {
      cptCode:    input.cptCode,
      payerId:    input.payerId,
      authStatus: matchingOrder?.authStatus ?? "unknown",
      usedIndex:  false,
      reason:     payerPolicy ? "index_navigation_failed" : "no_policy_index_registered",
    },
  }).catch(console.error);

  return {
    required:            matchingOrder?.authStatus === "required",
    confidence:          "moderate",
    authStatus:          (matchingOrder?.authStatus as any) ?? "unknown",
    documentationNeeded: [],
    stepTherapyRequired: false,
    policyText:          matchingOrder?.rationale ?? "Assessed using CMS-style rules",
    citation:            "Skeleton rules — no page citation available",
    policySource:        "Auralyn built-in prior auth rules",
    usedIndex:           false,
    rawAnswer:           skeletonResult.summary,
  };
}

// ─── Policy upload helper ─────────────────────────────────────────────────────
// Use this to onboard a new payer policy PDF.

export async function indexPayerPolicy(
  payerId:       string,
  policyName:    string,
  documentText:  string,
  totalPages:    number,
  effectiveDate: string
): Promise<string> {

  const documentId = `${payerId}-policy-${effectiveDate.replace(/-/g, "")}`;

  await ClinicalDocumentIndexer.generateIndex(
    documentId,
    documentText,
    policyName,
    "prior_auth_policy",
    policyName,
    totalPages
  );

  // Register in registry (in production this would persist to DB)
  PAYER_POLICY_REGISTRY[payerId] = { documentId, policyName, effectiveDate };

  console.log(`[PriorAuthIndex] Indexed ${policyName} (${totalPages} pages) → ${documentId}`);
  return documentId;
}

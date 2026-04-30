/**
 * priorAuthWithIndex.ts
 * server/integrations/ehr/priorAuthWithIndex.ts
 *
 * ENHANCED PRIOR AUTH USING PAGEINDEX NAVIGATION
 *
 * Navigates real payer policy PDFs instead of hardcoded CMS-style rules.
 * Falls back to priorAuthSkeleton.ts when no index exists for a payer.
 */

import { ClinicalDocumentIndexer } from "../../retrieval/clinicalDocumentIndexer";
import { assessPriorAuth }          from "./priorAuthSkeleton";
import { appendAuditEvent }         from "../../governance/audit";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriorAuthInput {
  caseId:           string;
  cptCode:          string;
  diagnosisCode:    string;
  procedureDisplay: string;
  diagnosisDisplay: string;
  payerId:          string;
  patientAge?:      number;
  clinicalNotes?:   string;
}

export interface PriorAuthResult {
  required:             boolean;
  confidence:           "high" | "moderate" | "low";
  authStatus:           "required" | "not_required" | "conditional" | "unknown";
  documentationNeeded:  string[];
  stepTherapyRequired:  boolean;
  stepTherapyDetails?:  string;
  policyText:           string;
  citation:             string;
  policySource:         string;
  usedIndex:            boolean;
  rawAnswer:            string;
}

// ─── Payer document registry ──────────────────────────────────────────────────

const PAYER_POLICY_REGISTRY: Record<string, {
  documentId:    string;
  policyName:    string;
  effectiveDate: string;
}> = {
  // Populate as real payer policies are uploaded and indexed.
  // Example:
  // united_healthcare: {
  //   documentId:    "uhc-2025-medical-policy-prior-auth",
  //   policyName:    "UnitedHealthcare Medical Policy Prior Authorization Guide 2025",
  //   effectiveDate: "2025-01-01",
  // },
};

// ─── Query builder ────────────────────────────────────────────────────────────

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

function parsePriorAuthAnswer(
  rawAnswer: string,
  citation:  string,
  source:    string
): Omit<PriorAuthResult, "usedIndex"> {

  const lower = rawAnswer.toLowerCase();

  const required = lower.includes("prior authorization is required") ||
    lower.includes("requires prior authorization") ||
    lower.includes("authorization required") ||
    lower.includes("must obtain prior authorization");

  const notRequired = lower.includes("does not require prior authorization") ||
    lower.includes("no prior authorization required") ||
    lower.includes("prior authorization is not required") ||
    lower.includes("not subject to prior authorization");

  const conditional = lower.includes("may require") ||
    lower.includes("conditionally requires") ||
    lower.includes("depending on") ||
    lower.includes("clinical criteria must be met");

  const authStatus: PriorAuthResult["authStatus"] =
    notRequired ? "not_required" :
    conditional ? "conditional"  :
    required    ? "required"     : "unknown";

  const docPatterns = [
    /documentation (?:required|needed|must include)[:\s]+([^.]+\.)/gi,
    /must (?:include|provide|submit)[:\s]+([^.]+\.)/gi,
    /clinical (?:records|notes|documentation)[:\s]+([^.]+\.)/gi,
  ];

  const documentationNeeded: string[] = [];
  for (const pattern of docPatterns) {
    for (const match of rawAnswer.matchAll(pattern)) {
      if (match[1]) documentationNeeded.push(match[1].trim());
    }
  }

  const stepTherapyRequired = lower.includes("step therapy") ||
    lower.includes("fail first") ||
    lower.includes("conservative treatment") ||
    lower.includes("prior trial of");

  const confidence: PriorAuthResult["confidence"] =
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

// ─── Main assessor ────────────────────────────────────────────────────────────

export async function assessPriorAuthWithIndex(
  input:      PriorAuthInput,
  pageTexts?: Record<number, string>
): Promise<PriorAuthResult> {

  const payerPolicy = PAYER_POLICY_REGISTRY[input.payerId];

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
            cptCode:       input.cptCode,
            payerId:       input.payerId,
            authStatus:    parsed.authStatus,
            confidence:    result.confidence,
            usedIndex:     true,
            pagesAccessed: result.citations.length,
          },
        }).catch(console.error);

        return { ...parsed, usedIndex: true };
      }
    } catch (err: any) {
      console.warn(`[PriorAuthIndex] Index navigation failed for ${input.payerId}: ${err.message}. Falling back.`);
    }
  }

  // ── Fallback: skeleton rules ───────────────────────────────────────────────
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

  PAYER_POLICY_REGISTRY[payerId] = { documentId, policyName, effectiveDate };

  console.log(`[PriorAuthIndex] Indexed ${policyName} (${totalPages} pages) → ${documentId}`);
  return documentId;
}

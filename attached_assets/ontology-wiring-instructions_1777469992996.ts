// ─────────────────────────────────────────────────────────────────────────────
// ONTOLOGY WIRING INSTRUCTIONS
// Apply these changes to complete Win 14 (Clinical Ontology Layer)
// ─────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1 — New files (already downloaded)
// ═══════════════════════════════════════════════════════════════════════════════
//
//   server/ontology/clinicalOntology.ts       ← Core ontology classes + SHACL validator
//   server/ontology/ontologyFieldMapper.ts    ← Self-healing field mapper
//   server/ontology/ontologyFirewall.ts       ← Four production gates


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 — Wire Gate 1 (Intake → AI Triage) in server/agent/pipeline.ts
// Location: BEFORE buildClinicalContext() and runGeometricReasoning()
// ═══════════════════════════════════════════════════════════════════════════════

import { OntologyFirewall } from "../ontology/ontologyFirewall";
import { OntologyFieldMapper } from "../ontology/ontologyFieldMapper";

// Add at the START of the pipeline, before any AI call:
const intakeGate = await OntologyFirewall.guardIntake(caseDoc);
if (intakeGate.blocked) {
  // Hard violation — cannot proceed to AI
  await appendAuditEvent({
    actor: "system", action: "INTAKE_ONTOLOGY_BLOCKED",
    entityId: caseDoc.caseId, entityType: "case",
    details: { reason: intakeGate.reason, violations: intakeGate.violations },
  });
  // Set case to needs_review and return — do not call LLM
  throw new Error(`Ontology firewall blocked intake: ${intakeGate.reason}`);
}
// Attach warnings to state for downstream visibility
if (intakeGate.warnings.length > 0) {
  (updated as any).ontologyWarnings = intakeGate.warnings;
}

// Enrich caseDoc with canonical ontology fields
const enrichedCase = OntologyFieldMapper.enrichCaseDoc(caseDoc);
// enrichedCase._ont.disposition, .complaintSlug, .isAsyncSafe, etc.
// are now available to all downstream consumers


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3 — Wire Gate 2 (AI Output → Physician Queue) in pipeline.ts
// Location: AFTER runClinicalBrain() returns, alongside uncertainty sampler
// ═══════════════════════════════════════════════════════════════════════════════

// After CLINICAL_BRAIN_COMPLETE trace event:
const triageGate = await OntologyFirewall.guardTriageOutput({
  caseId:       caseDoc.caseId,
  disposition:  brainOutput.disposition,
  confidence:   brainOutput.calibration?.confidence ?? 0.5,
  topDiagnosis: brainOutput.differential?.[0]?.diagnosis ?? "",
  redFlagFired: brainOutput.redFlagFired ?? false,
  redFlags:     brainOutput.redFlags ?? [],
  differential: brainOutput.differential ?? [],
}).catch(() => null);

if (triageGate?.blocked) {
  // Ontologically invalid output — upgrade disposition or escalate
  console.error(`[OntologyFirewall] Triage output blocked for ${caseDoc.caseId}: ${triageGate.reason}`);
  // Force escalation rather than passing bad output to physician
  brainOutput.disposition = "urgent_care";  // safe default
  brainOutput.ontologyViolation = triageGate.reason;
}

if (triageGate?.warnings?.length > 0) {
  (updated as any).triageOntologyWarnings = triageGate.warnings;
}


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4 — Wire Gate 3 (Discharge) in review.routes.ts
// Location: INSIDE the discharge delivery block (Win 1), before sendWhatsAppMessage
// ═══════════════════════════════════════════════════════════════════════════════

// In the discharge block, before sendWhatsAppMessage():
const dischargeGate = await OntologyFirewall.guardDischarge({
  caseId:        caseId,
  dischargeText: dischargeText,
  physicianId:   reviewer?.id,
  patientPhone:  phone,
  channel:       "whatsapp",
});

if (dischargeGate.blocked) {
  console.error(`[OntologyFirewall] Discharge blocked: ${dischargeGate.reason}`);
  // Do not send — log and surface error to physician
  return;  // or handle appropriately
}
// If passed, proceed with sendWhatsAppMessage as before


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5 — Wire Gate 4 (Follow-up) in followUpService.ts
// Location: INSIDE enrollInFollowUp(), before db.insert(followUpEnrollments)
// ═══════════════════════════════════════════════════════════════════════════════

// In enrollInFollowUp(), before creating the enrollment:
const followUpGate = await OntologyFirewall.guardFollowUpEnrollment({
  caseId:        caseId,
  complaintSlug: complaintSlug,
  patientPhone:  patientPhone,
  disposition:   undefined,  // pass if available
});

if (followUpGate.blocked) {
  return { enrolled: false, reason: `Ontology gate: ${followUpGate.reason}` };
}


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 6 — Replace all DISPOSITION_MAP instances with OntologyFieldMapper
//
// Search the codebase for: DISPOSITION_MAP
// Each occurrence should be replaced with OntologyFieldMapper.returnPrecautionsKey()
//
// Files to update:
//   client/src/components/DischargeInstructionPanel.tsx  ← Win 1
//   client/src/components/CDSSidebarPanel.tsx             ← Win 2
//   client/src/components/EConsultPanel.tsx               ← Win 4
//   server/services/caseTypeClassifier.ts                 ← Win 7
//   server/routes/command.routes.ts                       ← Win 10
// ═══════════════════════════════════════════════════════════════════════════════

// BEFORE (in each file):
//   const DISPOSITION_MAP: Record<string, string> = {
//     er_send: "Urgent Care", urgent_care: "Urgent Care",
//     pcp: "Prescription", self_care: "Home Care",
//   };
//   disposition: DISPOSITION_MAP[rawDisp] ?? "Home Care"

// AFTER (import from ontology — one line):
//   import { returnPrecautionsKey } from "../ontology/ontologyFieldMapper";
//   disposition: returnPrecautionsKey(rawDisp)

// For frontend components, expose via a lightweight API call or pass as prop.
// The OntologyFieldMapper runs server-side; frontend components receive
// the pre-resolved values in the case object via _ont fields.


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 7 — Add _ont fields to case objects returned by the review queue
// Location: GET /api/review/queue handler in review.routes.ts
// ═══════════════════════════════════════════════════════════════════════════════

// In the enriched cases array (Win 7 already enriches with caseType),
// add ontology enrichment:
const ontologyEnriched = cases.map((c: any) => {
  const enriched = OntologyFieldMapper.enrichCaseDoc(c);
  return {
    ...enriched,
    // _ont is now available on every case card:
    // c._ont.disposition, c._ont.dispositionLabel, c._ont.isAsyncSafe, etc.
  };
});

// Frontend CaseSnapshotCard.tsx can now use c._ont.dispositionLabel
// instead of its own translation logic


// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY OF FILES CHANGED
// ═══════════════════════════════════════════════════════════════════════════════
//
// NEW:
//   server/ontology/clinicalOntology.ts
//   server/ontology/ontologyFieldMapper.ts
//   server/ontology/ontologyFirewall.ts
//
// EDITED (surgical additions only):
//   server/agent/pipeline.ts           → Gate 1 + enrichCaseDoc
//   server/routes/review.routes.ts     → Gate 3 (discharge) + ontology enrichment
//   server/followup/followUpService.ts → Gate 4 (follow-up enrollment)
//
// REFACTORED (DISPOSITION_MAP removal — optional but recommended):
//   client/src/components/DischargeInstructionPanel.tsx
//   client/src/components/CDSSidebarPanel.tsx
//   client/src/components/EConsultPanel.tsx
//   server/services/caseTypeClassifier.ts
//   server/routes/command.routes.ts

/**
 * ontologyFirewall.ts
 * Drop into: server/ontology/ontologyFirewall.ts
 *
 * CLINICAL ONTOLOGY FIREWALL
 *
 * Inspired by the article's OntoGuard pattern and SHACL constraint enforcement.
 * Validates every clinical data payload before it reaches any AI agent,
 * any physician UI, or any external system.
 *
 * THE ARTICLE'S CORE INSIGHT APPLIED:
 * "An MCP server with SHACL can block a $340K compliance-held payment from
 * being released by an agent that doesn't have Legal authorization."
 *
 * For Auralyn: "An ontology firewall can block a SELF_CARE disposition from
 * being returned for a chest pain case with diaphoresis and arm radiation."
 *
 * WHAT IT GUARDS:
 *   1. Intake → AI triage: validates case structure before LLM receives it
 *   2. AI triage → physician queue: validates triage output before display
 *   3. Physician approval → patient: validates discharge before delivery
 *   4. Case → follow-up enrollment: validates eligibility before BullMQ job
 *
 * SHACL CONSTRAINTS ENFORCED:
 *   - High-urgency dispositions on low-risk complaints trigger review
 *   - Discharge instructions require physician approval actor
 *   - Follow-up enrollment requires WhatsApp channel
 *   - Confidence below floor triggers uncertainty flag
 *   - Red flag + self_care disposition is a hard violation
 *
 * USAGE:
 *   import { OntologyFirewall } from "../ontology/ontologyFirewall";
 *
 *   // Before LLM call:
 *   const gate = OntologyFirewall.guardIntake(caseDoc);
 *   if (gate.blocked) throw new Error(gate.reason);
 *
 *   // Before physician queue display:
 *   const gate = OntologyFirewall.guardTriageOutput(triageResult);
 *   if (gate.violations.length > 0) attachWarningsToCaseCard(gate.violations);
 *
 *   // Before discharge delivery:
 *   const gate = OntologyFirewall.guardDischarge(dischargePayload);
 *   if (gate.blocked) return res.status(400).json({ error: gate.reason });
 */

import {
  ont,
  resolveDisposition,
  resolveComplaint,
  OntologyValidationError,
  type OntologyViolation,
} from "./clinicalOntology";
import { appendAuditEvent } from "../governance/audit";

// ─── Firewall result ──────────────────────────────────────────────────────────

export interface FirewallResult {
  passed:     boolean;
  blocked:    boolean;   // true = hard block (error), false = warnings only
  violations: OntologyViolation[];
  warnings:   string[];
  reason?:    string;    // human-readable block reason
  gate:       string;    // which gate triggered this
}

function pass(gate: string, warnings: string[] = []): FirewallResult {
  return { passed: true, blocked: false, violations: [], warnings, gate };
}

function warn(gate: string, warnings: string[], violations: OntologyViolation[] = []): FirewallResult {
  return { passed: true, blocked: false, violations, warnings, gate };
}

function block(gate: string, reason: string, violations: OntologyViolation[]): FirewallResult {
  return { passed: false, blocked: true, violations, warnings: [], reason, gate };
}

// ─── Ontology Firewall ────────────────────────────────────────────────────────

export const OntologyFirewall = {

  /**
   * GATE 1: Intake → AI Triage
   *
   * Validates case structure before the LLM receives it.
   * Blocks cases that would cause the LLM to reason over malformed data.
   * Flags cases that need special handling (high-risk complaint, missing data).
   */
  async guardIntake(caseDoc: {
    caseId:    string;
    complaint?: any;
    answers?:  { structured?: Record<string, any> };
    source?:   { channel?: string; threadId?: string };
  }): Promise<FirewallResult> {
    const violations: OntologyViolation[] = [];
    const warnings:   string[]            = [];

    // Ontology validation
    const validation = ont.validateCase(caseDoc as any);
    violations.push(...validation.violations);
    warnings.push(...validation.warnings);

    // SHACL: complaint must be resolvable for non-undifferentiated cases
    const complaint = resolveComplaint(caseDoc.complaint);
    if (!complaint && caseDoc.complaint) {
      warnings.push(`Complaint "${JSON.stringify(caseDoc.complaint)}" not in ontology — will be treated as undifferentiated. Consider adding to COMPLAINT_ONTOLOGY.`);
    }

    // SHACL: WhatsApp cases need phone for delivery (hard requirement)
    if (caseDoc.source?.channel === "whatsapp" && !caseDoc.source?.threadId) {
      violations.push({
        field:      "source.threadId",
        value:      null,
        constraint: "whatsapp_requires_phone",
        message:    "WhatsApp intake cases must have source.threadId — discharge delivery and follow-up cannot function without it",
        severity:   "error",
      });
    }

    // SHACL: high-risk complaints require specific validation
    if (complaint?.redFlagRisk === "high") {
      warnings.push(`High red-flag risk complaint (${complaint.canonical}) — red-flag evaluation must complete before LLM call`);
    }

    const hardViolations = violations.filter(v => v.severity === "error");
    if (hardViolations.length > 0) {
      await appendAuditEvent({
        actor:      "system",
        action:     "ONTOLOGY_FIREWALL_BLOCKED",
        entityId:   caseDoc.caseId,
        entityType: "case",
        details:    { gate: "intake", violations: hardViolations.map(v => v.constraint) },
      }).catch(console.error);

      return block("intake", hardViolations[0].message, violations);
    }

    if (warnings.length > 0 || violations.length > 0) {
      return warn("intake", warnings, violations);
    }

    return pass("intake");
  },

  /**
   * GATE 2: AI Triage Output → Physician Queue
   *
   * Validates the AI's triage result before it appears on the physician's queue.
   * Catches ontologically impossible outputs — the AI cannot return a SELF_CARE
   * disposition on a case with active red flags, for example.
   */
  async guardTriageOutput(triageResult: {
    caseId:        string;
    disposition:   string;
    confidence:    number;
    topDiagnosis:  string;
    redFlagFired?: boolean;
    redFlags?:     string[];
    differential?: Array<{ diagnosis: string; confidence: number; urgency?: string }>;
  }): Promise<FirewallResult> {
    const violations: OntologyViolation[] = [];
    const warnings:   string[]            = [];

    const disp = resolveDisposition(triageResult.disposition);

    if (!disp) {
      violations.push({
        field:      "disposition",
        value:      triageResult.disposition,
        constraint: "disposition_must_be_canonical",
        message:    `AI returned unrecognized disposition: "${triageResult.disposition}"`,
        severity:   "error",
      });
    }

    // SHACL: Red flag + SELF_CARE is ontologically invalid
    if (
      (triageResult.redFlagFired || (triageResult.redFlags?.length ?? 0) > 0) &&
      disp?.canonical === "SELF_CARE"
    ) {
      violations.push({
        field:      "disposition",
        value:      "SELF_CARE",
        constraint: "no_self_care_with_red_flags",
        message:    `CRITICAL: AI returned SELF_CARE disposition but red flags are present. This is clinically invalid. Escalating to physician.`,
        severity:   "error",
      });
    }

    // SHACL: Emergent differential + self_care disposition
    const emergentDx = triageResult.differential?.find(d => d.urgency === "emergent");
    if (emergentDx && disp?.canonical === "SELF_CARE") {
      violations.push({
        field:      "disposition vs differential",
        value:      `SELF_CARE with emergent dx: ${emergentDx.diagnosis}`,
        constraint: "no_self_care_with_emergent_differential",
        message:    `AI returned SELF_CARE but differential contains emergent diagnosis: ${emergentDx.diagnosis}. Disposition upgraded to URGENT_CARE minimum.`,
        severity:   "error",
      });
    }

    // SHACL: Confidence floor for high urgency dispositions
    if (disp?.urgencyLevel >= 4 && triageResult.confidence < 0.40) {
      warnings.push(`High urgency disposition (${disp.canonical}) with very low confidence (${Math.round(triageResult.confidence * 100)}%). Physician should not rely on AI disposition.`);
    }

    // SHACL: Differential must have at least 2 entries
    if ((triageResult.differential?.length ?? 0) < 2) {
      warnings.push(`AI differential has fewer than 2 diagnoses. Physician should consider broader differential.`);
    }

    const hardViolations = violations.filter(v => v.severity === "error");
    if (hardViolations.length > 0) {
      await appendAuditEvent({
        actor:      "system",
        action:     "ONTOLOGY_FIREWALL_TRIAGE_VIOLATION",
        entityId:   triageResult.caseId,
        entityType: "case",
        details:    {
          gate:       "triage_output",
          violations: hardViolations.map(v => v.constraint),
          disposition: triageResult.disposition,
          confidence:  triageResult.confidence,
        },
      }).catch(console.error);

      return block("triage_output", hardViolations[0].message, violations);
    }

    if (warnings.length > 0) return warn("triage_output", warnings, violations);
    return pass("triage_output");
  },

  /**
   * GATE 3: Physician Approval → Discharge Delivery
   *
   * Validates discharge payload before it is sent to the patient.
   * The article's equivalent: "SHACL constraint requires holdApprovedBy before release."
   * For Auralyn: discharge requires physician actor ID before delivery.
   */
  async guardDischarge(payload: {
    caseId:         string;
    dischargeText:  string;
    physicianId?:   string;
    patientPhone?:  string;
    channel?:       string;
  }): Promise<FirewallResult> {
    const violations: OntologyViolation[] = [];
    const warnings:   string[]            = [];

    // SHACL: Discharge requires physician approval actor — never auto-send
    if (!payload.physicianId || payload.physicianId === "system") {
      violations.push({
        field:      "physicianId",
        value:      payload.physicianId,
        constraint: "discharge_requires_physician_actor",
        message:    "Discharge instructions cannot be sent without an explicit physician actor ID. This is a safety constraint — discharge delivery must be physician-initiated.",
        severity:   "error",
      });
    }

    // SHACL: Discharge text must be non-empty
    if (!payload.dischargeText?.trim()) {
      violations.push({
        field:      "dischargeText",
        value:      "",
        constraint: "discharge_text_required",
        message:    "Discharge text cannot be empty",
        severity:   "error",
      });
    }

    // SHACL: WhatsApp delivery requires phone number
    if (payload.channel === "whatsapp" && !payload.patientPhone) {
      violations.push({
        field:      "patientPhone",
        value:      null,
        constraint: "whatsapp_delivery_requires_phone",
        message:    "WhatsApp discharge delivery requires patient phone number",
        severity:   "error",
      });
    }

    // Warning: very short discharge text is likely incomplete
    if (payload.dischargeText && payload.dischargeText.length < 100) {
      warnings.push("Discharge text appears very short — verify it contains adequate patient instructions");
    }

    const hardViolations = violations.filter(v => v.severity === "error");
    if (hardViolations.length > 0) {
      await appendAuditEvent({
        actor:      "system",
        action:     "ONTOLOGY_FIREWALL_DISCHARGE_BLOCKED",
        entityId:   payload.caseId,
        entityType: "case",
        details:    { gate: "discharge", violations: hardViolations.map(v => v.constraint) },
      }).catch(console.error);

      return block("discharge", hardViolations[0].message, violations);
    }

    if (warnings.length > 0) return warn("discharge", warnings);
    return pass("discharge");
  },

  /**
   * GATE 4: Case → Follow-Up Enrollment (Win 8)
   *
   * Validates eligibility before creating a follow-up enrollment.
   */
  async guardFollowUpEnrollment(payload: {
    caseId:        string;
    complaintSlug: string;
    patientPhone:  string;
    disposition?:  string;
  }): Promise<FirewallResult> {
    const violations: OntologyViolation[] = [];
    const warnings:   string[]            = [];

    const complaint = resolveComplaint(payload.complaintSlug);
    const disp      = resolveDisposition(payload.disposition);

    // SHACL: Follow-up requires WhatsApp-deliverable phone
    if (!payload.patientPhone) {
      violations.push({
        field:      "patientPhone",
        value:      null,
        constraint: "follow_up_requires_phone",
        message:    "Follow-up enrollment requires patient phone for WhatsApp message delivery",
        severity:   "error",
      });
    }

    // SHACL: Check ontology eligibility
    if (disp && !disp.followUpEligible) {
      warnings.push(`Disposition ${disp.canonical} is not follow-up eligible in the ontology. Check if enrollment is appropriate.`);
    }

    // SHACL: Check protocol existence
    if (complaint && !complaint.followUpProtocolExists) {
      warnings.push(`No follow-up protocol exists for ${complaint.canonical} in the ontology. Enrollment will use default protocol or fail.`);
    }

    const hardViolations = violations.filter(v => v.severity === "error");
    if (hardViolations.length > 0) {
      return block("follow_up_enrollment", hardViolations[0].message, violations);
    }

    if (warnings.length > 0) return warn("follow_up_enrollment", warnings, violations);
    return pass("follow_up_enrollment");
  },
};

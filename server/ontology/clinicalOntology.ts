/**
 * clinicalOntology.ts
 * server/ontology/clinicalOntology.ts
 *
 * THE AURALYN CLINICAL ONTOLOGY
 *
 * The shared semantic contract for all clinical data in Auralyn.
 * Defines what clinical terms mean precisely, unambiguously, and enforceably
 * so that no agent, service, or subsystem can misinterpret what another sent.
 */

// ─── Core ontological classes ─────────────────────────────────────────────────

export type DispositionCanonical =
  | "ER_SEND"
  | "URGENT_CARE"
  | "PCP"
  | "SELF_CARE";

export interface DispositionClass {
  canonical:                DispositionCanonical;
  label:                    string;
  urgencyLevel:             1 | 2 | 3 | 4 | 5;
  requiresPhysicianContact: boolean;
  typicalTimeframe:         string;
  aliases:                  string[];
  returnPrecautionsKey:     string;
  followUpEligible:         boolean;
  eConsultEligible:         boolean;
  constraints:              string[];
}

export const DISPOSITION_ONTOLOGY: Record<DispositionCanonical, DispositionClass> = {
  ER_SEND: {
    canonical:               "ER_SEND",
    label:                   "Emergency Department",
    urgencyLevel:            5,
    requiresPhysicianContact: true,
    typicalTimeframe:        "Immediate — call 911 or go to ED now",
    aliases: [
      "er_send", "er send", "emergency", "ER", "ED",
      "Urgent Care",
      "emergent", "EMERGENT",
      "er_now", "go_to_er",
    ],
    returnPrecautionsKey:   "Urgent Care",
    followUpEligible:       false,
    eConsultEligible:       false,
    constraints: [
      "physician_contact_required",
      "no_async_review",
      "red_flag_expected",
    ],
  },

  URGENT_CARE: {
    canonical:               "URGENT_CARE",
    label:                   "Urgent Care Visit",
    urgencyLevel:            4,
    requiresPhysicianContact: true,
    typicalTimeframe:        "Same day or within 24 hours",
    aliases: [
      "urgent_care", "urgent care", "URGENT_CARE",
      "urgent", "URGENT",
      "same_day", "today",
    ],
    returnPrecautionsKey:   "Urgent Care",
    followUpEligible:       true,
    eConsultEligible:       true,
    constraints: [
      "physician_contact_required",
      "no_async_review",
    ],
  },

  PCP: {
    canonical:               "PCP",
    label:                   "Primary Care / Specialist",
    urgencyLevel:            3,
    requiresPhysicianContact: false,
    typicalTimeframe:        "Within 1-2 weeks",
    aliases: [
      "pcp", "PCP", "primary_care", "primary care",
      "Prescription",
      "specialist", "referral",
      "follow_up", "followup",
      "outpatient",
    ],
    returnPrecautionsKey:   "Prescription",
    followUpEligible:       true,
    eConsultEligible:       true,
    constraints: [
      "async_review_eligible",
    ],
  },

  SELF_CARE: {
    canonical:               "SELF_CARE",
    label:                   "Home Self-Care",
    urgencyLevel:            1,
    requiresPhysicianContact: false,
    typicalTimeframe:        "Manage at home, return if worsening",
    aliases: [
      "self_care", "self care", "SELF_CARE",
      "Home Care",
      "home", "home_care", "homecare",
      "routine", "ROUTINE",
      "no_visit_needed",
    ],
    returnPrecautionsKey:   "Home Care",
    followUpEligible:       false,
    eConsultEligible:       false,
    constraints: [
      "async_review_eligible",
      "no_red_flag_present",
    ],
  },
};

// ─── Complaint class ──────────────────────────────────────────────────────────

export interface ComplaintClass {
  canonical:              string;
  displayName:            string;
  icdCategory:            string;
  acuityClass:            "emergent" | "urgent" | "routine" | "chronic";
  redFlagRisk:            "high" | "medium" | "low";
  asyncSafeDefault:       boolean;
  followUpProtocolExists: boolean;
  aliases:                string[];
}

export const COMPLAINT_ONTOLOGY: Record<string, ComplaintClass> = {
  chest_pain: {
    canonical:     "chest_pain",
    displayName:   "Chest Pain",
    icdCategory:   "R07",
    acuityClass:   "urgent",
    redFlagRisk:   "high",
    asyncSafeDefault: false,
    followUpProtocolExists: false,
    aliases: ["chest pain", "chest_pain", "CP", "chest discomfort", "chest pressure"],
  },
  sore_throat: {
    canonical:     "sore_throat",
    displayName:   "Sore Throat",
    icdCategory:   "J02",
    acuityClass:   "routine",
    redFlagRisk:   "low",
    asyncSafeDefault: false,
    followUpProtocolExists: false,
    aliases: ["sore throat", "sore_throat", "pharyngitis", "throat pain", "throat_pain"],
  },
  uti: {
    canonical:     "uti",
    displayName:   "Urinary Tract Infection",
    icdCategory:   "N39.0",
    acuityClass:   "routine",
    redFlagRisk:   "low",
    asyncSafeDefault: true,
    followUpProtocolExists: true,
    aliases: ["uti", "UTI", "urinary tract infection", "urinary_tract_infection", "dysuria"],
  },
  hypertensive_urgency: {
    canonical:     "hypertensive_urgency",
    displayName:   "Hypertensive Urgency",
    icdCategory:   "I16.0",
    acuityClass:   "urgent",
    redFlagRisk:   "high",
    asyncSafeDefault: false,
    followUpProtocolExists: true,
    aliases: ["hypertensive_urgency", "hypertension", "high blood pressure", "htn urgency"],
  },
  hyperglycemia: {
    canonical:     "hyperglycemia",
    displayName:   "Hyperglycemia / High Blood Sugar",
    icdCategory:   "E11",
    acuityClass:   "urgent",
    redFlagRisk:   "medium",
    asyncSafeDefault: false,
    followUpProtocolExists: true,
    aliases: ["hyperglycemia", "high blood sugar", "diabetes_high", "dm_hyperglycemia"],
  },
  asthma_exacerbation: {
    canonical:     "asthma_exacerbation",
    displayName:   "Asthma Exacerbation",
    icdCategory:   "J45",
    acuityClass:   "urgent",
    redFlagRisk:   "high",
    asyncSafeDefault: false,
    followUpProtocolExists: true,
    aliases: ["asthma_exacerbation", "asthma exacerbation", "asthma attack", "wheezing"],
  },
  pink_eye: {
    canonical:     "pink_eye",
    displayName:   "Conjunctivitis (Pink Eye)",
    icdCategory:   "H10",
    acuityClass:   "routine",
    redFlagRisk:   "low",
    asyncSafeDefault: true,
    followUpProtocolExists: false,
    aliases: ["pink_eye", "pink eye", "conjunctivitis", "red_eye", "eye_infection"],
  },
  medication_refill: {
    canonical:     "medication_refill",
    displayName:   "Medication Refill Request",
    icdCategory:   "Z76.0",
    acuityClass:   "routine",
    redFlagRisk:   "low",
    asyncSafeDefault: true,
    followUpProtocolExists: false,
    aliases: ["medication_refill", "refill", "prescription_refill", "med refill"],
  },
};

// ─── Resolution functions ─────────────────────────────────────────────────────

export function resolveDisposition(raw: string | undefined | null): DispositionClass | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  for (const dispClass of Object.values(DISPOSITION_ONTOLOGY)) {
    if (dispClass.canonical.toLowerCase() === normalized) return dispClass;
    if (dispClass.aliases.some(alias => alias.toLowerCase() === normalized)) return dispClass;
  }
  return null;
}

export function resolveComplaint(
  raw: string | { slug?: string; display?: string } | undefined | null
): ComplaintClass | null {
  if (!raw) return null;
  const slug = typeof raw === "string" ? raw : (raw.slug ?? raw.display ?? "");
  const normalized = slug.trim().toLowerCase();
  for (const complaintClass of Object.values(COMPLAINT_ONTOLOGY)) {
    if (complaintClass.canonical === normalized) return complaintClass;
    if (complaintClass.aliases.some(a => a.toLowerCase() === normalized)) return complaintClass;
  }
  return null;
}

// ─── SHACL-equivalent validator ───────────────────────────────────────────────

export interface OntologyViolation {
  field:      string;
  value:      any;
  constraint: string;
  message:    string;
  severity:   "error" | "warning";
}

export interface OntologyValidationResult {
  valid:                boolean;
  violations:           OntologyViolation[];
  resolvedDisposition?: DispositionClass;
  resolvedComplaint?:   ComplaintClass;
  warnings:             string[];
}

export function validateCaseOntology(caseDoc: {
  caseId:    string;
  complaint?: any;
  triage?: {
    disposition?: string;
    confidence?:  number;
    topCluster?:  string;
  };
  source?: { channel?: string; threadId?: string };
  answers?: { structured?: Record<string, any> };
}): OntologyValidationResult {
  const violations: OntologyViolation[] = [];
  const warnings:   string[]            = [];

  const resolvedComplaint = resolveComplaint(caseDoc.complaint);
  if (caseDoc.complaint && !resolvedComplaint) {
    warnings.push(`Complaint "${JSON.stringify(caseDoc.complaint)}" not in ontology — treating as undifferentiated`);
  }

  const rawDisp = caseDoc.triage?.disposition;
  const resolvedDisposition = resolveDisposition(rawDisp);

  if (rawDisp && !resolvedDisposition) {
    violations.push({
      field:      "triage.disposition",
      value:      rawDisp,
      constraint: "disposition_must_be_canonical",
      message:    `Disposition "${rawDisp}" is not in the clinical ontology. Valid values: ${Object.keys(DISPOSITION_ONTOLOGY).join(", ")}`,
      severity:   "error",
    });
  }

  if (resolvedDisposition?.canonical === "ER_SEND") {
    if (resolvedComplaint?.asyncSafeDefault === true) {
      violations.push({
        field:      "disposition + complaint",
        value:      `${rawDisp} + ${resolvedComplaint.canonical}`,
        constraint: "er_send_not_async_safe",
        message:    `ER disposition on a complaint marked async-safe (${resolvedComplaint.canonical}) is likely an error`,
        severity:   "warning",
      });
    }
  }

  const confidence = caseDoc.triage?.confidence;
  if (confidence !== undefined && resolvedDisposition) {
    if (confidence < 0.50 && resolvedDisposition.urgencyLevel >= 4) {
      warnings.push(
        `High urgency disposition (${resolvedDisposition.canonical}) with low confidence (${Math.round(confidence * 100)}%). Physician judgment essential.`
      );
    }
  }

  if (caseDoc.source?.channel === "whatsapp" && !caseDoc.source?.threadId) {
    violations.push({
      field:      "source.threadId",
      value:      null,
      constraint: "whatsapp_requires_phone",
      message:    "WhatsApp channel cases must have source.threadId (phone number) for follow-up and discharge delivery",
      severity:   "error",
    });
  }

  return {
    valid:               violations.filter(v => v.severity === "error").length === 0,
    violations,
    resolvedDisposition: resolvedDisposition ?? undefined,
    resolvedComplaint:   resolvedComplaint   ?? undefined,
    warnings,
  };
}

// ─── Ontology singleton export ────────────────────────────────────────────────

export const ont = {
  resolveDisposition,
  resolveComplaint,
  validateCase:  validateCaseOntology,
  dispositions:  DISPOSITION_ONTOLOGY,
  complaints:    COMPLAINT_ONTOLOGY,
};

export class OntologyValidationError extends Error {
  constructor(public violations: OntologyViolation[]) {
    super(`Ontology validation failed: ${violations.map(v => v.message).join("; ")}`);
    this.name = "OntologyValidationError";
  }
}

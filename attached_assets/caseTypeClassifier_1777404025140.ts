/**
 * caseTypeClassifier.ts
 * Drop into: server/services/caseTypeClassifier.ts
 *
 * Deterministic classifier — no LLM call, no latency, no cost.
 * Takes a CaseDoc and returns a caseType label using:
 *   - complaint slug
 *   - disposition
 *   - red flag count
 *   - AI confidence
 *   - answered question count (proxy for case complexity)
 *
 * Labels returned:
 *   "Async Safe"          — low-acuity, no red flags, high confidence, safe for async review
 *   "Routine Primary Care"— PCP referral, moderate complexity
 *   "Pediatric Urgent"    — pediatric signals present
 *   "Chronic Follow-up"   — chronic disease complaint patterns
 *   "High-Risk ED Diversion" — near-ED disposition, red flags, low confidence
 *   "Urgent Sync Required"— red flags or low confidence requiring synchronous physician review
 *
 * caseTypeMeta returned alongside label:
 *   asyncSafe: boolean  — true only for "Async Safe" cases (physician can batch-review)
 *   color:     string   — Tailwind bg class for the pill
 *   priority:  number   — 1 (lowest) to 5 (highest) for sort ordering
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CaseTypeMeta {
  label:     string;
  asyncSafe: boolean;
  color:     string;   // Tailwind bg+text class pair e.g. "bg-green-100 text-green-800"
  priority:  1 | 2 | 3 | 4 | 5;
}

// Minimal shape of CaseDoc fields needed for classification
export interface ClassifiableCase {
  complaint?:    { slug?: string } | string;
  triage?: {
    disposition?: string;
    confidence?:  number;
    topCluster?:  string;
  };
  redFlagCount?: number;
  redFlags?:     string[];
  answers?: {
    structured?: {
      age?:        number;
      dob?:        string;
      conditions?: string[];
    };
    count?: number;
  };
  source?: { channel?: string };
}

// ─── Complaint slug sets ──────────────────────────────────────────────────────

const ASYNC_SAFE_COMPLAINTS = new Set([
  "uti", "pink_eye", "conjunctivitis",
  "contraception_refill", "medication_refill",
  "sinus_pressure", "sinusitis",
  "cold", "common_cold",
  "athletes_foot", "rash_mild",
  "yeast_infection", "vaginal_discharge",
  "mild_back_pain", "insect_bite",
]);

const CHRONIC_COMPLAINTS = new Set([
  "hypertension", "diabetes", "diabetes_management",
  "asthma_followup", "obesity", "weight_management",
  "thyroid", "hyperlipidemia", "gerd", "ibs",
  "depression_followup", "anxiety_followup",
  "chronic_pain", "arthritis",
]);

const PEDIATRIC_COMPLAINTS = new Set([
  "pediatric_fever", "ear_infection", "ear_pain",
  "croup", "rsv", "hand_foot_mouth",
  "strep_throat", "pediatric_rash",
  "pediatric_cough", "well_child",
]);

const HIGH_ACUITY_COMPLAINTS = new Set([
  "chest_pain", "shortness_of_breath", "dyspnea",
  "stroke_symptoms", "facial_droop",
  "severe_abdominal_pain", "altered_mental_status",
  "syncope", "anaphylaxis", "severe_allergic_reaction",
  "suicidal_ideation", "overdose",
]);

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyCaseType(doc: ClassifiableCase): CaseTypeMeta {
  const slug = typeof doc.complaint === "string"
    ? doc.complaint
    : doc.complaint?.slug ?? "";

  const disposition  = doc.triage?.disposition ?? "self_care";
  const confidence   = doc.triage?.confidence  ?? 0.5;
  const redFlagCount = doc.redFlagCount ?? doc.redFlags?.length ?? 0;
  const answerCount  = doc.answers?.count ?? 0;

  // Age detection — pediatric if age < 18 or listed in conditions
  const age = doc.answers?.structured?.age;
  const dob = doc.answers?.structured?.dob;
  let isPediatric = PEDIATRIC_COMPLAINTS.has(slug);
  if (age !== undefined && age < 18) isPediatric = true;
  if (dob) {
    const birthYear = new Date(dob).getFullYear();
    const currentYear = new Date().getFullYear();
    if (currentYear - birthYear < 18) isPediatric = true;
  }

  // ── Rule 1: High-acuity complaints or ER disposition → Urgent Sync Required ──
  if (
    HIGH_ACUITY_COMPLAINTS.has(slug) ||
    disposition === "er_send" ||
    redFlagCount >= 2
  ) {
    return {
      label:     "High-Risk ED Diversion",
      asyncSafe: false,
      color:     "bg-red-100 text-red-800 border-red-300",
      priority:  5,
    };
  }

  // ── Rule 2: Red flags present or very low confidence → Urgent Sync ──────────
  if (redFlagCount >= 1 || confidence < 0.40) {
    return {
      label:     "Urgent Sync Required",
      asyncSafe: false,
      color:     "bg-orange-100 text-orange-800 border-orange-300",
      priority:  4,
    };
  }

  // ── Rule 3: Pediatric signals ────────────────────────────────────────────────
  if (isPediatric) {
    return {
      label:     "Pediatric Urgent",
      asyncSafe: false,
      color:     "bg-purple-100 text-purple-800 border-purple-300",
      priority:  4,
    };
  }

  // ── Rule 4: Chronic disease follow-up ────────────────────────────────────────
  if (CHRONIC_COMPLAINTS.has(slug)) {
    return {
      label:     "Chronic Follow-up",
      asyncSafe: false,   // chronic cases need clinical judgment even if low-acuity
      color:     "bg-blue-100 text-blue-800 border-blue-300",
      priority:  2,
    };
  }

  // ── Rule 5: Async-safe — low acuity, no red flags, high confidence ───────────
  if (
    ASYNC_SAFE_COMPLAINTS.has(slug) &&
    confidence >= 0.65 &&
    redFlagCount === 0 &&
    (disposition === "self_care" || disposition === "pcp")
  ) {
    return {
      label:     "Async Safe",
      asyncSafe: true,
      color:     "bg-green-100 text-green-800 border-green-300",
      priority:  1,
    };
  }

  // ── Rule 6: PCP referral, no flags → Routine Primary Care ───────────────────
  if (disposition === "pcp" && redFlagCount === 0) {
    return {
      label:     "Routine Primary Care",
      asyncSafe: false,
      color:     "bg-gray-100 text-gray-700 border-gray-300",
      priority:  2,
    };
  }

  // ── Default: requires sync review ────────────────────────────────────────────
  return {
    label:     "Sync Review",
    asyncSafe: false,
    color:     "bg-yellow-100 text-yellow-800 border-yellow-300",
    priority:  3,
  };
}

// ─── Firestore write-back helper ──────────────────────────────────────────────
// Called fire-and-forget from listReviewQueue / SSE emitter.
// Updates only caseType and caseTypeMeta fields — does not touch clinical fields.

export async function classifyAndPersist(
  caseId:     string,
  doc:        ClassifiableCase,
  updateCase: (id: string, patch: Record<string, unknown>) => Promise<void>
): Promise<CaseTypeMeta> {
  const meta = classifyCaseType(doc);
  // Non-blocking — if Firestore write fails, the label still renders from in-memory result
  updateCase(caseId, {
    caseType:     meta.label,
    caseTypeMeta: meta,
    caseTypeAt:   new Date().toISOString(),
  }).catch((err: Error) =>
    console.error("[CaseTypeClassifier] Firestore write-back failed", { caseId, err: err.message })
  );
  return meta;
}

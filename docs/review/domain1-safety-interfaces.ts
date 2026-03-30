/**
 * ============================================================
 * DOMAIN 1: SAFETY & CLINICAL GUARDRAILS — Interface Contracts
 * Auralyn / ENT Flu Slice — HIPAA/FDA Medical Triage Platform
 * ============================================================
 *
 * What is here: TypeScript interfaces, enums, constants, and
 * function signatures only. No implementation bodies.
 *
 * Files this represents:
 *   server/safety/hardStopRules.ts
 *   server/safety/pediatricSafetyRules.ts
 *   server/safety/independentSafetyPath.ts
 *   server/safety/vitalSignsThresholds.ts
 *
 * REVIEW QUESTIONS FOR CLAUDE:
 *   1. Are there hard-stop symptom patterns missing from the
 *      10 absolute rules below that Epic / Nuance cover?
 *   2. Is the 7-tier disposition ladder clinically complete?
 *   3. Does the contradiction detector (LLM vs raw text) catch
 *      the right failure modes?
 *   4. Are the pediatric SIRS thresholds current with AAP guidelines?
 *   5. Are there vital sign scoring instruments we should add
 *      beyond qSOFA / NEWS / shock index?
 * ============================================================
 */


// ─── 1.1 · 7-Tier Disposition System ─────────────────────────────────────────

export enum DispositionTier {
  ER_NOW         = "ER_NOW",           // Call 911 / immediate life threat
  ER_URGENT      = "ER_URGENT",        // Go to ER within 1 hour
  URGENT_CARE    = "URGENT_CARE",      // See provider within 4 hours
  TELEHEALTH_NOW = "TELEHEALTH_NOW",   // Synchronous virtual visit within 1 hour
  NEXT_DAY       = "NEXT_DAY",         // Schedule within 24 hours
  ROUTINE        = "ROUTINE",          // Standard appointment
  SELF_CARE      = "SELF_CARE",        // Home management with instructions
}

/** Maps each tier to the next level up. ER_NOW escalates to itself. */
export declare const DISPOSITION_ESCALATION_MAP: Record<DispositionTier, DispositionTier>;

/** Returns the disposition one tier higher than the input. */
export declare function escalateOneLevel(disposition: DispositionTier): DispositionTier;


// ─── 1.2 · Absolute Hard-Stop Rules ──────────────────────────────────────────

export interface HardStopRule {
  ruleId:       string;         // e.g. "HS-001"
  symptomKey:   string;         // normalized symptom identifier
  keywords:     string[];       // raw-text keywords (case-insensitive match)
  disposition:  DispositionTier;
  rationale:    string;         // clinical reasoning
  confidence:   number;         // 0–1 confidence this rule is correct
  bypassDebate: boolean;        // if true, no agents run — direct escalation
  fdaAuditCode: string;         // e.g. "CARDIAC-001" for FDA traceability
}

/**
 * The 10 absolute hard stops currently implemented.
 * These bypass the debate engine entirely — no LLM runs.
 *
 * Current rules (ruleId → symptomKey → disposition):
 *   HS-001  chest_pain_with_diaphoresis         → ER_NOW
 *   HS-002  stridor_child_under_5               → ER_NOW
 *   HS-003  altered_mental_status               → ER_NOW
 *   HS-004  pregnancy_with_bleeding             → ER_NOW
 *   HS-005  testicular_pain_acute_onset         → ER_URGENT
 *   HS-006  vision_loss_sudden_unilateral       → ER_NOW
 *   HS-007  fever_infant_under_90_days          → ER_NOW  (age-gated: ageMonths ≤ 3)
 *   HS-008  suicidal_ideation_active            → ER_NOW
 *   HS-009  anaphylaxis                         → ER_NOW
 *   HS-010  stroke_symptoms                     → ER_NOW
 */
export declare const ABSOLUTE_HARD_STOPS: HardStopRule[];

export interface HardStopResult {
  triggered:    boolean;
  rule?:        HardStopRule;
  matchedText:  string[];        // which keywords from the rule were found
  disposition:  DispositionTier | null;
  bypassDebate: boolean;
}

/**
 * Evaluates raw text and normalized symptom list against all hard-stop rules.
 * Called BEFORE any LLM or debate engine runs.
 * Age-gates the infant fever rule (HS-007) when ageMonths is provided.
 */
export declare function evaluateHardStops(
  rawText:             string,
  normalizedSymptoms:  string[],
  ageMonths?:          number
): HardStopResult;


// ─── 1.3 · Pediatric Age-Stratified Safety Rules ─────────────────────────────

export interface PediatricAgeband {
  label:                   string;
  minAgeMonths:            number;
  maxAgeMonths:            number;
  feverThresholdC:         number;   // any temp ≥ this = hard stop
  respRateThreshold:       number;   // breaths/min above this = tachypnea
  heartRateThreshold:      number;   // bpm above this = tachycardia
  o2SatThreshold:          number;   // SpO₂ below this = critical
  requiresWeightForDosing: boolean;
  hardStopDisposition:     "ER_NOW" | "ER_URGENT";
  sirsMinCriteria:         number;   // how many SIRS criteria triggers sepsis screen
}

/**
 * 7 age bands implemented:
 *   Neonate (0–1m), Young Infant (1–3m), Infant (3–12m),
 *   Toddler (1–3y), Preschool (3–6y), School Age (6–12y), Adolescent (12–18y)
 */
export declare const PEDIATRIC_AGE_BANDS: PediatricAgeband[];

export declare function getPediatricBand(ageMonths: number): PediatricAgeband | null;

export interface PediatricSafetyResult {
  isHighRisk:          boolean;
  disposition?:        "ER_NOW" | "ER_URGENT";
  triggers:            string[];
  band?:               PediatricAgeband;
  sirsScore:           number;   // 0–4 (hypoxia counts 2)
  requiresWeightCheck: boolean;
}

export declare function evaluatePediatricSafety(params: {
  ageMonths:       number;
  temperatureC?:   number;
  respiratoryRate?: number;
  heartRate?:      number;
  o2Saturation?:   number;
  weightKg?:       number;
}): PediatricSafetyResult;


// ─── 1.4 · Independent Safety Agent Data Path ────────────────────────────────

/**
 * Rec 1.1 — The Safety Agent evaluates raw patient text INDEPENDENTLY
 * of the LLM-processed symptom objects. Upstream corruption (hallucination,
 * misclassification) cannot bypass this path.
 *
 * The result merges LLM flags and rule-engine flags using UNION (never
 * intersection) — both sources are always considered.
 */
export interface IndependentSafetyInput {
  rawPatientText:           string;   // unprocessed original message
  extractedSymptoms:        string[];
  llmDerivedRedFlags:       string[];
  llmSuggestedDisposition?: string;   // used for contradiction detection
  ageMonths?:               number;
  temperatureC?:            number;
  respiratoryRate?:         number;
  heartRate?:               number;
  o2Saturation?:            number;
}

export interface SafetyVerdict {
  disposition:           DispositionTier;
  bypassDebate:          boolean;
  allRedFlags:           string[];    // UNION of rule-engine + LLM flags
  independentFlags:      string[];    // rule-engine only (no LLM)
  llmFlags:              string[];
  contradictionDetected: boolean;     // LLM says low severity, raw text says emergency
  contradictionReason?:  string;
  triggeringRule?:       HardStopRule;
  pediatricRisk:         boolean;
  auditTrail: {
    evaluatedAt:        string;
    rawTextLength:      number;
    hardStopTriggered:  boolean;
    pediatricBand?:     string;
  };
}

/** Runs the full independent safety evaluation pipeline. */
export declare function runIndependentSafetyEvaluation(
  input: IndependentSafetyInput
): Promise<SafetyVerdict>;


// ─── 1.5 · Vital Signs Threshold Checker (agent addition) ────────────────────

export interface VitalSigns {
  heartRate?:         number;   // bpm
  systolicBP?:        number;   // mmHg
  respiratoryRate?:   number;   // breaths/min
  temperatureC?:      number;
  o2Saturation?:      number;   // %
  glasgowComaScale?:  number;   // 3–15
  ageYears?:          number;
}

export interface VitalSignsAssessment {
  isAbnormal:   boolean;
  isCritical:   boolean;
  findings:     string[];
  qSofaScore:   number;     // 0–3: ≥2 = suspected sepsis
  shockIndex?:  number;     // HR / SBP — ≥1.0 = hemodynamic compromise risk
  newsScore:    number;     // National Early Warning Score approximation
}

/**
 * Scores vital signs using qSOFA, NEWS, and shock index.
 * Returns qualitative findings list and critical/abnormal flags.
 * Scoring: NEWS ≥7 = critical, NEWS ≥5 = increased monitoring,
 *          qSOFA ≥2 = suspected sepsis pathway.
 */
export declare function assessVitalSigns(vs: VitalSigns): VitalSignsAssessment;


// ─── API Endpoints Exposed ────────────────────────────────────────────────────
/*
  POST /api/compliance/safety/evaluate        — full independent safety eval
  POST /api/compliance/safety/hard-stops      — hard stop rule check only
  POST /api/compliance/safety/pediatric       — pediatric age-band check only
  POST /api/compliance/safety/red-team        — adversarial challenge (see D6)
*/

/**
 * DOMAIN 1 — REC 1.2: 7-Tier Disposition System + Absolute Hard Stops
 *
 * Expands the existing 2-tier emergency system to a clinically complete
 * 7-tier model. Hard stops bypass the debate engine entirely — they are
 * rule-evaluated before any LLM or agent runs.
 *
 * MY ADDITION: Rule confidence scores so the audit trail captures whether
 * a hard stop was triggered by a high-confidence or pattern-matched rule.
 */

export enum DispositionTier {
  ER_NOW         = "ER_NOW",           // Call 911 / immediate life threat
  ER_URGENT      = "ER_URGENT",        // Go to ER within 1 hour
  URGENT_CARE    = "URGENT_CARE",      // See provider within 4 hours
  TELEHEALTH_NOW = "TELEHEALTH_NOW",   // Synchronous virtual visit within 1 hour
  NEXT_DAY       = "NEXT_DAY",         // Schedule within 24 hours
  ROUTINE        = "ROUTINE",          // Standard appointment
  SELF_CARE      = "SELF_CARE",        // Home management with instructions
}

export const DISPOSITION_ESCALATION_MAP: Record<DispositionTier, DispositionTier> = {
  [DispositionTier.SELF_CARE]:      DispositionTier.ROUTINE,
  [DispositionTier.ROUTINE]:        DispositionTier.NEXT_DAY,
  [DispositionTier.NEXT_DAY]:       DispositionTier.TELEHEALTH_NOW,
  [DispositionTier.TELEHEALTH_NOW]: DispositionTier.URGENT_CARE,
  [DispositionTier.URGENT_CARE]:    DispositionTier.ER_URGENT,
  [DispositionTier.ER_URGENT]:      DispositionTier.ER_NOW,
  [DispositionTier.ER_NOW]:         DispositionTier.ER_NOW,
};

export function escalateOneLevel(disposition: DispositionTier): DispositionTier {
  return DISPOSITION_ESCALATION_MAP[disposition] ?? DispositionTier.ER_URGENT;
}

export interface HardStopRule {
  ruleId:       string;
  symptomKey:   string;           // matches normalized symptom keys
  keywords:     string[];         // raw text keywords (case-insensitive)
  disposition:  DispositionTier;
  rationale:    string;
  confidence:   number;           // MY ADDITION: 0-1, how certain this rule is
  bypassDebate: boolean;          // if true, no agents run — direct escalation
  fdaAuditCode: string;           // MY ADDITION: traceability code for FDA audit
}

export const ABSOLUTE_HARD_STOPS: HardStopRule[] = [
  {
    ruleId: "HS-001", symptomKey: "chest_pain_with_diaphoresis",
    keywords: ["chest pain", "sweating", "chest tightness", "diaphoresis"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Classic ACS presentation — potential STEMI",
    confidence: 0.98, bypassDebate: true, fdaAuditCode: "CARDIAC-001",
  },
  {
    ruleId: "HS-002", symptomKey: "stridor_child_under_5",
    keywords: ["stridor", "barking cough", "can't breathe", "noisy breathing"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Possible epiglottitis or croup with obstruction in child",
    confidence: 0.97, bypassDebate: true, fdaAuditCode: "PEDS-001",
  },
  {
    ruleId: "HS-003", symptomKey: "altered_mental_status",
    keywords: ["confused", "not responding", "unresponsive", "altered", "unconscious", "disoriented"],
    disposition: DispositionTier.ER_NOW,
    rationale: "AMS requires immediate neurological evaluation",
    confidence: 0.99, bypassDebate: true, fdaAuditCode: "NEURO-001",
  },
  {
    ruleId: "HS-004", symptomKey: "pregnancy_with_bleeding",
    keywords: ["pregnant", "bleeding", "cramping", "spotting", "miscarriage"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Pregnancy bleeding — ectopic, abruption, or placenta previa risk",
    confidence: 0.95, bypassDebate: true, fdaAuditCode: "OB-001",
  },
  {
    ruleId: "HS-005", symptomKey: "testicular_pain_acute_onset",
    keywords: ["testicular pain", "testicle pain", "groin pain sudden", "ball pain"],
    disposition: DispositionTier.ER_URGENT,
    rationale: "Testicular torsion — 6-hour window for salvage",
    confidence: 0.96, bypassDebate: true, fdaAuditCode: "URO-001",
  },
  {
    ruleId: "HS-006", symptomKey: "vision_loss_sudden_unilateral",
    keywords: ["lost vision", "can't see", "vision gone", "blind", "one eye"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Sudden vision loss — central retinal artery occlusion or stroke",
    confidence: 0.97, bypassDebate: true, fdaAuditCode: "OPHTHO-001",
  },
  {
    ruleId: "HS-007", symptomKey: "fever_infant_under_90_days",
    keywords: ["fever", "hot", "temperature"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Infant <90 days with any fever — sepsis risk",
    confidence: 0.99, bypassDebate: true, fdaAuditCode: "PEDS-002",
  },
  {
    ruleId: "HS-008", symptomKey: "suicidal_ideation_active",
    keywords: ["want to die", "kill myself", "suicidal", "end my life", "suicide"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Active suicidal ideation — immediate psychiatric evaluation",
    confidence: 0.99, bypassDebate: true, fdaAuditCode: "MH-001",
  },
  {
    ruleId: "HS-009", symptomKey: "anaphylaxis",
    keywords: ["throat closing", "can't swallow", "hives", "epipen", "allergic reaction", "swelling throat"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Anaphylaxis — airway compromise risk",
    confidence: 0.98, bypassDebate: true, fdaAuditCode: "ALLERGY-001",
  },
  {
    ruleId: "HS-010", symptomKey: "stroke_symptoms",
    keywords: ["face drooping", "arm weakness", "slurred speech", "sudden headache", "face numb", "FAST"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Stroke symptoms — 4.5-hour tPA window",
    confidence: 0.97, bypassDebate: true, fdaAuditCode: "NEURO-002",
  },
];

export interface HardStopResult {
  triggered:   boolean;
  rule?:       HardStopRule;
  matchedText: string[];
  disposition: DispositionTier | null;
  bypassDebate: boolean;
}

export function evaluateHardStops(
  rawText: string,
  normalizedSymptoms: string[],
  ageMonths?: number
): HardStopResult {
  const text = rawText.toLowerCase();
  const symptoms = normalizedSymptoms.map(s => s.toLowerCase());

  for (const rule of ABSOLUTE_HARD_STOPS) {
    // Age-gate infant fever rule
    if (rule.ruleId === "HS-007" && ageMonths !== undefined && ageMonths > 3) continue;

    const keywordHits = rule.keywords.filter(kw => text.includes(kw.toLowerCase()));
    const symptomHit  = symptoms.includes(rule.symptomKey.toLowerCase());

    if (keywordHits.length > 0 || symptomHit) {
      return {
        triggered:    true,
        rule,
        matchedText:  keywordHits,
        disposition:  rule.disposition,
        bypassDebate: rule.bypassDebate,
      };
    }
  }

  return { triggered: false, matchedText: [], disposition: null, bypassDebate: false };
}

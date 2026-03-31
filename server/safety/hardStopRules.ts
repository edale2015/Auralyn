/**
 * DOMAIN 1 — REC 1.2: 7-Tier Disposition System + Absolute Hard Stops
 *
 * Expands the existing 2-tier emergency system to a clinically complete
 * 7-tier model. Hard stops bypass the debate engine entirely — they are
 * rule-evaluated before any LLM or agent runs.
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - HS-011: Aortic dissection (tearing back pain)
 *   - HS-012: Elderly sepsis — atypical presentation (age-gated >65)
 *   - HS-013: Peritonsillar abscess with airway compromise (ENT-specific)
 *   - HS-014: Carbon monoxide poisoning — mimics flu in winter
 *   - HS-015: Meningitis triad (fever + stiff neck + photophobia)
 *   - CALL_911 disposition — system initiates dispatch (above ER_NOW)
 *   - evaluationError + fallbackBehavior on HardStopResult (safe failure mode)
 */

export enum DispositionTier {
  CALL_911       = "CALL_911",         // System initiates 911 — patient cannot self-transport
  ER_NOW         = "ER_NOW",           // Call 911 yourself / go immediately
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
  [DispositionTier.ER_NOW]:         DispositionTier.CALL_911,
  [DispositionTier.CALL_911]:       DispositionTier.CALL_911,
};

export function escalateOneLevel(disposition: DispositionTier): DispositionTier {
  return DISPOSITION_ESCALATION_MAP[disposition] ?? DispositionTier.ER_URGENT;
}

export interface HardStopRule {
  ruleId:       string;
  symptomKey:   string;
  keywords:     string[];
  disposition:  DispositionTier;
  rationale:    string;
  confidence:   number;
  bypassDebate: boolean;
  fdaAuditCode: string;
  ageGate?: {
    minAgeYears?: number;
    maxAgeMonths?: number;
    description: string;
  };
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
    ageGate: { maxAgeMonths: 3, description: "Only applies to infants ≤3 months" },
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
  // ── Claude Review Round 2 Additions ──────────────────────────────────────
  {
    ruleId: "HS-011", symptomKey: "tearing_back_pain_sudden",
    keywords: ["tearing", "ripping", "worst back pain", "radiating to back", "tearing chest"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Aortic dissection — classic tearing back pain, mortality >1%/hour untreated",
    confidence: 0.95, bypassDebate: true, fdaAuditCode: "VASCULAR-001",
  },
  {
    ruleId: "HS-012", symptomKey: "sepsis_elderly_altered",
    keywords: ["confused", "not acting right", "very weak", "fever", "chills", "lethargic"],
    disposition: DispositionTier.ER_URGENT,
    rationale: "Atypical sepsis presentation in elderly — altered behavior may be only sign. Age-gated: applies when age ≥ 65.",
    confidence: 0.88, bypassDebate: false, fdaAuditCode: "SEPSIS-001",
    ageGate: { minAgeYears: 65, description: "Only applies to patients ≥65 years" },
  },
  {
    ruleId: "HS-013", symptomKey: "hot_potato_voice_drooling",
    keywords: ["hot potato voice", "drooling", "can't swallow", "muffled voice", "trismus", "jaw won't open"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Peritonsillar abscess with airway compromise — rapid progression to obstruction. Highly relevant to ENT slice.",
    confidence: 0.96, bypassDebate: true, fdaAuditCode: "ENT-AIRWAY-001",
  },
  {
    ruleId: "HS-014", symptomKey: "co_poisoning_pattern",
    keywords: ["everyone sick", "whole family sick", "heater on", "headache improving outside", "multiple people headache"],
    disposition: DispositionTier.ER_NOW,
    rationale: "CO poisoning mimics flu — whole-household symptom onset is sentinel finding. ENT Flu slice especially exposed on this.",
    confidence: 0.92, bypassDebate: true, fdaAuditCode: "TOXIC-001",
  },
  {
    ruleId: "HS-015", symptomKey: "meningitis_triad",
    keywords: ["stiff neck", "light hurts", "photophobia", "neck stiffness", "can't look at light"],
    disposition: DispositionTier.ER_NOW,
    rationale: "Classic meningitis presentation — bacterial meningitis mortality 20–30% without treatment",
    confidence: 0.97, bypassDebate: true, fdaAuditCode: "NEURO-003",
  },
  // ── Shoulder Neurovascular Emergencies ────────────────────────────────────
  // NOTE: These rules are evaluated in independentSafetyPath (not finalPipeline).
  //       Multi-complaint fusion engine handles shoulder vascular in the main pipeline.
  {
    ruleId: "HS-016", symptomKey: "shoulder_neurovascular_compromise",
    keywords: ["no pulse", "absent pulse", "pulseless wrist", "no sensation hand", "absent sensation", "hand numb and weak", "grip gone", "can't feel fingers"],
    disposition: DispositionTier.CALL_911,
    rationale: "Shoulder injury with absent distal pulse or sensation → axillary artery injury or complete brachial plexus avulsion. Limb-threatening emergency — CALL 911.",
    confidence: 0.98, bypassDebate: true, fdaAuditCode: "ORTHO-001",
  },
  {
    ruleId: "HS-017", symptomKey: "shoulder_open_fracture",
    keywords: ["bone through skin", "bone sticking out", "open wound bone", "bone exposed", "open fracture"],
    disposition: DispositionTier.CALL_911,
    rationale: "Open fracture/dislocation — infection and vascular risk. Immediate surgical evaluation required.",
    confidence: 0.99, bypassDebate: true, fdaAuditCode: "ORTHO-002",
  },
];

export interface HardStopResult {
  triggered:         boolean;
  rule?:             HardStopRule;
  matchedText:       string[];
  disposition:       DispositionTier | null;
  bypassDebate:      boolean;
  // Claude review addition: safe failure mode
  evaluationError?:  string;
  fallbackBehavior:  "escalate_to_er_urgent" | "require_physician_review";
}

export function evaluateHardStops(
  rawText:             string,
  normalizedSymptoms:  string[],
  ageMonths?:          number,
  ageYears?:           number
): HardStopResult {
  try {
    const text     = rawText.toLowerCase();
    const symptoms = normalizedSymptoms.map(s => s.toLowerCase());

    for (const rule of ABSOLUTE_HARD_STOPS) {
      // Age gate: infant fever rule — only for ≤3 months
      if (rule.ageGate?.maxAgeMonths !== undefined) {
        if (ageMonths !== undefined && ageMonths > rule.ageGate.maxAgeMonths) continue;
      }
      // Age gate: elderly sepsis rule — only for ≥65 years
      if (rule.ageGate?.minAgeYears !== undefined) {
        const resolvedAgeYears = ageYears ?? (ageMonths !== undefined ? ageMonths / 12 : undefined);
        if (resolvedAgeYears !== undefined && resolvedAgeYears < rule.ageGate.minAgeYears) continue;
      }

      const keywordHits = rule.keywords.filter(kw => text.includes(kw.toLowerCase()));
      const symptomHit  = symptoms.includes(rule.symptomKey.toLowerCase());

      if (keywordHits.length > 0 || symptomHit) {
        return {
          triggered:       true,
          rule,
          matchedText:     keywordHits,
          disposition:     rule.disposition,
          bypassDebate:    rule.bypassDebate,
          fallbackBehavior: "escalate_to_er_urgent",
        };
      }
    }

    return {
      triggered:       false,
      matchedText:     [],
      disposition:     null,
      bypassDebate:    false,
      fallbackBehavior: "escalate_to_er_urgent",
    };
  } catch (err: any) {
    // Claude review: safe failure mode — never silently pass through on error
    return {
      triggered:        false,
      matchedText:      [],
      disposition:      DispositionTier.ER_URGENT,
      bypassDebate:     false,
      evaluationError:  err?.message ?? "Unknown hard-stop evaluation error",
      fallbackBehavior: "escalate_to_er_urgent",
    };
  }
}

export type GuidelineRule = {
  id: string;
  complaint: string;
  whenTopDiagnosis?: string;
  requiresSymptoms?: string[];
  requiresQuestionsAnswered?: string[];
  requiresTests?: string[];
  forbidsDisposition?: string[];
  recommendedDisposition?: string;
  note?: string;
};

export type GuidelineInput = {
  complaint: string;
  normalizedSymptoms: string[];
  answeredQuestions?: Record<string, any>;
  topDiagnosis?: string;
  proposedDisposition?: string;
  proposedTests?: { name: string; urgency: "urgent" | "routine" }[];
};

export type GuidelineOutput = {
  passed: boolean;
  matches: string[];
  violations: string[];
  reviewFlags: string[];
};

const RULES: GuidelineRule[] = [
  // ── Sore Throat ───────────────────────────────────────────────────────────
  {
    id: "GL_SORE_THROAT_AIRWAY",
    complaint: "sore_throat",
    requiresSymptoms: ["drooling"],
    forbidsDisposition: ["home_care", "routine_followup"],
    recommendedDisposition: "er_now",
    note: "Drooling with sore throat = airway danger until proven otherwise",
  },
  {
    id: "GL_SORE_THROAT_STRIDOR",
    complaint: "sore_throat",
    requiresSymptoms: ["stridor"],
    forbidsDisposition: ["home_care", "routine_followup", "likely_outpatient"],
    recommendedDisposition: "er_now",
    note: "Stridor requires immediate airway assessment",
  },
  {
    id: "GL_SORE_THROAT_PTA_WORKUP",
    complaint: "sore_throat",
    whenTopDiagnosis: "peritonsillar_abscess",
    requiresTests: ["ct_neck"],
    forbidsDisposition: ["home_care"],
  },

  // ── Chest Pain ────────────────────────────────────────────────────────────
  {
    id: "GL_CHEST_PAIN_ACS_WORKUP",
    complaint: "chest_pain",
    whenTopDiagnosis: "acute_coronary_syndrome",
    requiresTests: ["ecg", "troponin"],
    forbidsDisposition: ["home_care"],
    note: "ACS requires ECG + troponin before disposition",
  },
  {
    id: "GL_CHEST_PAIN_ACS_NO_HOME",
    complaint: "chest_pain",
    whenTopDiagnosis: "acs",
    forbidsDisposition: ["home_care", "likely_outpatient"],
    recommendedDisposition: "er_now",
  },
  {
    id: "GL_CHEST_PAIN_PE_WORKUP",
    complaint: "chest_pain",
    whenTopDiagnosis: "pulmonary_embolism",
    requiresTests: ["ctpa", "ddimer"],
    forbidsDisposition: ["home_care"],
  },

  // ── Dysuria ───────────────────────────────────────────────────────────────
  {
    id: "GL_DYSURIA_PYELO_ESCALATE",
    complaint: "dysuria",
    whenTopDiagnosis: "pyelonephritis",
    requiresSymptoms: ["fever"],
    forbidsDisposition: ["home_care"],
    recommendedDisposition: "needs_workup",
  },
  {
    id: "GL_DYSURIA_PREGNANT_UTI",
    complaint: "dysuria",
    requiresQuestionsAnswered: ["pregnant"],
    forbidsDisposition: ["home_care"],
    note: "Pregnant UTI requires culture and closer follow-up",
  },

  // ── Headache ──────────────────────────────────────────────────────────────
  {
    id: "GL_HEADACHE_THUNDERCLAP",
    complaint: "headache",
    requiresSymptoms: ["thunderclap_headache"],
    forbidsDisposition: ["home_care", "likely_outpatient", "routine_followup"],
    recommendedDisposition: "er_now",
    note: "Thunderclap headache = SAH until proven otherwise",
  },
  {
    id: "GL_HEADACHE_NEURO_DEFICIT",
    complaint: "headache",
    requiresSymptoms: ["neuro_deficit"],
    forbidsDisposition: ["home_care"],
    recommendedDisposition: "er_now",
  },

  // ── Abdominal Pain ────────────────────────────────────────────────────────
  {
    id: "GL_ABD_APPENDICITIS_CT",
    complaint: "abdominal_pain",
    whenTopDiagnosis: "appendicitis",
    requiresTests: ["ct_abdomen"],
    forbidsDisposition: ["home_care"],
  },
  {
    id: "GL_ABD_ECTOPIC_WORKUP",
    complaint: "abdominal_pain",
    whenTopDiagnosis: "ectopic_pregnancy",
    requiresTests: ["beta_hcg", "pelvic_ultrasound"],
    forbidsDisposition: ["home_care", "likely_outpatient"],
    recommendedDisposition: "er_now",
  },

  // ── Shortness of Breath ───────────────────────────────────────────────────
  {
    id: "GL_SOB_HYPOXIA_NO_HOME",
    complaint: "shortness_of_breath",
    requiresSymptoms: ["hypoxia"],
    forbidsDisposition: ["home_care", "likely_outpatient"],
    recommendedDisposition: "er_now",
  },
];

function hasAll(source: string[], needed: string[] = []): boolean {
  return needed.every((n) => source.includes(n));
}

export function guidelineAdherenceEngine(input: GuidelineInput): GuidelineOutput {
  const matches: string[]     = [];
  const violations: string[]  = [];
  const reviewFlags: string[] = [];
  const testNames = (input.proposedTests || []).map((t) => t.name.toLowerCase());
  const normSyms  = input.normalizedSymptoms.map((s) => s.toLowerCase());

  for (const rule of RULES) {
    if (rule.complaint !== input.complaint) continue;
    if (rule.whenTopDiagnosis && rule.whenTopDiagnosis !== input.topDiagnosis) continue;
    if (!hasAll(normSyms, rule.requiresSymptoms)) continue;

    matches.push(rule.id);

    // Check required questions are answered
    if (rule.requiresQuestionsAnswered?.length) {
      const a = input.answeredQuestions || {};
      for (const q of rule.requiresQuestionsAnswered) {
        if (a[q] == null || a[q] === "") {
          violations.push(`${rule.id}: missing required question — ${q}`);
        }
      }
    }

    // Check required tests are proposed
    if (rule.requiresTests?.length) {
      for (const test of rule.requiresTests) {
        if (!testNames.includes(test.toLowerCase())) {
          violations.push(`${rule.id}: missing required test — ${test}`);
        }
      }
    }

    // Check forbidden dispositions
    if (rule.forbidsDisposition?.includes((input.proposedDisposition || "").toLowerCase())) {
      violations.push(`${rule.id}: disposition "${input.proposedDisposition}" is not allowed`);
    }

    // Review flag when disposition differs from recommended
    if (
      rule.recommendedDisposition &&
      input.proposedDisposition &&
      rule.recommendedDisposition !== (input.proposedDisposition || "").toLowerCase()
    ) {
      reviewFlags.push(
        `${rule.id}: preferred disposition is "${rule.recommendedDisposition}", got "${input.proposedDisposition}"`
      );
    }
  }

  return {
    passed: violations.length === 0,
    matches,
    violations,
    reviewFlags,
  };
}

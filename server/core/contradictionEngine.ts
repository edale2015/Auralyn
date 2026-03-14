export type ContradictionRule = {
  a: string;
  b: string;
  message: string;
  severity: "warning" | "error";
};

const contradictionRules: ContradictionRule[] = [
  // ── Sex / anatomy contradictions ────────────────────────────────────────────
  { a: "male",              b: "pregnancy",           message: "Pregnancy reported in male patient",            severity: "error"   },
  { a: "male",              b: "vaginal_discharge",   message: "Vaginal discharge reported in male patient",    severity: "error"   },
  { a: "male",              b: "menstrual_pain",      message: "Menstrual pain reported in male patient",       severity: "error"   },
  { a: "male",              b: "ovarian_cyst",        message: "Ovarian cyst reported in male patient",         severity: "error"   },
  { a: "female",            b: "testicular_pain",     message: "Testicular pain reported in female patient",    severity: "error"   },
  { a: "female",            b: "epididymitis",        message: "Epididymitis reported in female patient",       severity: "error"   },

  // ── Fever contradictions ─────────────────────────────────────────────────────
  { a: "no_fever",          b: "fever",               message: "Conflicting fever status (both present and absent)", severity: "error" },
  { a: "no_fever",          b: "high_fever",          message: "High fever reported but fever denied",          severity: "error"   },
  { a: "afebrile",          b: "fever",               message: "Patient reported afebrile but fever present",   severity: "warning" },

  // ── Cough contradictions ─────────────────────────────────────────────────────
  { a: "no_cough",          b: "productive_cough",    message: "Productive cough reported but cough denied",    severity: "error"   },
  { a: "no_cough",          b: "cough",               message: "Cough reported but cough denied",               severity: "warning" },
  { a: "no_cough",          b: "hemoptysis",          message: "Coughing blood reported but cough denied",      severity: "error"   },
  { a: "dry_cough",         b: "productive_cough",    message: "Conflicting cough type (dry vs productive)",    severity: "warning" },

  // ── Pain contradictions ───────────────────────────────────────────────────────
  { a: "no_chest_pain",     b: "chest_pain",          message: "Conflicting chest pain status",                 severity: "error"   },
  { a: "no_abdominal_pain", b: "abdominal_pain",      message: "Conflicting abdominal pain status",             severity: "error"   },
  { a: "no_headache",       b: "headache",            message: "Conflicting headache status",                   severity: "warning" },

  // ── Breathing contradictions ─────────────────────────────────────────────────
  { a: "no_dyspnea",        b: "dyspnea",             message: "Conflicting dyspnea status",                    severity: "warning" },
  { a: "no_dyspnea",        b: "shortness_of_breath", message: "Shortness of breath reported but dyspnea denied", severity: "warning" },

  // ── Exposure contradictions ──────────────────────────────────────────────────
  { a: "no_sick_contacts",  b: "sick_contacts",       message: "Conflicting sick contact exposure",             severity: "warning" },
  { a: "no_travel",         b: "recent_travel",       message: "Conflicting travel history",                    severity: "warning" },

  // ── Temporal contradictions ──────────────────────────────────────────────────
  { a: "acute_onset",       b: "chronic_onset",       message: "Conflicting symptom onset (acute vs chronic)",  severity: "warning" },
  { a: "improving",         b: "worsening",           message: "Conflicting symptom trajectory",                severity: "warning" },
];

export type ContradictionResult = {
  conflicts: Array<{ message: string; severity: "warning" | "error"; a: string; b: string }>;
  hasErrors: boolean;
  hasWarnings: boolean;
};

export function contradictionEngine(symptoms: string[]): ContradictionResult {
  const symSet = new Set(symptoms);
  const conflicts: ContradictionResult["conflicts"] = [];

  for (const rule of contradictionRules) {
    if (symSet.has(rule.a) && symSet.has(rule.b)) {
      conflicts.push({ message: rule.message, severity: rule.severity, a: rule.a, b: rule.b });
    }
  }

  return {
    conflicts,
    hasErrors:   conflicts.some((c) => c.severity === "error"),
    hasWarnings: conflicts.some((c) => c.severity === "warning"),
  };
}

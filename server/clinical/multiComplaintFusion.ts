/**
 * Multi-Complaint Fusion Engine
 *
 * Analyses a symptom list and detects high-priority composite clinical
 * syndromes that require urgent escalation regardless of individual
 * complaint scores.
 *
 * Rules are ordered by severity — the first match wins and is returned
 * as the dominant fusion result.
 */

export interface FusionInput {
  symptoms:   string[];
  age?:       number;
  vitals?: {
    heartRate?:   number;
    tempC?:       number;
    sbp?:         number;
    o2Sat?:       number;
    respRate?:    number;
  };
}

export type FusionPriority = "CRITICAL" | "HIGH" | "MODERATE" | "ROUTINE";

export interface FusionResult {
  suspicion:   string;
  priority:    FusionPriority;
  rationale:   string;
  matchedSigns: string[];
}

interface FusionRule {
  suspicion:  string;
  priority:   FusionPriority;
  rationale:  string;
  match:      (input: FusionInput, syms: Set<string>) => string[] | null;
}

const RULES: FusionRule[] = [
  {
    suspicion: "STEMI / ACS",
    priority:  "CRITICAL",
    rationale: "Chest pain + radiation + diaphoresis constellation — ACS/STEMI protocol",
    match: (_, s) => {
      const matched: string[] = [];
      if (s.has("chest pain"))  matched.push("chest pain");
      if (s.has("left arm pain") || s.has("arm pain") || s.has("jaw pain")) matched.push("radiation");
      if (s.has("sweating") || s.has("diaphoresis")) matched.push("diaphoresis");
      return matched.length >= 2 ? matched : null;
    },
  },
  {
    suspicion: "pulmonary_embolism",
    priority:  "CRITICAL",
    rationale: "Chest pain + dyspnea — PE rule-in constellation",
    match: (_, s) => {
      const m: string[] = [];
      if (s.has("chest pain"))         m.push("chest pain");
      if (s.has("shortness of breath") || s.has("dyspnea")) m.push("shortness of breath");
      return m.length >= 2 ? m : null;
    },
  },
  {
    suspicion: "sepsis",
    priority:  "CRITICAL",
    rationale: "Fever + tachycardia meets SIRS criteria — sepsis protocol",
    match: (input, s) => {
      const m: string[] = [];
      const hr = input.vitals?.heartRate;
      if (s.has("fever") || (input.vitals?.tempC ?? 0) >= 38.3) m.push("fever");
      if (s.has("tachycardia") || (hr !== undefined && hr > 100)) m.push("tachycardia");
      return m.length >= 2 ? m : null;
    },
  },
  {
    suspicion: "stroke / CVA",
    priority:  "CRITICAL",
    rationale: "FAST criteria — stroke activation required",
    match: (_, s) => {
      const m: string[] = [];
      if (s.has("facial droop") || s.has("face droop")) m.push("facial droop");
      if (s.has("arm weakness") || s.has("arm numbness")) m.push("arm weakness");
      if (s.has("speech difficulty") || s.has("slurred speech") || s.has("aphasia")) m.push("speech difficulty");
      return m.length >= 2 ? m : null;
    },
  },
  {
    suspicion: "anaphylaxis",
    priority:  "CRITICAL",
    rationale: "Urticaria + throat swelling — anaphylaxis, epinephrine stat",
    match: (_, s) => {
      const m: string[] = [];
      if (s.has("hives") || s.has("urticaria") || s.has("rash")) m.push("hives");
      if (s.has("throat swelling") || s.has("throat tightness") || s.has("stridor")) m.push("throat swelling");
      return m.length >= 2 ? m : null;
    },
  },
  {
    suspicion: "hypertensive urgency",
    priority:  "HIGH",
    rationale: "Severe headache + visual changes — possible hypertensive emergency",
    match: (input, s) => {
      const m: string[] = [];
      const sbp = input.vitals?.sbp;
      if (sbp !== undefined && sbp >= 180) m.push("BP ≥ 180");
      if (s.has("severe headache") || s.has("headache")) m.push("severe headache");
      if (s.has("visual changes") || s.has("blurred vision") || s.has("vision changes")) m.push("visual changes");
      return m.length >= 2 ? m : null;
    },
  },
  {
    suspicion: "meningitis",
    priority:  "HIGH",
    rationale: "Fever + neck stiffness + headache triad — bacterial meningitis until proven otherwise",
    match: (_, s) => {
      const m: string[] = [];
      if (s.has("fever"))                               m.push("fever");
      if (s.has("neck stiffness") || s.has("neck pain")) m.push("neck stiffness");
      if (s.has("severe headache") || s.has("headache")) m.push("headache");
      return m.length >= 3 ? m : null;
    },
  },
  {
    suspicion: "DKA / hyperglycaemic crisis",
    priority:  "HIGH",
    rationale: "Polyuria + polydipsia + fruity breath — DKA protocol",
    match: (_, s) => {
      const m: string[] = [];
      if (s.has("frequent urination") || s.has("polyuria")) m.push("polyuria");
      if (s.has("excessive thirst") || s.has("polydipsia")) m.push("polydipsia");
      if (s.has("fruity breath") || s.has("abdominal pain") || s.has("nausea")) m.push("additional signs");
      return m.length >= 2 ? m : null;
    },
  },
];

/**
 * Run the multi-complaint fusion engine.
 * Returns the highest-priority fusion result, or null if no rule matches.
 */
export function fuseComplaints(input: FusionInput): FusionResult | null {
  const syms = new Set(
    input.symptoms.map((s) => s.toLowerCase().trim())
  );

  for (const rule of RULES) {
    const matched = rule.match(input, syms);
    if (matched) {
      return {
        suspicion:   rule.suspicion,
        priority:    rule.priority,
        rationale:   rule.rationale,
        matchedSigns: matched,
      };
    }
  }

  return null;
}

/** True when the fusion result warrants immediate escalation */
export function requiresImmediateEscalation(result: FusionResult | null): boolean {
  return result?.priority === "CRITICAL" || result?.priority === "HIGH";
}

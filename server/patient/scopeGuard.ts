export const SAFE_COMPLAINTS = [
  "sore_throat",
  "cough",
  "uri",
  "rash",
  "uti_simple",
  "headache_mild",
  "ear_pain",
  "nasal_congestion",
  "fever_mild",
  "conjunctivitis",
  "cold_symptoms",
  "mild_back_pain",
];

export const ESCALATION_REQUIRED_COMPLAINTS = [
  "chest_pain",
  "shortness_of_breath",
  "stroke_symptoms",
  "severe_abdominal_pain",
  "altered_consciousness",
  "severe_allergic_reaction",
  "suicidal_ideation",
  "sepsis_signs",
];

export interface ScopeCheckResult {
  withinScope: boolean;
  reason: string;
  requiresImmediate911?: boolean;
  suggestedPath: "self_service" | "physician_required" | "emergency_911";
}

export function isWithinScope(input: { complaint?: string; complaints?: string[] }): boolean {
  const complaint = input.complaint ?? input.complaints?.[0] ?? "";
  return SAFE_COMPLAINTS.includes(complaint.toLowerCase().replace(/ /g, "_"));
}

export function checkScope(input: { complaint?: string; complaints?: string[] }): ScopeCheckResult {
  const raw = input.complaint ?? input.complaints?.[0] ?? "";
  const complaint = raw.toLowerCase().replace(/ /g, "_");

  if (ESCALATION_REQUIRED_COMPLAINTS.includes(complaint)) {
    const is911 = ["chest_pain", "stroke_symptoms", "severe_allergic_reaction", "altered_consciousness"].includes(complaint);
    return {
      withinScope: false,
      reason: `${complaint} requires immediate emergency assessment`,
      requiresImmediate911: is911,
      suggestedPath: is911 ? "emergency_911" : "physician_required",
    };
  }

  if (SAFE_COMPLAINTS.includes(complaint)) {
    return {
      withinScope: true,
      reason: "Complaint is within self-service scope",
      suggestedPath: "self_service",
    };
  }

  return {
    withinScope: false,
    reason: `${complaint} is not on the approved self-service list`,
    suggestedPath: "physician_required",
  };
}

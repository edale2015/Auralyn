export interface SafetyCheckResult {
  override: boolean;
  disposition?: "er_now";
  triggered_flags: string[];
  reason: string;
  severity: "critical" | "none";
}

const RED_FLAGS: Record<string, string[]> = {
  chest_pain:     ["radiates_left_arm","diaphoresis","shortness_of_breath","syncope","hypotension","tachycardia_rest","severe_pressure"],
  sore_throat:    ["drooling","muffled_voice","trismus","stridor","inability_to_swallow","neck_stiffness"],
  abdominal_pain: ["rebound_tenderness","rigidity","guarding","vaginal_bleeding","positive_pregnancy_test","peritonitis_signs","severe_rlq"],
  headache:       ["worst_headache_of_life","sudden_onset","neurologic_deficit","neck_stiffness","fever","vision_changes","papilledema"],
  fever:          ["neck_stiffness","photophobia","confusion","petechiae","non_blanching","rigors_sepsis","high_fever_infant"],
  cough:          ["hemoptysis","hypoxia","cyanosis","severe_respiratory_distress","stridor","drooling"],
  rash:           ["petechiae","non_blanching","angioedema","anaphylaxis_signs","meningismus"],
  uti:            ["fever","rigors","confusion","sepsis_signs","urosepsis"],
  ear_pain:       ["post_auricular_swelling","facial_vesicles","severe_headache","mastoid_erythema"],
  sinus_pressure: ["periorbital_swelling","vision_changes","severe_headache","altered_consciousness"],
  anxiety:        ["tachycardia","shortness_of_breath","pleuritic_pain","recent_immobility"],
  back_pain:      ["tearing_pain","radiation_to_back","hypertensive","pulsatile_mass"],
  dizziness:      ["diplopia","dysarthria","ataxia","new_onset_elderly","facial_droop"],
};

const UNIVERSAL_RED_FLAGS = [
  "altered_consciousness","confusion","sepsis","hypotension","cyanosis",
  "severe_respiratory_distress","unstable_vital_signs","active_hemorrhage",
  "loss_of_consciousness","anaphylaxis_signs",
];

export function runSafetyCheck(complaint: string, features: string[]): SafetyCheckResult {
  const featureSet = new Set(features.map(f => f.toLowerCase().replace(/\s+/g,"_")));
  const triggered: string[] = [];

  for (const uf of UNIVERSAL_RED_FLAGS) {
    if (featureSet.has(uf)) triggered.push(uf);
  }

  const complaintFlags = RED_FLAGS[complaint.toLowerCase()] ?? [];
  for (const flag of complaintFlags) {
    if (featureSet.has(flag)) triggered.push(flag);
  }

  if (triggered.length > 0) {
    return {
      override: true,
      disposition: "er_now",
      triggered_flags: triggered,
      reason: `Safety red flag(s) triggered: ${triggered.join(", ")}. Immediate emergency evaluation required.`,
      severity: "critical",
    };
  }

  return { override: false, triggered_flags: [], reason: "No safety flags triggered.", severity: "none" };
}

export function getRedFlagsForComplaint(complaint: string): string[] {
  return RED_FLAGS[complaint.toLowerCase()] ?? [];
}

export function getAllRedFlags(): Record<string, string[]> {
  return { ...RED_FLAGS, universal: UNIVERSAL_RED_FLAGS };
}

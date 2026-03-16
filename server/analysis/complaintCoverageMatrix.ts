export interface ComplaintCoverage {
  complaint: string;
  engines: string[];
  skills: string[];
  guideline: string;
  guidelineSource: string;
  simulationPassRate: number;
  redFlagsCovered: string[];
  gapAreas: string[];
}

export const complaintCoverageMatrix: Record<string, ComplaintCoverage> = {
  cough: {
    complaint: "cough",
    engines: ["redFlagEngine", "bayesianDifferential", "similarityEngine", "clusterScoring"],
    skills: ["pneumonia_risk", "asthma_history", "copd_exacerbation"],
    guideline: "cdc_respiratory",
    guidelineSource: "CDC",
    simulationPassRate: 0.91,
    redFlagsCovered: ["sob", "hemoptysis", "chest_pain"],
    gapAreas: ["pediatric_wheeze", "pertussis_detection"],
  },
  chest_pain: {
    complaint: "chest_pain",
    engines: ["redFlagEngine", "bayesianDifferential", "clusterScoring", "temporalRiskEngine"],
    skills: ["mi_risk", "aortic_dissection", "pe_risk", "pericarditis"],
    guideline: "emergency_cardiac",
    guidelineSource: "ACEP / AHA",
    simulationPassRate: 0.88,
    redFlagsCovered: ["diaphoresis", "tearing_pain", "radiation_to_arm", "syncope"],
    gapAreas: ["cocaine_induced_acs", "takotsubo"],
  },
  dizziness: {
    complaint: "dizziness",
    engines: ["redFlagEngine", "similarityEngine", "clusterScoring"],
    skills: ["stroke_risk", "vertigo", "bppv", "medication_side_effect"],
    guideline: "neurology_triage",
    guidelineSource: "AAN",
    simulationPassRate: 0.79,
    redFlagsCovered: ["unilateral_weakness", "speech_change", "ataxia"],
    gapAreas: ["central_vs_peripheral_vertigo", "orthostatic_hypotension"],
  },
  headache: {
    complaint: "headache",
    engines: ["redFlagEngine", "bayesianDifferential", "temporalRiskEngine"],
    skills: ["sah_risk", "meningitis", "migraine", "hypertensive_emergency"],
    guideline: "headache_red_flags",
    guidelineSource: "NICE",
    simulationPassRate: 0.85,
    redFlagsCovered: ["thunderclap", "neck_stiffness", "neuro_deficit", "fever_with_headache"],
    gapAreas: ["cluster_headache", "idiopathic_intracranial_hypertension"],
  },
  breathlessness: {
    complaint: "breathlessness",
    engines: ["redFlagEngine", "temporalRiskEngine", "clusterScoring"],
    skills: ["respiratory_failure", "pe_risk", "heart_failure", "anaphylaxis"],
    guideline: "respiratory_emergency",
    guidelineSource: "BTS",
    simulationPassRate: 0.83,
    redFlagsCovered: ["hypoxia", "stridor", "cyanosis", "silent_chest"],
    gapAreas: ["high_altitude_sickness", "vocal_cord_dysfunction"],
  },
  fever: {
    complaint: "fever",
    engines: ["redFlagEngine", "bayesianDifferential", "clusterScoring"],
    skills: ["febrile_infant", "sepsis_risk", "meningococcemia", "malaria"],
    guideline: "febrile_illness_triage",
    guidelineSource: "NICE / CDC",
    simulationPassRate: 0.87,
    redFlagsCovered: ["petechiae", "infant_fever", "rigors", "rash_with_fever"],
    gapAreas: ["returning_traveler_fever", "endocarditis"],
  },
  ear_pain: {
    complaint: "ear_pain",
    engines: ["redFlagEngine", "similarityEngine"],
    skills: ["mastoiditis", "otitis_media", "referred_pain", "foreign_body"],
    guideline: "ent_triage",
    guidelineSource: "AAO-HNS",
    simulationPassRate: 0.90,
    redFlagsCovered: ["mastoid_tenderness", "facial_palsy", "hearing_loss_sudden"],
    gapAreas: ["necrotizing_otitis_externa", "cholesteatoma"],
  },
  sore_throat: {
    complaint: "sore_throat",
    engines: ["redFlagEngine", "bayesianDifferential", "similarityEngine"],
    skills: ["peritonsillar_abscess", "strep_pharyngitis", "epiglottitis", "mono"],
    guideline: "pharyngitis_protocol",
    guidelineSource: "IDSA",
    simulationPassRate: 0.88,
    redFlagsCovered: ["trismus", "uvula_deviation", "drooling", "stridor"],
    gapAreas: ["deep_space_neck_infection", "retropharyngeal_abscess"],
  },
};

export function getCoverageForComplaint(complaint: string): ComplaintCoverage | null {
  return complaintCoverageMatrix[complaint] ?? null;
}

export function getAllComplaints(): string[] {
  return Object.keys(complaintCoverageMatrix);
}

export function getOverallCoverageStats() {
  const entries = Object.values(complaintCoverageMatrix);
  const avgPassRate = entries.reduce((sum, e) => sum + e.simulationPassRate, 0) / entries.length;
  const totalEngines = new Set(entries.flatMap(e => e.engines)).size;
  const totalSkills = new Set(entries.flatMap(e => e.skills)).size;
  const complaintsAbove90 = entries.filter(e => e.simulationPassRate >= 0.90).length;

  return {
    totalComplaints: entries.length,
    avgPassRate,
    totalUniqueEngines: totalEngines,
    totalUniqueSkills: totalSkills,
    complaintsAbove90pct: complaintsAbove90,
  };
}

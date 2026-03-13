import { emitClinicalEvent } from "../state/clinicalEventBus";
import { getClinicalState } from "../state/clinicalStateStore";
import { getAdmissionRiskFactors, getDeteriorationRiskFactors } from "./riskFactorLibrary";

export type RiskLevel = "low" | "moderate" | "high" | "critical";

export interface RiskAssessment {
  admissionRisk: RiskLevel;
  deteriorationRisk: RiskLevel;
  readmissionRisk: RiskLevel;
  riskScore: number;
  maxScore: number;
  factors: { factor: string; present: boolean; weight: number; contribution: number }[];
  activeFactors: string[];
  recommendedActions: string[];
  confidence: number;
}

function scoreToLevel(score: number, max: number): RiskLevel {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.75) return "critical";
  if (pct >= 0.50) return "high";
  if (pct >= 0.25) return "moderate";
  return "low";
}

function extractFactorsFromText(text: string, symptoms: string): Record<string, boolean> {
  const combined = `${text} ${symptoms}`.toLowerCase();
  return {
    radiation_arm_jaw: /arm|jaw|shoulder/.test(combined),
    sob: /shortness of breath|dyspnea|sob|can't breathe|difficulty breathing/.test(combined),
    diaphoresis: /sweat|diaphor|sweating/.test(combined),
    prior_mi: /prior mi|history of mi|heart attack|coronary|cad/.test(combined),
    diabetes: /diabetes|diabetic|dm[12]|blood sugar/.test(combined),
    hypertension: /hypertension|high blood pressure|htn/.test(combined),
    age_65: /age.*6[5-9]|age.*[789]\d|65.*year|older adult|elderly/.test(combined),
    elevated_troponin: /troponin|troponin elevated|positive troponin/.test(combined),
    fever_3d: /fever.*[3-9] days|3+ days.*fever|persistent fever/.test(combined),
    productive_purulent: /green|yellow|purulent|thick mucus|productive cough/.test(combined),
    sob_at_rest: /sob at rest|can't breathe at rest|resting dyspnea/.test(combined),
    immunocompromised: /immunocompromised|hiv|chemotherapy|steroids|transplant|immunosuppressed/.test(combined),
    copd_asthma: /copd|asthma|emphysema|lung disease|bronchitis/.test(combined),
    o2_sat_low: /o2.*9[0-3]|oxygen.*9[0-3]|spo2.*9[0-3]|hypoxia/.test(combined),
    fever_chills: /fever.*chills|chills.*fever|rigors/.test(combined),
    flank_pain: /flank pain|back pain|cva|costovertebral/.test(combined),
    pregnancy: /pregnant|pregnancy|prenatal/.test(combined),
    structural_abnormality: /kidney stone|catheter|stent|obstruction|hydronephrosis/.test(combined),
    male_sex: /\bmale\b|\bman\b|\bgentleman\b/.test(combined),
    high_fever_104: /104|105|106|40\.[0-9]|41/.test(combined),
    stiff_neck: /stiff neck|neck stiffness|meningismus|nuchal rigidity/.test(combined),
    rash: /rash|petechiae|purpura|spots/.test(combined),
    altered_mental: /confused|confusion|altered|disoriented|lethargic|unresponsive/.test(combined),
    hr_120: /heart rate.*12[0-9]|hr.*12[0-9]|pulse.*12[0-9]|tachycardic/.test(combined),
    rebound_tenderness: /rebound|rebound tenderness|peritoneal/.test(combined),
    high_fever: /fever|high temperature|101|102|103/.test(combined),
    rigidity: /rigid|board.like|guarding/.test(combined),
    pregnancy_hcg: /hcg.*positive|pregnant|pregnancy|ectopic/.test(combined),
    severe_pain_10_10: /9.?\/10|10.?\/10|severe pain|worst pain/.test(combined),
    vomiting_inability: /can't keep|vomiting.*fluid|unable to tolerate/.test(combined),
    stemi_ecg: /stemi|st.*elevation/.test(combined),
    hypotension: /hypotension|low blood pressure|sbp.*[6-9][0-9]|sbp.*[1-9][0-9]/.test(combined),
    rapid_troponin_rise: /troponin rising|serial troponin/.test(combined),
    vt_vf: /vt|vf|ventricular tachycardia|ventricular fibrillation/.test(combined),
    sbp_drop: /sbp.*100|blood pressure.*90|hypotension/.test(combined),
    rr_30: /respiratory rate.*30|rr.*30|breathing.*rapid/.test(combined),
    gcs_drop: /gcs|glasgow|confused|unresponsive/.test(combined),
    lactate_high: /lactate|lactic acid/.test(combined),
  };
}

const RECOMMENDED_ACTIONS: Record<string, Record<RiskLevel, string[]>> = {
  chest_pain: {
    low: ["Obtain ECG", "Serial troponin × 2", "Reassess in 3h"],
    moderate: ["Stat ECG", "Serial troponin", "Aspirin 325mg", "Cardiology alert"],
    high: ["Cath lab on standby", "IV access × 2", "Continuous monitoring", "Cardiology STAT"],
    critical: ["STEMI protocol activation", "Dual antiplatelet therapy", "Emergent cath lab"],
  },
  fever: {
    low: ["Antipyretics PRN", "Hydration", "Return precautions given"],
    moderate: ["CBC + CMP", "Blood cultures if systemic signs", "Source localization"],
    high: ["Sepsis bundle", "Blood cultures × 2", "Lactate", "IV antibiotics within 1h"],
    critical: ["Septic shock protocol", "ICU transfer", "Vasopressors"],
  },
  uti: {
    low: ["Nitrofurantoin × 5d", "Oral fluids", "Return if not improving 48h"],
    moderate: ["UA + culture", "Oral fluoroquinolone", "Follow-up culture in 7d"],
    high: ["IV ceftriaxone", "Hospitalization consider", "Renal ultrasound"],
    critical: ["ICU evaluation", "Nephrology consult", "Sepsis protocol"],
  },
  abdominal_pain: {
    low: ["Symptomatic treatment", "Diet modification", "GI follow-up"],
    moderate: ["Labs: CBC, lipase, LFTs", "Abdominal X-ray", "Surgical consult PRN"],
    high: ["CT abdomen/pelvis", "Surgical consult", "NPO + IV access"],
    critical: ["Emergency surgery", "ICU", "Immediate operative evaluation"],
  },
};

export function computeAdmissionRisk(
  complaint: string,
  presentingText: string,
  caseId?: string
): RiskAssessment {
  const factors = getAdmissionRiskFactors(complaint);
  const detFactors = getDeteriorationRiskFactors(complaint);
  const state = caseId ? getClinicalState(caseId) : null;
  const allText = `${presentingText} ${state?.symptoms ?? ""} ${JSON.stringify(state?.modifiers ?? {})}`;
  const presentFlags = extractFactorsFromText(presentingText, state?.symptoms ?? "");

  let score = 0;
  let maxScore = 0;
  const factorBreakdown: RiskAssessment["factors"] = [];
  const activeFactors: string[] = [];

  for (const f of factors) {
    maxScore += f.weight;
    const present = presentFlags[f.key] ?? false;
    const contribution = present ? f.weight : 0;
    score += contribution;
    if (present) activeFactors.push(f.label);
    factorBreakdown.push({ factor: f.label, present, weight: f.weight, contribution });
  }

  const admissionRisk = scoreToLevel(score, maxScore);
  let detScore = 0;
  let detMax = 0;
  for (const f of detFactors) {
    detMax += f.weight;
    const present = presentFlags[f.key] ?? false;
    if (present) detScore += f.weight;
  }
  const deteriorationRisk = scoreToLevel(detScore, detMax || 1);

  const symptoms = presentingText.toLowerCase();
  const readmissionRisk: RiskLevel =
    /recent hospitalization|admitted last|discharged from/.test(symptoms) ? "high" :
    (state?.patient?.comorbidities?.length ?? 0) > 2 ? "moderate" : "low";

  const recommendedActions =
    (RECOMMENDED_ACTIONS[complaint] ?? {})[admissionRisk] ?? ["Physician review required"];

  const confidence = Math.min(0.95, 0.5 + (factorBreakdown.filter(f => f.present).length / Math.max(factors.length, 1)) * 0.5);

  const assessment: RiskAssessment = {
    admissionRisk,
    deteriorationRisk,
    readmissionRisk,
    riskScore: Math.round(score * 100) / 100,
    maxScore: Math.round(maxScore * 100) / 100,
    factors: factorBreakdown,
    activeFactors,
    recommendedActions,
    confidence: Math.round(confidence * 100) / 100,
  };

  if (caseId) {
    emitClinicalEvent(caseId, "RISK_ASSESSED", { riskAssessment: { admissionRisk, deteriorationRisk, riskScore: assessment.riskScore, factors: activeFactors } });
  }

  return assessment;
}

/**
 * Admission Risk Engine
 *
 * Predicts: "Will this patient end up admitted to hospital?"
 *
 * High admission risk triggers a 2-hour phone callback and direct-admission
 * pathway recommendation — skipping the triage queue and going straight to
 * the admitting physician.
 *
 * Score thresholds (sum of weighted risk factors):
 *   0–2  → low   (outpatient or telemed care)
 *   3–5  → medium (in-person clinic, watchful waiting)
 *   6+   → high  (direct admission pathway recommended)
 */

export interface AdmissionRiskInput {
  patientId?:  string;
  ageYears?:   number;
  complaint?:  string;
  vitals?: {
    systolicBp?:        number;
    oxygenSaturation?:  number;
    heartRate?:         number;
    respiratoryRate?:   number;
    temperature?:       number;
  };
  symptoms?: string[];
  comorbidities?: string[];  // e.g. ["diabetes", "copd", "chf"]
}

export interface AdmissionRiskResult {
  score:                      number;
  risk:                       "low" | "medium" | "high";
  recommendDirectAdmissionPath: boolean;
  contributingFactors:        string[];
}

export function predictAdmissionRisk(p: AdmissionRiskInput): AdmissionRiskResult {
  let score = 0;
  const factors: string[] = [];

  // Demographics
  if ((p.ageYears ?? 0) > 65) {
    score += 2;
    factors.push("Age > 65");
  }

  // Chief complaint
  if (p.complaint === "chest_pain")           { score += 2; factors.push("Chest pain"); }
  if (p.complaint === "shortness_of_breath")  { score += 2; factors.push("Shortness of breath"); }
  if (p.complaint === "altered_mental_status") { score += 3; factors.push("AMS"); }
  if (p.complaint === "severe_abdominal_pain") { score += 2; factors.push("Severe abdominal pain"); }

  // Vitals
  const bp  = p.vitals?.systolicBp       ?? 120;
  const spo = p.vitals?.oxygenSaturation ?? 98;
  const hr  = p.vitals?.heartRate        ?? 80;
  const rr  = p.vitals?.respiratoryRate  ?? 16;
  const temp = p.vitals?.temperature     ?? 98.6;

  if (bp  < 100) { score += 3; factors.push("Hypotension (SBP < 100)"); }
  if (spo < 92)  { score += 3; factors.push("Hypoxia (SpO2 < 92%)"); }
  if (hr  >= 120) { score += 2; factors.push("Tachycardia (HR ≥ 120)"); }
  if (rr  >= 22)  { score += 2; factors.push("Tachypnea (RR ≥ 22)"); }
  if (temp > 103) { score += 1; factors.push("High fever (> 103°F)"); }

  // Symptoms
  if (p.symptoms?.includes("confusion"))      { score += 2; factors.push("Confusion"); }
  if (p.symptoms?.includes("syncope"))        { score += 2; factors.push("Syncope"); }

  // Comorbidities
  const morbidities = p.comorbidities ?? [];
  if (morbidities.includes("chf"))     { score += 1; factors.push("CHF history"); }
  if (morbidities.includes("copd"))    { score += 1; factors.push("COPD history"); }
  if (morbidities.includes("cancer"))  { score += 1; factors.push("Active cancer"); }

  const risk: AdmissionRiskResult["risk"] =
    score >= 6 ? "high"   :
    score >= 3 ? "medium" : "low";

  return {
    score,
    risk,
    recommendDirectAdmissionPath: risk === "high",
    contributingFactors: factors,
  };
}

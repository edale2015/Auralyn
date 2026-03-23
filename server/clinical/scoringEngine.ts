export interface CentorInput {
  fever: boolean;
  tonsillarExudate: boolean;
  tenderNodes: boolean;
  cough: boolean;
  age?: number;
}

export interface Curb65Input {
  confusion: boolean;
  urea: number;
  respRate: number;
  systolicBp: number;
  age: number;
}

export interface SoreThroatRiskInput extends CentorInput {
  rapidAntigenTest?: "positive" | "negative" | "not_done";
  symptoms_days?: number;
}

export interface PneumoniaRiskInput extends Curb65Input {
  oxygenSaturation?: number;
}

export interface CentorResult {
  score: number;
  interpretation: string;
  recommendation: string;
  antibioticRecommended: boolean;
}

export interface Curb65Result {
  score: number;
  severity: "low" | "moderate" | "severe";
  interpretation: string;
  recommendation: string;
  hospitalizationRecommended: boolean;
}

export function centorScore(input: CentorInput): CentorResult {
  let score = 0;
  if (input.fever) score++;
  if (input.tonsillarExudate) score++;
  if (input.tenderNodes) score++;
  if (!input.cough) score++;

  const ageAdjust = input.age !== undefined
    ? input.age >= 45 ? -1 : input.age < 15 ? 1 : 0
    : 0;

  score = Math.max(0, score + ageAdjust);

  let interpretation: string;
  let recommendation: string;
  let antibioticRecommended = false;

  if (score <= 0) {
    interpretation = "Very unlikely bacterial pharyngitis";
    recommendation = "No antibiotic. Symptomatic care only.";
  } else if (score === 1) {
    interpretation = "Unlikely bacterial pharyngitis";
    recommendation = "No antibiotic. Symptomatic care and watchful waiting.";
  } else if (score === 2) {
    interpretation = "Possible bacterial pharyngitis";
    recommendation = "Consider rapid antigen test (RADT). Antibiotic only if positive.";
  } else if (score === 3) {
    interpretation = "Probable bacterial pharyngitis";
    recommendation = "Empirical antibiotic treatment reasonable. RADT preferred first.";
    antibioticRecommended = true;
  } else {
    interpretation = "Highly probable bacterial pharyngitis";
    recommendation = "Empirical antibiotic treatment recommended.";
    antibioticRecommended = true;
  }

  return { score, interpretation, recommendation, antibioticRecommended };
}

export function curb65(input: Curb65Input): Curb65Result {
  let score = 0;
  if (input.confusion) score++;
  if (input.urea > 7) score++;
  if (input.respRate >= 30) score++;
  if (input.systolicBp < 90) score++;
  if (input.age >= 65) score++;

  let severity: Curb65Result["severity"];
  let interpretation: string;
  let recommendation: string;
  let hospitalizationRecommended = false;

  if (score <= 1) {
    severity = "low";
    interpretation = "Low severity community-acquired pneumonia";
    recommendation = "Suitable for home treatment. Oral antibiotics + follow-up in 48h.";
  } else if (score === 2) {
    severity = "moderate";
    interpretation = "Moderate severity — consider hospital admission";
    recommendation = "Short inpatient admission or close outpatient monitoring. IV or oral antibiotics.";
    hospitalizationRecommended = true;
  } else {
    severity = "severe";
    interpretation = "Severe pneumonia — hospital admission required";
    recommendation = "Urgent hospital admission. Consider ICU if score ≥ 4.";
    hospitalizationRecommended = true;
  }

  return { score, severity, interpretation, recommendation, hospitalizationRecommended };
}

export function combinedClinicalScore(params: {
  complaints: string[];
  vitals: { temperature?: number; heartRate?: number; oxygenSaturation?: number; systolicBp?: number; respRate?: number; urea?: number };
  history: { age: number; confusion?: boolean; cough?: boolean; tonsillarExudate?: boolean; tenderNodes?: boolean };
}): { centor?: CentorResult; curb65?: Curb65Result; primaryScore: number; overallRisk: "low" | "moderate" | "high" } {
  const { complaints, vitals, history } = params;

  const hasSoreThroat = complaints.includes("sore_throat");
  const hasPneumonia = complaints.includes("breathlessness") || complaints.includes("cough");

  const centor = hasSoreThroat ? centorScore({
    fever: (vitals.temperature ?? 36.5) >= 38.0,
    tonsillarExudate: history.tonsillarExudate ?? false,
    tenderNodes: history.tenderNodes ?? false,
    cough: history.cough ?? true,
    age: history.age,
  }) : undefined;

  const curb = hasPneumonia ? curb65({
    confusion: history.confusion ?? false,
    urea: vitals.urea ?? 5,
    respRate: vitals.respRate ?? 18,
    systolicBp: vitals.systolicBp ?? 120,
    age: history.age,
  }) : undefined;

  const primaryScore = Math.max(centor?.score ?? 0, curb?.score ?? 0);
  const overallRisk: "low" | "moderate" | "high" =
    (curb?.severity === "severe" || primaryScore >= 4) ? "high"
    : (curb?.severity === "moderate" || primaryScore >= 2) ? "moderate"
    : "low";

  return { centor, curb65: curb, primaryScore, overallRisk };
}

export interface NEWS2Input {
  respirationRate: number;
  spO2: number;
  onSupplementalO2: boolean;
  systolicBP: number;
  heartRate: number;
  consciousness: "alert" | "confusion" | "voice" | "pain" | "unresponsive";
  temperature: number;
}

export interface NEWS2Result {
  score: number;
  clinicalRisk: string;
  recommendation: string;
  components: { parameter: string; value: number | string; points: number }[];
}

function rrScore(rr: number): number {
  if (rr <= 8) return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3;
}

function spo2Score(spo2: number, onO2: boolean): number {
  if (!onO2) {
    if (spo2 <= 91) return 3;
    if (spo2 <= 93) return 2;
    if (spo2 <= 95) return 1;
    return 0;
  }
  if (spo2 <= 83) return 3;
  if (spo2 <= 85) return 2;
  if (spo2 <= 87) return 1;
  return 0;
}

function bpScore(sbp: number): number {
  if (sbp <= 90) return 3;
  if (sbp <= 100) return 2;
  if (sbp <= 110) return 1;
  if (sbp <= 219) return 0;
  return 3;
}

function hrScore(hr: number): number {
  if (hr <= 40) return 3;
  if (hr <= 50) return 1;
  if (hr <= 90) return 0;
  if (hr <= 110) return 1;
  if (hr <= 130) return 2;
  return 3;
}

function consciousnessScore(c: string): number {
  return c === "alert" ? 0 : 3;
}

function tempScore(t: number): number {
  if (t <= 35) return 3;
  if (t <= 36) return 1;
  if (t <= 38) return 0;
  if (t <= 39) return 1;
  return 2;
}

export function calculateNEWS2(input: NEWS2Input): NEWS2Result {
  const components = [
    { parameter: "Respiration rate", value: input.respirationRate, points: rrScore(input.respirationRate) },
    { parameter: "SpO2", value: input.spO2, points: spo2Score(input.spO2, input.onSupplementalO2) },
    { parameter: "Supplemental O2", value: input.onSupplementalO2 ? "Yes" : "No" as string | number, points: input.onSupplementalO2 ? 2 : 0 },
    { parameter: "Systolic BP", value: input.systolicBP, points: bpScore(input.systolicBP) },
    { parameter: "Heart rate", value: input.heartRate, points: hrScore(input.heartRate) },
    { parameter: "Consciousness", value: input.consciousness as string | number, points: consciousnessScore(input.consciousness) },
    { parameter: "Temperature", value: input.temperature, points: tempScore(input.temperature) },
  ];

  const score = components.reduce((s, c) => s + c.points, 0);

  let clinicalRisk: string;
  let recommendation: string;
  if (score <= 4) {
    clinicalRisk = "Low";
    recommendation = "Continue routine monitoring every 4-6 hours";
  } else if (score <= 6) {
    clinicalRisk = "Medium";
    recommendation = "Increase monitoring frequency — urgent clinical review";
  } else {
    clinicalRisk = "High";
    recommendation = "Urgent/emergency response — continuous monitoring, consider ICU";
  }

  return { score, clinicalRisk, recommendation, components };
}

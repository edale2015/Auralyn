export type SeverityScoringInput = {
  normalizedSymptoms: string[];
  redFlags?: string[];
  vitals?: {
    heartRate?: number;
    systolicBP?: number;
    oxygenSaturation?: number;
    temperatureC?: number;
    respiratoryRate?: number;
  };
};

export type SeverityScoringOutput = {
  numericScore: number;
  level: "low" | "moderate" | "high" | "critical";
  reasons: string[];
};

export function severityScoringEngine(
  input: SeverityScoringInput
): SeverityScoringOutput {
  let score = 0;
  const reasons: string[] = [];
  const s = new Set(input.normalizedSymptoms || []);
  const v = input.vitals || {};
  const redFlags = input.redFlags || [];

  // Red flags carry the heaviest weight
  if (redFlags.length > 0) {
    score += redFlags.length * 3;
    reasons.push(`${redFlags.length} red flag(s) present`);
  }

  // High-severity symptoms
  if (s.has("chest_pain"))          { score += 2; reasons.push("Chest pain"); }
  if (s.has("shortness_of_breath")) { score += 2; reasons.push("Shortness of breath"); }
  if (s.has("syncope"))             { score += 3; reasons.push("Syncope"); }
  if (s.has("thunderclap_headache")){ score += 3; reasons.push("Thunderclap headache"); }
  if (s.has("unilateral_weakness")) { score += 3; reasons.push("Neurologic deficit (unilateral weakness)"); }
  if (s.has("facial_droop"))        { score += 3; reasons.push("Facial droop"); }
  if (s.has("drooling"))            { score += 3; reasons.push("Drooling — airway concern"); }
  if (s.has("altered_consciousness")){ score += 4; reasons.push("Altered consciousness"); }
  if (s.has("persistent_vomiting")) { score += 1; reasons.push("Persistent vomiting"); }
  if (s.has("fever"))               { score += 1; reasons.push("Fever"); }
  if (s.has("neck_stiffness"))      { score += 2; reasons.push("Neck stiffness"); }

  // Vitals abnormalities
  const o2 = v.oxygenSaturation ?? 100;
  if (o2 < 90)      { score += 4; reasons.push(`Critical hypoxia (SpO2 ${o2}%)`); }
  else if (o2 < 94) { score += 2; reasons.push(`Low SpO2 (${o2}%)`); }

  const sbp = v.systolicBP ?? 999;
  if (sbp < 90) { score += 4; reasons.push(`Hypotension (SBP ${sbp} mmHg)`); }

  const hr = v.heartRate ?? 0;
  if (hr > 130) { score += 2; reasons.push(`Marked tachycardia (HR ${hr})`); }
  else if (hr > 110) { score += 1; reasons.push(`Tachycardia (HR ${hr})`); }

  const rr = v.respiratoryRate ?? 0;
  if (rr > 28) { score += 2; reasons.push(`Tachypnea (RR ${rr})`); }

  const temp = v.temperatureC ?? 0;
  if (temp >= 39.5) { score += 2; reasons.push(`High fever (${temp}°C)`); }
  else if (temp >= 38.5) { score += 1; reasons.push(`Fever (${temp}°C)`); }

  const level: SeverityScoringOutput["level"] =
    score >= 8 ? "critical" :
    score >= 5 ? "high" :
    score >= 2 ? "moderate" : "low";

  return { numericScore: score, level, reasons };
}

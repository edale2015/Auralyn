import { db } from "../db";
import { sql } from "drizzle-orm";

export interface AdmissionRiskInput {
  [featureKey: string]: boolean | number | string;
}

export interface AdmissionRiskResult {
  score: number;
  level: "low" | "moderate" | "high" | "critical";
  contributors: Array<{ feature: string; label: string; weight: number }>;
  totalRules: number;
}

export async function computeAdmissionRisk(
  input: AdmissionRiskInput
): Promise<AdmissionRiskResult> {
  try {
    const result = await db.execute(sql`
      SELECT feature_key, label, weight FROM kb_admission_rules WHERE is_active = TRUE
    `);
    const rules = (result.rows ?? result) as any[];

    let score = 0;
    const contributors: Array<{ feature: string; label: string; weight: number }> = [];

    for (const r of rules) {
      const val = input[r.feature_key as string];
      if (val === true || (typeof val === "number" && val > 0)) {
        score += r.weight as number;
        contributors.push({ feature: r.feature_key, label: r.label || r.feature_key, weight: r.weight });
      }
    }

    const clipped = Math.min(1, Math.max(0, score));
    const level =
      clipped >= 0.8 ? "critical"
      : clipped >= 0.6 ? "high"
      : clipped >= 0.35 ? "moderate"
      : "low";

    return { score: clipped, level, contributors, totalRules: rules.length };
  } catch {
    return { score: 0, level: "low", contributors: [], totalRules: 0 };
  }
}

export async function seedAdmissionRules(): Promise<number> {
  const rules = [
    { feature_key: "age_over_65",          label: "Age ≥65",                       weight: 0.20, category: "demographics" },
    { feature_key: "age_over_80",          label: "Age ≥80 (geriatric risk)",       weight: 0.30, category: "demographics" },
    { feature_key: "immunocompromised",    label: "Immunocompromised",              weight: 0.25, category: "risk_factor" },
    { feature_key: "dyspnea",             label: "Dyspnea / SOB",                  weight: 0.25, category: "symptom" },
    { feature_key: "chest_pain",          label: "Chest pain",                     weight: 0.30, category: "symptom" },
    { feature_key: "altered_mentation",   label: "Altered mental status",          weight: 0.35, category: "neuro" },
    { feature_key: "hypotension",         label: "Hypotension (SBP <90)",          weight: 0.35, category: "vital" },
    { feature_key: "spo2_low",            label: "SpO₂ <92%",                      weight: 0.30, category: "vital" },
    { feature_key: "hr_over_120",         label: "HR >120 bpm",                    weight: 0.20, category: "vital" },
    { feature_key: "fever_high",          label: "High fever (≥39°C)",             weight: 0.15, category: "vital" },
    { feature_key: "prior_admission",     label: "Hospital admission in past 30d",  weight: 0.20, category: "history" },
    { feature_key: "severe_pain",         label: "Severe pain (score ≥7)",          weight: 0.15, category: "symptom" },
    { feature_key: "cardiac_history",     label: "Cardiac history",                weight: 0.15, category: "history" },
    { feature_key: "diabetes",            label: "Diabetes mellitus",              weight: 0.10, category: "comorbidity" },
    { feature_key: "copd",               label: "COPD / chronic lung disease",     weight: 0.15, category: "comorbidity" },
    { feature_key: "sepsis_criteria",    label: "Meets SIRS/sepsis criteria",      weight: 0.40, category: "critical" },
  ];

  let seeded = 0;
  for (const r of rules) {
    await db.execute(sql`
      INSERT INTO kb_admission_rules (feature_key, label, weight, category, is_active)
      VALUES (${r.feature_key}, ${r.label}, ${r.weight}, ${r.category}, TRUE)
      ON CONFLICT DO NOTHING
    `);
    seeded++;
  }
  return seeded;
}

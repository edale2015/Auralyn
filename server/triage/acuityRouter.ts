/**
 * Scale-Adaptive Acuity Router (BMAD-style)
 * Determines what level of clinical workup a patient needs BEFORE running
 * any engines — preventing unnecessary computation on simple cases.
 *
 * Maps to ESI (Emergency Severity Index) 5-level triage:
 *   ESI 1 → IMMEDIATE   (life-threatening, full protocol + ICU track)
 *   ESI 2 → EMERGENT    (high risk, full protocol + ED track)
 *   ESI 3 → URGENT      (moderate risk, standard protocol)
 *   ESI 4 → SEMI-URGENT (low risk, lightweight protocol)
 *   ESI 5 → NON-URGENT  (minimal, nurse-managed)
 *
 * "Scale-adaptive" means:
 *   - ESI 1–2: run ALL engines (sepsis, digital twin, CDE, imaging)
 *   - ESI 3:   run scoring + sepsis + CDE (skip twin/imaging unless triggered)
 *   - ESI 4–5: run scoring only (skip heavy engines entirely)
 *
 * This prevents the framework's intensity from being "overkill" on minor cases
 * (article: "a sledgehammer on a thumbtack").
 */

export type AcuityLevel = 1 | 2 | 3 | 4 | 5;

export type WorkupDepth = "FULL" | "STANDARD" | "LIGHTWEIGHT" | "MINIMAL";

export interface AcuityInput {
  vitals?: {
    hr?:         number;
    rr?:         number;
    spo2?:       number;
    systolicBP?: number;
    sbp?:        number;
    temp?:       number;
    gcs?:        number;      // Glasgow Coma Scale
  };
  symptoms?:    string[];
  chiefComplaint?: string;
  age?:         number;
  pregnant?:    boolean;
  pediatric?:   boolean;      // age < 16
  pain?:        number;       // 0–10 NRS
}

export interface AcuityDecision {
  esiLevel:    AcuityLevel;
  label:       string;
  workup:      WorkupDepth;
  engines:     string[];      // which engines to activate
  rationale:   string[];
  fastTrack:   boolean;       // eligible for nurse-led fast track
  targetTime:  string;        // target time-to-physician
}

// ── Red flag terms that immediately signal ESI 2 ─────────────────────────────
const ESI1_COMPLAINTS = [
  "cardiac arrest", "not breathing", "unresponsive", "pulseless",
  "major trauma", "stroke", "anaphylaxis", "respiratory failure",
];
const ESI2_COMPLAINTS = [
  "chest pain", "shortness of breath", "difficulty breathing", "seizure",
  "altered mental status", "confusion", "syncope", "overdose", "severe bleeding",
  "sepsis", "meningitis", "ectopic", "aortic", "dissection",
];
const ESI4_5_COMPLAINTS = [
  "sore throat", "cold", "runny nose", "ear ache", "minor cut", "rash",
  "mild headache", "prescription refill", "suture removal", "routine",
];

function matchesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((t) => lower.includes(t));
}

export function routeAcuity(input: AcuityInput): AcuityDecision {
  const v      = input.vitals ?? {};
  const hr     = v.hr  ?? 80;
  const rr     = v.rr  ?? 16;
  const spo2   = v.spo2 ?? 98;
  const sbp    = v.systolicBP ?? v.sbp ?? 120;
  const gcs    = v.gcs ?? 15;
  const temp   = v.temp ?? 98.6;
  const pain   = input.pain ?? 0;

  const complaint  = input.chiefComplaint ?? "";
  const symptoms   = (input.symptoms ?? []).join(" ");
  const allText    = `${complaint} ${symptoms}`.toLowerCase();
  const rationale: string[] = [];

  // ── ESI 1: Life threat ────────────────────────────────────────────────────
  if (
    gcs <= 8 ||
    spo2 < 85 ||
    sbp < 70 ||
    hr > 160 ||
    matchesAny(allText, ESI1_COMPLAINTS)
  ) {
    if (gcs <= 8)  rationale.push(`GCS=${gcs} — altered consciousness`);
    if (spo2 < 85) rationale.push(`SpO2=${spo2}% — critical hypoxia`);
    if (sbp < 70)  rationale.push(`SBP=${sbp} — circulatory collapse`);
    if (hr > 160)  rationale.push(`HR=${hr} — extreme tachycardia`);
    if (matchesAny(allText, ESI1_COMPLAINTS)) rationale.push("Life-threatening complaint identified");

    return {
      esiLevel:   1,
      label:      "IMMEDIATE",
      workup:     "FULL",
      engines:    ["scoring", "sepsis", "digital_twin", "cde", "imaging", "specialist_council"],
      rationale,
      fastTrack:  false,
      targetTime: "Immediate",
    };
  }

  // ── ESI 2: High risk ──────────────────────────────────────────────────────
  const highRiskVitals =
    spo2 < 92 ||
    sbp < 90 ||
    sbp > 200 ||
    hr > 130 ||
    hr < 45 ||
    rr > 28 ||
    rr < 8 ||
    temp > 103.1 ||                     // Fahrenheit fever (39.5°C); assume °F
    pain >= 8;

  if (highRiskVitals || matchesAny(allText, ESI2_COMPLAINTS) || input.pregnant) {
    if (spo2 < 92)  rationale.push(`SpO2=${spo2}% — significant hypoxia`);
    if (sbp < 90)   rationale.push(`SBP=${sbp} — hypotension`);
    if (hr > 130)   rationale.push(`HR=${hr} — tachycardia`);
    if (rr > 28)    rationale.push(`RR=${rr} — tachypnea`);
    if (pain >= 8)  rationale.push(`Pain=${pain}/10 — severe`);
    if (input.pregnant) rationale.push("Pregnant patient — high risk category");
    if (matchesAny(allText, ESI2_COMPLAINTS)) rationale.push("High-risk complaint identified");

    return {
      esiLevel:   2,
      label:      "EMERGENT",
      workup:     "FULL",
      engines:    ["scoring", "sepsis", "digital_twin", "cde"],
      rationale,
      fastTrack:  false,
      targetTime: "Within 15 minutes",
    };
  }

  // ── ESI 3: Urgent ─────────────────────────────────────────────────────────
  const moderateRisk =
    spo2 < 95 ||
    sbp < 100 ||
    hr > 100 ||
    rr > 20 ||
    pain >= 5 ||
    input.pediatric ||
    (input.age !== undefined && input.age >= 65);

  if (moderateRisk) {
    if (spo2 < 95)  rationale.push(`SpO2=${spo2}% — mild hypoxia`);
    if (hr > 100)   rationale.push(`HR=${hr} — mild tachycardia`);
    if (pain >= 5)  rationale.push(`Pain=${pain}/10 — moderate`);
    if (input.pediatric) rationale.push("Pediatric patient — standard protocol");
    if (input.age !== undefined && input.age >= 65) rationale.push("Age ≥65 — standard protocol");

    return {
      esiLevel:   3,
      label:      "URGENT",
      workup:     "STANDARD",
      engines:    ["scoring", "sepsis", "cde"],
      rationale,
      fastTrack:  false,
      targetTime: "Within 30 minutes",
    };
  }

  // ── ESI 4/5: Low acuity ───────────────────────────────────────────────────
  if (matchesAny(allText, ESI4_5_COMPLAINTS) || pain <= 3) {
    const isESI5 = pain <= 1 && matchesAny(allText, ESI4_5_COMPLAINTS);
    rationale.push(pain <= 3 ? `Pain=${pain}/10 — mild` : "Low-acuity complaint");
    if (isESI5) rationale.push("Non-urgent — nurse-managed eligible");

    return {
      esiLevel:   isESI5 ? 5 : 4,
      label:      isESI5 ? "NON-URGENT" : "SEMI-URGENT",
      workup:     isESI5 ? "MINIMAL" : "LIGHTWEIGHT",
      engines:    ["scoring"],
      rationale,
      fastTrack:  true,
      targetTime: isESI5 ? "Within 2 hours" : "Within 1 hour",
    };
  }

  // ── Default: ESI 3 ────────────────────────────────────────────────────────
  rationale.push("No specific acuity signals — defaulting to standard protocol");
  return {
    esiLevel:   3,
    label:      "URGENT",
    workup:     "STANDARD",
    engines:    ["scoring", "sepsis", "cde"],
    rationale,
    fastTrack:  false,
    targetTime: "Within 30 minutes",
  };
}

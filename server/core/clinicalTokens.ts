/**
 * Clinical Token System — Core Foundation
 * Centralised decision token that flows through the entire clinical pipeline.
 * Replaces scattered logic with one consistent, auditable data object.
 */

export interface ClinicalTokenSet {
  complaint:              string;

  // Core reasoning
  posterior:              Record<string, number>;  // dx → probability
  redFlags:               string[];
  modifiers:              Record<string, any>;     // fever, tachycardia, etc.

  // Safety tier
  riskLevel:              "low" | "moderate" | "high" | "critical";
  requiresPhysicianReview:boolean;

  // Output control
  allowedDiagnoses:       string[];
  blockedDiagnoses:       string[];

  // Audit
  traceId:                string;

  // Optional metadata
  age?:                   number;
  symptoms?:              string[];
  vitals?:                Record<string, number>;
  patientId?:             string;
}

export function createClinicalTokenSet(input: Partial<ClinicalTokenSet>): ClinicalTokenSet {
  // Infer modifiers from symptoms / vitals when not explicitly set
  const symptoms = input.symptoms ?? [];
  const vitals   = input.vitals   ?? {};
  const modifiers: Record<string, any> = { ...input.modifiers };

  if (!modifiers.fever && (symptoms.includes("fever") || (vitals.tempF && vitals.tempF > 100.4))) {
    modifiers.fever = true;
  }
  if (!modifiers.tachycardia && vitals.hr && vitals.hr > 100) {
    modifiers.tachycardia = true;
  }
  if (!modifiers.hypotension && vitals.systolicBP && vitals.systolicBP < 90) {
    modifiers.hypotension = true;
  }
  if (!modifiers.hypoxia && vitals.spo2 && vitals.spo2 < 92) {
    modifiers.hypoxia = true;
  }

  // Build a minimal posterior from the complaint if none provided
  const posterior = buildInitialPosterior(input);

  return {
    complaint:               input.complaint   ?? "unknown",
    posterior,
    redFlags:                input.redFlags    ?? [],
    modifiers,
    riskLevel:               input.riskLevel   ?? "low",
    requiresPhysicianReview: input.requiresPhysicianReview ?? false,
    allowedDiagnoses:        input.allowedDiagnoses ?? [],
    blockedDiagnoses:        input.blockedDiagnoses ?? [],
    traceId:                 generateTraceId(),
    age:                     input.age,
    symptoms:                symptoms,
    vitals,
    patientId:               input.patientId,
  };
}

function buildInitialPosterior(input: Partial<ClinicalTokenSet>): Record<string, number> {
  if (input.posterior && Object.keys(input.posterior).length > 0) return input.posterior;

  const c = (input.complaint ?? "").toLowerCase();
  const s = (input.symptoms  ?? []).map((x) => x.toLowerCase());
  const all = c + " " + s.join(" ");

  if (all.includes("chest")) {
    return { acs: 0.35, pe: 0.20, gerd: 0.18, musculoskeletal: 0.15, anxiety: 0.12 };
  }
  if (all.includes("fever") || all.includes("sepsis")) {
    return { viral_uri: 0.40, pneumonia: 0.25, sepsis: 0.15, uti: 0.12, strep: 0.08 };
  }
  if (all.includes("dyspnea") || all.includes("shortness of breath")) {
    return { copd_exacerbation: 0.30, pneumonia: 0.28, chf: 0.22, pe: 0.12, anxiety: 0.08 };
  }
  if (all.includes("head")) {
    return { tension_headache: 0.40, migraine: 0.30, viral_uri: 0.20, other: 0.10 };
  }
  return { viral_uri: 0.45, tension_headache: 0.25, anxiety: 0.20, other: 0.10 };
}

export function generateTraceId(): string {
  return "TRACE_" + Date.now() + "_" + Math.random().toString(36).slice(2);
}

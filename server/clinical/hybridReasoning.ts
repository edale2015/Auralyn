import { normalizeDiagnosis } from "../ontology/diagnosisOntology";
import { runDifferential, PRIORS_COUNT } from "./bayesianEngine";

export interface HybridReasoningResult {
  topDiagnosis: string;
  topDiagnosisCanonical?: string;
  topDiagnosisId?: string;
  confidence: number;
  differential: Array<{ dx: string; id?: string; score: number; label?: string }>;
  fusionTriggered: boolean;
  fusionPattern?: string;
  explainability: string;
  reasoningMode: "deterministic_fusion" | "bayesian" | "hybrid";
}

const FUSION_PATTERNS = [
  // ── Shoulder neurovascular emergency — highest priority ───────────────────
  {
    name: "SHOULDER_VASCULAR_EMERGENCY",
    symptoms: ["shoulder pain", "trauma", "no pulse"],
    diagnosis: "S40.011A",
    label: "Shoulder injury with vascular compromise",
    priority: "CRITICAL",
    confidence: 0.97,
  },
  {
    name: "SHOULDER_BRACHIAL_PLEXUS",
    symptoms: ["shoulder pain", "trauma", "no sensation", "hand weakness"],
    diagnosis: "S14.3XXA",
    label: "Brachial plexus injury",
    priority: "CRITICAL",
    confidence: 0.94,
  },
  // ── Shoulder dislocation ──────────────────────────────────────────────────
  {
    name: "SHOULDER_DISLOCATION",
    symptoms: ["shoulder pain", "trauma", "deformity", "arm held at side"],
    diagnosis: "S43.006A",
    label: "Shoulder dislocation",
    priority: "HIGH",
    confidence: 0.89,
  },
  // ── AC joint injury ───────────────────────────────────────────────────────
  {
    name: "AC_JOINT_INJURY",
    symptoms: ["shoulder pain", "trauma", "top of shoulder tender", "step deformity"],
    diagnosis: "S43.506A",
    label: "Acromioclavicular joint injury",
    priority: "MODERATE",
    confidence: 0.84,
  },
  // ── Rotator cuff impingement / tear ──────────────────────────────────────
  {
    name: "ROTATOR_CUFF_PATTERN",
    symptoms: ["shoulder pain", "painful arc", "weakness", "lateral pain"],
    diagnosis: "M75.1",
    label: "Rotator cuff impingement / tear",
    priority: "MODERATE",
    confidence: 0.80,
  },
  // ── Cervical radiculopathy masquerading as shoulder pain ──────────────────
  {
    name: "CERVICAL_RADICULOPATHY",
    symptoms: ["shoulder pain", "neck pain", "tingling", "arm pain"],
    diagnosis: "M54.12",
    label: "Cervical radiculopathy",
    priority: "MODERATE",
    confidence: 0.79,
  },
  // ── Existing patterns ─────────────────────────────────────────────────────
  {
    name: "PE_TRIAD",
    symptoms: ["chest_pain", "shortness_of_breath", "leg_swelling"],
    diagnosis: "I26.9",
    label: "Pulmonary embolism",
    priority: "CRITICAL",
    confidence: 0.92,
  },
  {
    name: "SEPSIS_SYNDROME",
    symptoms: ["fever", "tachycardia", "altered_mental_status"],
    diagnosis: "R65.20",
    label: "Severe sepsis",
    priority: "CRITICAL",
    confidence: 0.88,
  },
  {
    name: "CENTOR_STREP",
    symptoms: ["sore_throat", "fever", "tonsillar_exudate", "no_cough"],
    diagnosis: "J02.0",
    label: "Streptococcal pharyngitis",
    priority: "MODERATE",
    confidence: 0.81,
  },
  {
    name: "FLU_SYNDROME",
    symptoms: ["fever", "myalgia", "headache", "cough"],
    diagnosis: "J11.1",
    label: "Influenza",
    priority: "MODERATE",
    confidence: 0.78,
  },
];

export function multiComplaintFusion(input: {
  symptoms: string[];
  complaint?: string;
}): { diagnosis: string; label: string; priority: string; confidence: number; pattern: string } | null {
  const symptoms = input.symptoms.map((s) => s.toLowerCase().replace(/\s+/g, "_"));

  for (const pattern of FUSION_PATTERNS) {
    const matchCount = pattern.symptoms.filter((s) => symptoms.includes(s)).length;
    const matchRate  = matchCount / pattern.symptoms.length;
    if (matchRate >= 0.75) {
      return {
        diagnosis:  pattern.diagnosis,
        label:      pattern.label,
        priority:   pattern.priority,
        confidence: +(pattern.confidence * matchRate).toFixed(3),
        pattern:    pattern.name,
      };
    }
  }
  return null;
}

export function hybridReasoning(
  input: { symptoms: string[]; complaint?: string; vitals?: any },
  deterministic?: { disposition?: string; topDiagnosis?: string },
): HybridReasoningResult {
  const fusion = multiComplaintFusion(input);

  if (fusion && fusion.confidence >= 0.80) {
    const canonical = normalizeDiagnosis(fusion.diagnosis);
    return {
      topDiagnosis: fusion.label,
      topDiagnosisCanonical: canonical?.label,
      topDiagnosisId: fusion.diagnosis,
      confidence: fusion.confidence,
      differential: [{ dx: fusion.label, id: fusion.diagnosis, score: fusion.confidence }],
      fusionTriggered: true,
      fusionPattern: fusion.pattern,
      reasoningMode: "deterministic_fusion",
      explainability: `Pattern ${fusion.pattern} detected (${input.symptoms.join(", ")}) → ${fusion.label} with ${(fusion.confidence * 100).toFixed(0)}% confidence.`,
    };
  }

  const symptoms = input.symptoms;
  const bayesResult = runDifferential(symptoms);

  const top = bayesResult[0];
  const canonical = normalizeDiagnosis(top?.diagnosis ?? "");

  return {
    topDiagnosis: top?.diagnosis ?? "undifferentiated",
    topDiagnosisCanonical: canonical?.label,
    topDiagnosisId: canonical?.id,
    confidence: top?.posterior ?? 0,
    differential: bayesResult.slice(0, 5).map((d) => ({
      dx: d.diagnosis,
      id: normalizeDiagnosis(d.diagnosis)?.id,
      score: d.posterior,
      label: normalizeDiagnosis(d.diagnosis)?.label,
    })),
    fusionTriggered: fusion !== null,
    fusionPattern: fusion?.pattern,
    reasoningMode: fusion ? "hybrid" : "bayesian",
    explainability: `Bayesian differential: top diagnosis ${top?.diagnosis ?? "N/A"} at ${((top?.posterior ?? 0) * 100).toFixed(0)}% probability from ${symptoms.length} symptom evidence points.`,
  };
}

export function getHybridReasoningStats() {
  return {
    active: true,
    fusionPatterns: FUSION_PATTERNS.length,
    bayesianPriors: PRIORS_COUNT,
    modes: ["deterministic_fusion", "bayesian", "hybrid"],
  };
}

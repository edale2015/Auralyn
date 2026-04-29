/**
 * geometricReasoningIntegrator.ts
 * server/reasoning/geometricReasoningIntegrator.ts
 *
 * Combines the BayesianConfidenceUpdater (metric) and ClinicalKnowledgeGraph
 * (geometry) into a unified reasoning layer that sits between symptom
 * collection and the LLM clinical proposal.
 *
 * Three improvements in one pipeline:
 *   Geometry      → ClinicalKnowledgeGraph (structured symptom relationships)
 *   Metric        → BayesianConfidenceUpdater (incremental belief updating)
 *   Transparency  → EvidencePath tracking ("why the AI said this")
 *
 * Wire-in (server/agent/pipeline.ts, before runClinicalBrain):
 *   const geoResult = await runGeometricReasoning(complaintSlug, answers, opts);
 *   (updated as any).geometricReasoning = geoResult;
 *   // geoResult.promptEnrichment is prepended to the system prompt
 */

import {
  BayesianConfidenceUpdater,
  summarizeEvidencePath,
  type BeliefState,
} from "./bayesianConfidenceUpdater";

import {
  ClinicalKnowledgeGraph,
  type GraphAnalysis,
} from "./clinicalKnowledgeGraph";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeometricReasoningResult {
  beliefState:           BeliefState;
  evidenceSummary:       string;
  graphAnalysis:         GraphAnalysis;
  combinedConfidence:    number;
  combinedDifferential:  Array<{
    diagnosis:      string;
    probability:    number;
    urgency:        string;
    supportedBy:    string[];
    contradictedBy: string[];
  }>;
  redFlagSignals:  string[];
  requiresRedFlag: boolean;
  promptEnrichment: string;
  physicianSummary: string;
}

// ─── Symptom answer normalizer ────────────────────────────────────────────────

const SYMPTOM_MAPPING: Record<string, Record<string, string>> = {
  chest_pain: {
    "radiation_left_arm":  "radiation_left",
    "arm_radiation":       "radiation_left",
    "diaphoresis":         "diaphoresis",
    "sweating":            "diaphoresis",
    "nausea":              "nausea",
    "reproducible":        "reproducible",
    "palpation_worsens":   "reproducible",
    "pleuritic":           "pleuritic",
    "breathing_worsens":   "pleuritic",
    "substernal":          "substernal",
    "crushing":            "substernal",
    "sudden_onset":        "sudden_onset",
    "leg_swelling":        "leg_swelling",
    "recent_surgery":      "recent_immobility",
    "recent_flight":       "recent_immobility",
    "known_cad":           "known_cad",
    "diabetes":            "diabetes",
    "hypertension":        "htn",
    "smoking":             "smoking",
  },
  sore_throat: {
    "fever":              "fever",
    "cough":              "no_cough",
    "exudate":            "exudate",
    "lymphadenopathy":    "lymph",
    "lymph_nodes":        "lymph",
    "trismus":            "trismus",
    "uvula_deviation":    "uvula_dev",
    "splenomegaly":       "splenomeg",
  },
};

function normalizeAnswerToBoolean(value: any): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "yes" || value === "true")  return true;
  if (value === 0 || value === "0" || value === "no"  || value === "false") return false;
  return null;
}

// ─── Main integrator ──────────────────────────────────────────────────────────

export async function runGeometricReasoning(
  complaintSlug: string,
  answers:       Record<string, any>,
  options: {
    patientAge?:       number;
    patientSex?:       string;
    knownMedications?: string[];
    knownConditions?:  string[];
  } = {}
): Promise<GeometricReasoningResult> {

  const updater = new BayesianConfidenceUpdater(complaintSlug);
  const graph   = new ClinicalKnowledgeGraph(complaintSlug);
  const mapping = SYMPTOM_MAPPING[complaintSlug] ?? {};

  for (const [questionId, value] of Object.entries(answers)) {
    const boolValue = normalizeAnswerToBoolean(value);
    if (boolValue === null) continue;

    updater.observe(questionId, boolValue ? "yes" : "no");

    const graphNodeId = mapping[questionId] ?? questionId;

    // Inversion: cough present → no_cough absent
    if (questionId === "cough" && complaintSlug === "sore_throat") {
      graph.addObservation("no_cough", !boolValue, 0.90);
    } else {
      graph.addObservation(graphNodeId, boolValue, 0.90);
    }
  }

  // Demographic risk factors
  if (options.patientAge && options.patientAge > 65) {
    graph.addObservation("age_over_65", true, 0.99);
  }
  if (options.knownConditions) {
    for (const condition of options.knownConditions) {
      const lower = condition.toLowerCase();
      if (lower.includes("diabetes"))                             graph.addObservation("diabetes",  true, 0.99);
      if (lower.includes("hypertension"))                        graph.addObservation("htn",       true, 0.99);
      if (lower.includes("coronary") || lower.includes("cad"))   graph.addObservation("known_cad", true, 0.99);
    }
  }

  const beliefState    = updater.getBeliefState();
  const graphAnalysis  = graph.analyze();
  const evidenceSummary = summarizeEvidencePath(beliefState);

  // Bayesian gets more weight as observations accumulate; graph gets more when clusters activate
  const bayesWeight       = Math.min(0.7, 0.3 + beliefState.observationCount * 0.08);
  const graphWeight       = 1 - bayesWeight;
  const combinedConfidence =
    (beliefState.topDiagnosis?.posterior ?? 0.5) * bayesWeight +
    graphAnalysis.geometricConfidence * graphWeight;

  const combinedDifferential = beliefState.differential.map(hyp => ({
    diagnosis:      hyp.diagnosis,
    probability:    hyp.posterior,
    urgency:        hyp.urgency,
    supportedBy:    graphAnalysis.supportingNodes.map(n => n.label),
    contradictedBy: graphAnalysis.contradictingNodes.map(n => n.label),
  }));

  const redFlagSignals: string[] = [
    ...graphAnalysis.redFlagPaths.map(p => p.path.join(" → ")),
  ];
  if (
    beliefState.topDiagnosis?.urgency === "emergent" &&
    beliefState.topDiagnosis.posterior > 0.25
  ) {
    redFlagSignals.push(
      `Emergent diagnosis in differential: ${beliefState.topDiagnosis.diagnosis} (${Math.round(beliefState.topDiagnosis.posterior * 100)}%)`
    );
  }

  const requiresRedFlag = redFlagSignals.length > 0;

  // ── Prompt enrichment block ────────────────────────────────────────────────
  const clusterText = graphAnalysis.activatedClusters.length > 0
    ? `ACTIVATED CLINICAL PATTERNS:\n${graphAnalysis.activatedClusters.map(c =>
        `  • ${c.name} (${Math.round((c.activationScore ?? 0) * 100)}% node activation) → ${c.targetDx}`
      ).join("\n")}`
    : "No clinical clusters fully activated";

  const redFlagText = requiresRedFlag
    ? `⚠️ RED FLAG SIGNALS DETECTED:\n${redFlagSignals.map(s => `  • ${s}`).join("\n")}`
    : "No red flag signals";

  const missingText = graphAnalysis.missingKeyFindings.length > 0
    ? `KEY MISSING FINDINGS (ask if possible):\n${graphAnalysis.missingKeyFindings.map(f => `  • ${f}`).join("\n")}`
    : "";

  const promptEnrichment = `
## GEOMETRIC REASONING PRE-ANALYSIS (Inject before clinical differential)

### Bayesian Belief State (${beliefState.observationCount} observations processed)
${beliefState.differential.slice(0, 4).map(h =>
  `  ${h.diagnosis}: ${Math.round(h.posterior * 100)}% [${h.urgency}]`
).join("\n")}
Uncertainty: ${Math.round(beliefState.uncertainty * 100)}% | Entropy: ${beliefState.entropyBits.toFixed(2)} bits

### Evidence Path (what drove the differential)
${evidenceSummary}

### Clinical Knowledge Graph Analysis
${clusterText}
${redFlagText}
${missingText}
Clinical Pattern: ${graphAnalysis.clinicalPattern}

### Combined Confidence Signal
Bayesian: ${Math.round((beliefState.topDiagnosis?.posterior ?? 0) * 100)}% | Graph: ${Math.round(graphAnalysis.geometricConfidence * 100)}% | Combined: ${Math.round(combinedConfidence * 100)}%

INSTRUCTION: Use this pre-analysis to inform your differential. Do not override red flag signals. Explain any significant deviation from the Bayesian differential.
`.trim();

  // ── Physician-facing summary ───────────────────────────────────────────────
  const physicianSummary = [
    `**Geometric Analysis** (${beliefState.observationCount} findings processed)`,
    `Top: ${beliefState.topDiagnosis?.diagnosis} — ${Math.round(combinedConfidence * 100)}% confidence`,
    graphAnalysis.activatedClusters.length > 0
      ? `Pattern: ${graphAnalysis.activatedClusters[0].name}`
      : "",
    requiresRedFlag ? `⚠️ Red flags: ${redFlagSignals.join("; ")}` : "",
    `Certainty: ${beliefState.uncertainty < 0.3 ? "High" : beliefState.uncertainty < 0.6 ? "Moderate" : "Low"}`,
    graphAnalysis.missingKeyFindings.length > 0
      ? `Consider asking: ${graphAnalysis.missingKeyFindings[0]}`
      : "",
  ].filter(Boolean).join("\n");

  return {
    beliefState,
    evidenceSummary,
    graphAnalysis,
    combinedConfidence,
    combinedDifferential,
    redFlagSignals,
    requiresRedFlag,
    promptEnrichment,
    physicianSummary,
  };
}

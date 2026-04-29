/**
 * geometricReasoningIntegrator.ts
 * Drop into: server/reasoning/geometricReasoningIntegrator.ts
 *
 * Combines the BayesianConfidenceUpdater (metric) and ClinicalKnowledgeGraph
 * (geometry) into a unified reasoning layer that sits between symptom
 * collection and the LLM clinical proposal.
 *
 * THE THREE IMPROVEMENTS IN ONE PIPELINE:
 *   Geometry   → ClinicalKnowledgeGraph (structured symptom relationships)
 *   Metric     → BayesianConfidenceUpdater (incremental belief updating)
 *   Probabilistic reasoning → EvidencePath tracking (transparent reasoning)
 *
 * HOW TO WIRE INTO EXISTING PIPELINE:
 *   In server/agent/pipeline.ts, before runClinicalBrain():
 *
 *   const geoResult = await runGeometricReasoning(
 *     caseDoc.complaint?.slug,
 *     caseDoc.answers?.structured ?? {},
 *   );
 *   // Attach to state for LLM context injection:
 *   state.geometricReasoning = geoResult;
 *
 *   Then in your LLM system prompt, add geoResult.promptEnrichment
 *   BEFORE the main clinical reasoning request.
 *
 * WHAT THIS GIVES THE LLM:
 *   Instead of: "Patient has chest pain and diaphoresis"
 *   The LLM receives:
 *     "Bayesian analysis (3 observations): ACS 67%, MSK 22%, GERD 11%
 *      Geometry: Classic ACS cluster ACTIVATED (2/4 nodes)
 *      Evidence path: radiation_left (LR 2.8, high gain) + diaphoresis (LR 2.3)
 *      Red flag: ACS Red Flag triggered by radiation_left
 *      Missing key finding: reproducible_palpation (would discriminate MSK vs ACS)
 *      Uncertainty: 34% — moderate confidence, physician judgment essential"
 *
 * PHYSICIAN-FACING OUTPUT:
 *   The evidence path summary surfaces in the CDS sidebar as
 *   "Why the AI said this" — making reasoning transparent and auditable.
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
  // Bayesian belief state
  beliefState:       BeliefState;
  evidenceSummary:   string;

  // Graph analysis
  graphAnalysis:     GraphAnalysis;

  // Combined output
  combinedConfidence: number;   // weighted combination of Bayesian + geometric
  combinedDifferential: Array<{
    diagnosis:    string;
    probability:  number;
    urgency:      string;
    supportedBy:  string[];
    contradictedBy: string[];
  }>;

  // Red flag signals (from both systems)
  redFlagSignals:   string[];
  requiresRedFlag:  boolean;

  // Prompt enrichment block for LLM injection
  promptEnrichment: string;

  // For physician CDS display
  physicianSummary: string;
}

// ─── Symptom answer normalizer ────────────────────────────────────────────────
// Maps KB question IDs (Q_IDs) to graph node IDs and normalizes values

const SYMPTOM_MAPPING: Record<string, Record<string, string>> = {
  // Chest pain mappings
  chest_pain: {
    "radiation_left_arm":    "radiation_left",
    "arm_radiation":         "radiation_left",
    "diaphoresis":           "diaphoresis",
    "sweating":              "diaphoresis",
    "nausea":                "nausea",
    "reproducible":          "reproducible",
    "palpation_worsens":     "reproducible",
    "pleuritic":             "pleuritic",
    "breathing_worsens":     "pleuritic",
    "substernal":            "substernal",
    "crushing":              "substernal",
    "sudden_onset":          "sudden_onset",
    "leg_swelling":          "leg_swelling",
    "recent_surgery":        "recent_immobility",
    "recent_flight":         "recent_immobility",
    "known_cad":             "known_cad",
    "diabetes":              "diabetes",
    "hypertension":          "htn",
    "smoking":               "smoking",
  },
  // Sore throat mappings
  sore_throat: {
    "fever":              "fever",
    "cough":              "no_cough",   // inverted — cough present = no_cough absent
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
  if (value === 1 || value === "1" || value === "yes" || value === "true") return true;
  if (value === 0 || value === "0" || value === "no"  || value === "false") return false;
  return null;
}

// ─── Main integrator ──────────────────────────────────────────────────────────

export async function runGeometricReasoning(
  complaintSlug: string,
  answers:       Record<string, any>,
  options: {
    patientAge?:         number;
    patientSex?:         string;
    knownMedications?:   string[];
    knownConditions?:    string[];
  } = {}
): Promise<GeometricReasoningResult> {

  // Initialize both systems
  const updater = new BayesianConfidenceUpdater(complaintSlug);
  const graph   = new ClinicalKnowledgeGraph(complaintSlug);

  const mapping = SYMPTOM_MAPPING[complaintSlug] ?? {};

  // Process each symptom answer through both systems
  for (const [questionId, value] of Object.entries(answers)) {
    const boolValue = normalizeAnswerToBoolean(value);
    if (boolValue === null) continue;

    // Bayesian updater — uses likelihood ratio tables
    updater.observe(questionId, boolValue ? "yes" : "no");

    // Graph — uses structured node relationships
    const graphNodeId = mapping[questionId] ?? questionId;

    // Handle inversion (e.g., "cough: yes" → "no_cough: false")
    if (questionId === "cough" && complaintSlug === "sore_throat") {
      graph.addObservation("no_cough", !boolValue, 0.90);
    } else {
      graph.addObservation(graphNodeId, boolValue, 0.90);
    }
  }

  // Add demographic risk factors to graph
  if (options.patientAge && options.patientAge > 65) {
    graph.addObservation("age_over_65", true, 0.99);
  }
  if (options.knownConditions) {
    for (const condition of options.knownConditions) {
      const lower = condition.toLowerCase();
      if (lower.includes("diabetes"))      graph.addObservation("diabetes", true, 0.99);
      if (lower.includes("hypertension"))  graph.addObservation("htn",      true, 0.99);
      if (lower.includes("coronary") || lower.includes("cad")) {
        graph.addObservation("known_cad", true, 0.99);
      }
    }
  }

  // Get results from both systems
  const beliefState   = updater.getBeliefState();
  const graphAnalysis = graph.analyze();
  const evidenceSummary = summarizeEvidencePath(beliefState);

  // Combine confidences (weighted average)
  // Bayesian gets more weight when more observations, graph gets more weight when clusters activate
  const bayesWeight    = Math.min(0.7, 0.3 + beliefState.observationCount * 0.08);
  const graphWeight    = 1 - bayesWeight;
  const combinedConfidence =
    (beliefState.topDiagnosis?.posterior ?? 0.5) * bayesWeight +
    graphAnalysis.geometricConfidence * graphWeight;

  // Build combined differential
  const combinedDifferential = beliefState.differential.map(hyp => ({
    diagnosis:      hyp.diagnosis,
    probability:    hyp.posterior,
    urgency:        hyp.urgency,
    supportedBy:    graphAnalysis.supportingNodes.map(n => n.label),
    contradictedBy: graphAnalysis.contradictingNodes.map(n => n.label),
  }));

  // Collect red flag signals from both systems
  const redFlagSignals: string[] = [
    ...graphAnalysis.redFlagPaths.map(p => p.path.join(" → ")),
  ];

  // Check if top Bayesian diagnosis is emergent
  if (beliefState.topDiagnosis?.urgency === "emergent" &&
      beliefState.topDiagnosis.posterior > 0.25) {
    redFlagSignals.push(`Emergent diagnosis in differential: ${beliefState.topDiagnosis.diagnosis} (${Math.round(beliefState.topDiagnosis.posterior * 100)}%)`);
  }

  const requiresRedFlag = redFlagSignals.length > 0;

  // ── Build prompt enrichment block ────────────────────────────────────────
  const clusterText = graphAnalysis.activatedClusters.length > 0
    ? `ACTIVATED CLINICAL PATTERNS:\n${graphAnalysis.activatedClusters.map(c => `  • ${c.name} (${Math.round((c.activationScore ?? 0) * 100)}% node activation) → ${c.targetDx}`).join("\n")}`
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
${missingText ? missingText : ""}
Clinical Pattern: ${graphAnalysis.clinicalPattern}

### Combined Confidence Signal
Bayesian: ${Math.round((beliefState.topDiagnosis?.posterior ?? 0) * 100)}% | Graph: ${Math.round(graphAnalysis.geometricConfidence * 100)}% | Combined: ${Math.round(combinedConfidence * 100)}%

INSTRUCTION: Use this pre-analysis to inform your differential. Do not override red flag signals. Explain any significant deviation from the Bayesian differential.
`.trim();

  // ── Physician-facing summary ─────────────────────────────────────────────
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

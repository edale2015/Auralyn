/**
 * bestOfN.ts — Parallel model comparison (Best-of-N)
 *
 * Article: "/best-of-n — type /best-of-n sonnet, gpt, composer fix the flaky logout test
 *  and Cursor spins up three separate worktrees, runs the same prompt across Sonnet, GPT,
 *  and Composer simultaneously, then surfaces a parent agent that compares all three outputs."
 *
 * Article: "You see the results side by side in Agent Tabs. The parent agent provides
 *  commentary on the differences and can merge the best parts of each implementation."
 *
 * Clinical application:
 *   Given a patient presentation, run the same clinical question across multiple
 *   models. Each model brings different training strengths. The meta-agent then:
 *     1. Identifies where models agree (high confidence)
 *     2. Flags where they disagree (needs physician review)
 *     3. Produces a merged recommendation that favors safety (conservative)
 *
 * Available models (AI mode):
 *   - gpt-4o          — best general reasoning
 *   - gpt-4o-mini     — fast, good for structured extraction
 *   - gpt-4-turbo     — large context, detailed reasoning
 *
 * Keyword mode: falls back to heuristic agents when AI unavailable
 */

import { runAgentFleet, aggregateFleetResults, type AgentTask, type AgentFleetResult, type AgentOutput } from "./agentFleetOrchestrator";
import { saveArtifact } from "../artifacts/artifactStore";
import crypto from "crypto";

// ── Available model configs ───────────────────────────────────────────────────

export const CLINICAL_MODELS = {
  standard: ["gpt-4o", "gpt-4o-mini"],
  extended: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  single:   ["gpt-4o"],
} as const;

// ── Clinical role assignments per model ───────────────────────────────────────
// Each model gets a different clinical lens to encourage diverse perspectives

const MODEL_ROLES: Record<string, string> = {
  "gpt-4o":       "Emergency Medicine attending physician with sepsis protocol expertise",
  "gpt-4o-mini":  "ICU intensivist focused on severity scoring and organ failure",
  "gpt-4-turbo":  "Infectious disease specialist with antimicrobial stewardship focus",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type BestOfNTaskType = "diagnosis" | "triage" | "treatment" | "risk_score" | "disposition";

export interface BestOfNInput {
  taskType:    BestOfNTaskType;
  clinicalData: Record<string, unknown>;
  models?:     string[];                // defaults to CLINICAL_MODELS.standard
  patientId?:  string;
  saveResult?: boolean;
}

export interface ModelComparison {
  model:      string;
  role:       string;
  output:     AgentOutput;
  durationMs: number;
}

export interface BestOfNResult {
  runId:        string;
  models:       ModelComparison[];
  consensus:    ReturnType<typeof aggregateFleetResults>;
  metaAnalysis: MetaAnalysis;
  winner:       ModelComparison;        // highest-confidence non-erring model
  durationMs:   number;
  artifactId?:  string;
}

export interface MetaAnalysis {
  agreement:      "full" | "partial" | "divergent";
  divergenceAreas: string[];           // where models disagreed
  safetyFlag:     boolean;             // true if any model flagged HIGH/CRITICAL
  mergedRecommendation: string;
  confidenceRange: [number, number];
}

// ── Meta-analysis ─────────────────────────────────────────────────────────────

function analyzeComparisons(comparisons: ModelComparison[]): MetaAnalysis {
  if (comparisons.length === 0) {
    return { agreement: "divergent", divergenceAreas: [], safetyFlag: false, mergedRecommendation: "No results", confidenceRange: [0, 0] };
  }

  const topDxPerModel = comparisons.map((c) => c.output.diagnosis?.[0] ?? "Unknown");
  const uniqueTopDx   = new Set(topDxPerModel);
  const riskLevels    = comparisons.map((c) => c.output.riskLevel ?? "LOW");
  const safetyFlag    = riskLevels.some((r) => r === "HIGH" || r === "CRITICAL");

  let agreement: "full" | "partial" | "divergent";
  if (uniqueTopDx.size === 1)                             agreement = "full";
  else if (uniqueTopDx.size <= Math.ceil(comparisons.length * 0.6)) agreement = "partial";
  else                                                    agreement = "divergent";

  // Identify divergence areas (diagnoses only one model flagged)
  const dxCounts: Record<string, number> = {};
  for (const c of comparisons) {
    for (const dx of c.output.diagnosis ?? []) {
      dxCounts[dx] = (dxCounts[dx] ?? 0) + 1;
    }
  }
  const divergenceAreas = Object.entries(dxCounts)
    .filter(([, n]) => n === 1)
    .map(([dx]) => dx)
    .slice(0, 3);

  // Merged recommendation: from highest-confidence model, bias toward safety
  const byConfidence = [...comparisons].sort((a, b) => b.output.confidence - a.output.confidence);
  const highestRisk  = comparisons.find((c) => c.output.riskLevel === "CRITICAL" || c.output.riskLevel === "HIGH");
  const source       = highestRisk ?? byConfidence[0];
  const mergedRecommendation = source.output.recommendations?.[0]
    ?? source.output.reasoning?.[0]
    ?? "Physician review required";

  const confidences  = comparisons.map((c) => c.output.confidence);
  return {
    agreement,
    divergenceAreas,
    safetyFlag,
    mergedRecommendation,
    confidenceRange: [Math.min(...confidences), Math.max(...confidences)],
  };
}

// ── Main best-of-N ────────────────────────────────────────────────────────────

export async function bestOfN(input: BestOfNInput): Promise<BestOfNResult> {
  const runId  = `bon_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const start  = Date.now();
  const models = input.models ?? CLINICAL_MODELS.standard;

  // Build one task per model, same input, different role framing
  const tasks: AgentTask[] = models.map((model) => ({
    id:    `${runId}_${model.replace(/[^a-z0-9]/g, "_")}`,
    type:  input.taskType,
    input: input.clinicalData,
    model,
    role:  MODEL_ROLES[model] ?? "Clinical decision support agent",
  }));

  // Run all models in parallel via fleet
  const fleet: AgentFleetResult = await runAgentFleet(tasks, {
    saveArtifactOnComplete: false,
    patientId: input.patientId,
  });

  // Build comparison array
  const comparisons: ModelComparison[] = fleet.tasks.map((t) => ({
    model:      t.model,
    role:       t.role,
    output:     t.output,
    durationMs: t.durationMs,
  }));

  const metaAnalysis = analyzeComparisons(comparisons);
  const consensus    = aggregateFleetResults(fleet.tasks);

  // Winner = highest confidence, no error
  const winner = comparisons
    .filter((c) => !fleet.tasks.find((t) => t.model === c.model && t.error))
    .sort((a, b) => b.output.confidence - a.output.confidence)[0]
    ?? comparisons[0];

  const result: BestOfNResult = {
    runId,
    models:      comparisons,
    consensus,
    metaAnalysis,
    winner,
    durationMs:  Date.now() - start,
  };

  // Persist artifact
  if (input.saveResult !== false) {
    try {
      const artifact = await saveArtifact({
        type:      "best_of_n_result",
        content:   result,
        agentId:   runId,
        patientId: input.patientId,
        metadata:  { models, taskType: input.taskType, agreement: metaAnalysis.agreement },
      });
      result.artifactId = artifact.id;
    } catch {
      // Non-fatal
    }
  }

  return result;
}

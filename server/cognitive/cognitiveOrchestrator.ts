/**
 * Cognitive Brain Orchestrator — the central reasoning engine.
 *
 * Pipeline:
 *   1. Clinical Monologue (pre-decision internal reasoning)
 *   2. Base Clinical Workflow (existing 8-step Bayesian engine)
 *   3. Multi-Specialist Debate Council
 *   4. Strategy Selection
 *   5. Bias Suppression
 *   6. Disposition Engine
 *   7. Patient Communication
 *   8. Memory Write + Case Persistence
 */

import { generateClinicalMonologue } from "./monologueEngine";
import { runSpecialistDebate }       from "./debateCouncil";
import { selectStrategy }            from "./strategyEngine";
import { applyBiasGuards }           from "./biasEngine";
import { computeDisposition }        from "./dispositionEngine";
import { generatePatientMessage }    from "./communicationEngine";
import { writeToMemoryGraph }        from "./memoryGraph";
import { persistCognitiveCase }      from "./caseStore";
import { runClinicalWorkflow }       from "../workflows/clinicalWorkflowEngine";

export interface CognitiveInput {
  patientId?:  string;
  symptoms?:   string[] | Record<string, boolean>;
  vitals?:     Record<string, number>;
  redFlags?:   boolean | string[];
  complaint?:  string;
  [key: string]: unknown;
}

export interface CognitiveResult {
  caseId:       string;
  diagnosis:    string;
  disposition:  string;
  confidence:   number;
  strategy:     string;
  urgencyScore: number;
  patientMessage: ReturnType<typeof generatePatientMessage>;
  reasoning: {
    monologue:   Record<string, unknown>;
    debate:      Record<string, unknown>;
    safePlan:    Record<string, unknown>;
  };
  durationMs: number;
}

export async function runCognitiveBrain(caseData: CognitiveInput): Promise<CognitiveResult> {
  const start = Date.now();

  // ── Step 1: Internal Monologue ─────────────────────────────────────────────
  const monologue = await generateClinicalMonologue(caseData);

  // ── Step 2: Bayesian Clinical Workflow (existing 8-step engine) ────────────
  let bayesianResult: any = {};
  try {
    const complaint = Array.isArray(caseData.symptoms)
      ? caseData.symptoms[0]
      : caseData.complaint ?? "general";
    bayesianResult = await runClinicalWorkflow({
      patientId: caseData.patientId ?? `cog-${Date.now()}`,
      complaint,
      vitals:   caseData.vitals,
      symptoms: typeof caseData.symptoms === "object" && !Array.isArray(caseData.symptoms)
        ? caseData.symptoms
        : undefined,
    } as any);
  } catch {
    bayesianResult = { diagnosis: "Unable to process", disposition: "FOLLOW_UP", confidence: 0.3 };
  }

  // ── Step 3: Multi-Specialist Debate ────────────────────────────────────────
  const debate = await runSpecialistDebate(
    { ...caseData, bayesianDiagnosis: bayesianResult.diagnosis },
    bayesianResult
  );

  // ── Step 4: Strategy Selection ─────────────────────────────────────────────
  const strategy = selectStrategy(monologue, debate);

  // ── Step 5: Bias Suppression ───────────────────────────────────────────────
  const safePlan = applyBiasGuards({ plan: debate, monologue });

  // ── Step 6: Disposition ────────────────────────────────────────────────────
  const dispositionResult = computeDisposition({
    confidence:   debate.confidence,
    uncertainty:  monologue.uncertainty_level,
    disagreement: debate.disagreementScore,
    redFlags:     caseData.redFlags,
  });

  // ── Step 7: Patient Communication ─────────────────────────────────────────
  const patientMessage = generatePatientMessage({
    disposition: dispositionResult.disposition,
    strategy,
    diagnosis:   safePlan.final_diagnosis,
  });

  // ── Step 8: Memory + Persistence ──────────────────────────────────────────
  await writeToMemoryGraph(caseData as any, { final_diagnosis: safePlan.final_diagnosis });

  const cogCase = persistCognitiveCase({
    input:       caseData as Record<string, unknown>,
    diagnosis:   safePlan.final_diagnosis,
    disposition: dispositionResult.disposition,
    confidence:  debate.confidence,
    strategy,
    reasoning: {
      monologue: monologue as any,
      debate:    debate    as any,
    },
    patientMessage,
    durationMs: Date.now() - start,
  });

  return {
    caseId:       cogCase.id,
    diagnosis:    safePlan.final_diagnosis,
    disposition:  dispositionResult.disposition,
    confidence:   debate.confidence,
    strategy,
    urgencyScore: dispositionResult.urgencyScore,
    patientMessage,
    reasoning: {
      monologue: monologue as any,
      debate:    debate    as any,
      safePlan:  safePlan  as any,
    },
    durationMs: cogCase.durationMs,
  };
}

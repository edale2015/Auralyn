/**
 * Sequential Clinical Reasoner
 * Step-by-step clinical reasoning engine — a safer, traceable alternative
 * to "think in one shot." Integrates with the existing Cognitive Brain.
 */

import { runCognitiveBrain } from "../cognitive/cognitiveOrchestrator";

export interface ReasoningStep {
  step:      string;
  status:    "ok" | "override" | "skipped";
  data:      unknown;
  durationMs:number;
}

export interface ReasoningResult {
  diagnosis?:  string;
  disposition: string;
  confidence?: number;
  reasoning:   ReasoningStep[];
  totalMs:     number;
  caseId?:     string;
}

interface PatientInput {
  patientId?:  string;
  complaint?:  string;
  symptoms?:   string[] | Record<string, boolean>;
  vitals?:     Record<string, number>;
  redFlags?:   boolean | string[];
  age?:        number;
  pmh?:        string[];
  meds?:       string[];
  [key: string]: unknown;
}

export class SequentialClinicalReasoner {
  async run(patientData: PatientInput): Promise<ReasoningResult> {
    const start   = Date.now();
    const steps:   ReasoningStep[] = [];

    const s = <T>(label: string, fn: () => T, status: "ok" | "override" | "skipped" = "ok"): T => {
      const t0   = Date.now();
      const data = fn();
      steps.push({ step: label, status, data, durationMs: Date.now() - t0 });
      return data;
    };

    // ── Step 1: Normalise input ────────────────────────────────────────────────
    const normalized = s("Normalize Input", () => ({
      symptoms:  Array.isArray(patientData.symptoms)
        ? patientData.symptoms
        : Object.keys(patientData.symptoms ?? {}).filter((k) => (patientData.symptoms as any)?.[k]),
      vitals:    patientData.vitals ?? {},
      complaint: patientData.complaint ?? "general",
      patientId: patientData.patientId ?? `seq-${Date.now()}`,
    }));

    // ── Step 2: Clinical modifiers ────────────────────────────────────────────
    const modifiers = s("Apply Modifiers", () => ({
      age:         patientData.age,
      pmh:         patientData.pmh ?? [],
      meds:        patientData.meds ?? [],
      riskProfile: (patientData.age ?? 0) > 65 ? "elevated" : "standard",
    }));

    // ── Step 3: Red flag override (safety gate) ──────────────────────────────
    const redFlags = Array.isArray(patientData.redFlags)
      ? patientData.redFlags
      : patientData.redFlags === true ? ["physician_flagged"] : [];

    if (redFlags.length > 0) {
      s("RED FLAG OVERRIDE", () => ({ redFlags, action: "immediate_escalation" }), "override");
      steps.push({
        step:       "Short-circuit: RED FLAG DISPOSITION",
        status:     "override",
        data:       { disposition: "ED", reason: "Red flag criteria met" },
        durationMs: 0,
      });
      return {
        disposition: "ED",
        reasoning:   steps,
        totalMs:     Date.now() - start,
      };
    }

    // ── Step 4: Cognitive Brain (full 8-step pipeline) ────────────────────────
    let cogResult: any;
    try {
      cogResult = await runCognitiveBrain({ ...patientData, symptoms: normalized.symptoms });
      s("Cognitive Brain (Bayesian + Debate + Bias)", () => ({
        diagnosis:   cogResult.diagnosis,
        disposition: cogResult.disposition,
        confidence:  cogResult.confidence,
        strategy:    cogResult.strategy,
      }));
    } catch (err) {
      s("Cognitive Brain (FAILED — fallback)", () => ({ error: String(err) }), "skipped");
      cogResult = { diagnosis: "Undetermined", disposition: "FOLLOW_UP", confidence: 0.3 };
    }

    // ── Step 5: Modifier adjustment ──────────────────────────────────────────
    s("Modifier Adjustment", () => {
      const bump = modifiers.riskProfile === "elevated" ? "Elevated-risk patient — flagging for PCP loop-back" : "No modifier adjustment";
      return { note: bump, originalDisposition: cogResult.disposition };
    });

    // ── Step 6: Final decision ────────────────────────────────────────────────
    const finalDx = s("Final Decision", () => ({
      diagnosis:   cogResult.diagnosis,
      disposition: cogResult.disposition,
      confidence:  cogResult.confidence,
      caseId:      cogResult.caseId,
    }));

    return {
      diagnosis:   finalDx.diagnosis,
      disposition: finalDx.disposition,
      confidence:  finalDx.confidence,
      caseId:      cogResult.caseId,
      reasoning:   steps,
      totalMs:     Date.now() - start,
    };
  }
}

export const sequentialReasoner = new SequentialClinicalReasoner();

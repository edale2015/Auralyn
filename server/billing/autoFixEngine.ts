import type { DenialPrediction } from "./denialPredictionEngine";
import type { AutoCodeResult } from "./diagnosisAutoCoder";

export interface AutoFixResult {
  applied: boolean;
  fixes: string[];
  originalCpt: string;
  finalCpt: string;
  originalIcd: string;
  finalIcd: string;
  reductionEstimate: number;
}

export function autoFixEncounter(
  coding: AutoCodeResult,
  denial: DenialPrediction,
  encounter: { triage: string; confidence?: number }
): AutoFixResult {
  const fixes: string[] = [];
  let cptCode = coding.cpt.code;
  let icdCode = coding.primary.icd10;
  const originalCpt = cptCode;
  const originalIcd = icdCode;

  const triage = encounter.triage.toLowerCase().trim();

  for (const reason of denial.reasons) {
    if (reason.includes("CPT level too high") || reason.includes("CPT 99215 (high complexity) assigned to routine")) {
      if (cptCode === "99215") {
        cptCode = "99214";
        fixes.push("Downcoded CPT 99215 → 99214 (routine triage does not support high complexity)");
      }
    }

    if (reason.includes("CPT 99213 (low complexity) assigned to ER")) {
      if (cptCode === "99213" && (triage === "er" || triage === "emergency")) {
        cptCode = "99284";
        fixes.push("Upcoded CPT 99213 → 99284 (ER visit requires higher E/M level)");
      }
    }

    if (reason.includes("upcoding risk") && (encounter.confidence ?? 1) < 0.5) {
      if (cptCode === "99285") {
        cptCode = "99284";
        fixes.push("Downcoded CPT 99285 → 99284 (low confidence does not support highest ED level)");
      } else if (cptCode === "99284") {
        cptCode = "99213";
        fixes.push("Downcoded CPT 99284 → 99213 (low confidence — conservative coding applied)");
      }
    }
  }

  const reductionEstimate = fixes.length > 0
    ? Math.min(denial.riskScore * 0.4, 0.3)
    : 0;

  return {
    applied: fixes.length > 0,
    fixes,
    originalCpt,
    finalCpt: cptCode,
    originalIcd: icdCode,
    finalIcd: icdCode,
    reductionEstimate,
  };
}

import { runFullClinicalFlow } from "../orchestrator/clinicalOrchestrator";

export interface ValidationCase {
  input: Record<string, any>;
  actual: string;
}

export interface ValidationResult {
  input: Record<string, any>;
  predicted: string | null;
  actual: string;
  correct: boolean;
  safety: string;
  confidence: number;
}

export async function runValidation(dataset: ValidationCase[]): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  for (const caseData of dataset) {
    try {
      const res = await runFullClinicalFlow(caseData.input as any);
      const predicted =
        (res as any)?.scores?.primaryDiagnosis ??
        (res as any)?.diagnosis?.primary ??
        null;

      const safety: string = (res as any)?.safety?.level ?? (res as any)?.safetyLevel ?? "UNKNOWN";
      const confidence: number = (res as any)?.diagnosis?.confidence ?? (res as any)?.scores?.confidence ?? 0;

      results.push({
        input: caseData.input,
        predicted,
        actual: caseData.actual,
        correct: predicted?.toLowerCase() === caseData.actual?.toLowerCase(),
        safety,
        confidence,
      });
    } catch {
      results.push({
        input: caseData.input,
        predicted: null,
        actual: caseData.actual,
        correct: false,
        safety: "UNKNOWN",
        confidence: 0,
      });
    }
  }

  return results;
}

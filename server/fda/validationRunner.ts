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

      results.push({
        input: caseData.input,
        predicted,
        actual: caseData.actual,
        correct: predicted?.toLowerCase() === caseData.actual?.toLowerCase(),
      });
    } catch {
      results.push({
        input: caseData.input,
        predicted: null,
        actual: caseData.actual,
        correct: false,
      });
    }
  }

  return results;
}

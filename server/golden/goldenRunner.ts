import { GOLDEN_CASES, type GoldenCase } from "./goldenCases";
import { runFullClinicalFlow } from "../orchestrator/clinicalOrchestrator";
import { runSafetyGuard } from "../safety/safetyGuard";

export interface GoldenResult {
  caseId: string;
  description: string;
  passed: boolean;
  blocked: boolean;
  expectedBlock: boolean;
  matchedKeywords: string[];
  missingKeywords: string[];
  latencyMs: number;
  error?: string;
  rawOutput?: any;
}

export async function runGoldenCase(gc: GoldenCase): Promise<GoldenResult> {
  const start = Date.now();
  try {
    const result = await runFullClinicalFlow({
      patientId: `golden-${gc.id}`,
      complaint: gc.input.complaint,
      answers: gc.input.answers,
    });

    const latencyMs = Date.now() - start;
    const outputText = JSON.stringify(result).toLowerCase();
    const matchedKeywords = gc.expectedKeywords.filter(k => outputText.includes(k.toLowerCase()));
    const missingKeywords = gc.expectedKeywords.filter(k => !outputText.includes(k.toLowerCase()));

    const safety = runSafetyGuard(result);
    const blocked = !safety.allowed || result.blocked === true;

    let passed = true;
    if (gc.mustBlock && !blocked)  passed = false;
    if (gc.mustNotBlock && blocked) passed = false;
    if (gc.expectedKeywords.length > 0 && matchedKeywords.length === 0) passed = false;

    return {
      caseId: gc.id,
      description: gc.description,
      passed,
      blocked,
      expectedBlock: !!gc.mustBlock,
      matchedKeywords,
      missingKeywords,
      latencyMs,
      rawOutput: { success: result.success, blocked: result.blocked, complaint: result.complaint },
    };
  } catch (err: any) {
    return {
      caseId: gc.id,
      description: gc.description,
      passed: false,
      blocked: false,
      expectedBlock: !!gc.mustBlock,
      matchedKeywords: [],
      missingKeywords: gc.expectedKeywords,
      latencyMs: Date.now() - start,
      error: err?.message ?? String(err),
    };
  }
}

export async function runAllGoldenCases(): Promise<GoldenResult[]> {
  const results: GoldenResult[] = [];
  for (const gc of GOLDEN_CASES) {
    results.push(await runGoldenCase(gc));
  }
  return results;
}

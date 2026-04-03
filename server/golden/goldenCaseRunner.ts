import { listActiveGoldenCases, persistRunResults } from "./goldenCaseRepository";
import { buildCoverageMatrix } from "./goldenCaseExpansion";
import { type GoldenCaseResult, type GoldenCaseBatchResult } from "./types";
import { logger } from "../utils/logger";

const SYSTEM_VERSION = process.env.npm_package_version ?? "1.0.0";
const ENGINE_VERSION = "2.0.0";

async function runSingleCase(gc: {
  caseId: string;
  complaint: string;
  expectedDiagnosis: string;
  expectedDisposition: string;
  expectedRedFlags: string[];
  structuredInputs: Record<string, unknown>;
}): Promise<GoldenCaseResult> {
  try {
    const { runSystem } = await import("../brain/fullLoop");
    const result = await runSystem({
      complaint: gc.complaint,
      answers: gc.structuredInputs as any,
      sessionId: `golden_${gc.caseId}`,
    });

    const actual = {
      diagnosis: result?.assessment?.primaryDiagnosis ?? result?.primaryDiagnosis,
      disposition: result?.assessment?.disposition ?? result?.disposition,
      redFlags: result?.assessment?.redFlags ?? result?.redFlags ?? [],
    };

    const failReasons: string[] = [];
    let score = 1.0;

    if (actual.diagnosis !== gc.expectedDiagnosis) {
      failReasons.push(`diagnosis mismatch: expected "${gc.expectedDiagnosis}", got "${actual.diagnosis}"`);
      score -= 0.4;
    }
    if (actual.disposition !== gc.expectedDisposition) {
      failReasons.push(`disposition mismatch: expected "${gc.expectedDisposition}", got "${actual.disposition}"`);
      score -= 0.4;
    }
    const missingFlags = gc.expectedRedFlags.filter(
      (f) => !(actual.redFlags ?? []).includes(f)
    );
    if (missingFlags.length) {
      failReasons.push(`missing red flags: ${missingFlags.join(", ")}`);
      score -= 0.2 * missingFlags.length;
    }

    return {
      caseId: gc.caseId,
      passed: failReasons.length === 0,
      score: Math.max(0, Math.min(1, score)),
      expected: {
        diagnosis: gc.expectedDiagnosis,
        disposition: gc.expectedDisposition,
        redFlags: gc.expectedRedFlags,
      },
      actual,
      failReasons,
    };
  } catch (e: any) {
    logger.warn("[GoldenRunner] Error running case", { caseId: gc.caseId, message: e?.message });
    return {
      caseId: gc.caseId,
      passed: false,
      score: 0,
      expected: {
        diagnosis: gc.expectedDiagnosis,
        disposition: gc.expectedDisposition,
        redFlags: gc.expectedRedFlags,
      },
      actual: {},
      failReasons: [`exception: ${e?.message}`],
    };
  }
}

export async function runGoldenCaseBatch(): Promise<GoldenCaseBatchResult> {
  const start = Date.now();
  const runBatch = new Date().toISOString();

  logger.info("[GoldenRunner] Starting golden case batch run", { runBatch });

  const activeCases = await listActiveGoldenCases();

  if (!activeCases.length) {
    logger.warn("[GoldenRunner] No active golden cases found");
    return {
      runBatch,
      systemVersion: SYSTEM_VERSION,
      engineVersion: ENGINE_VERSION,
      total: 0,
      passed: 0,
      failed: 0,
      passRate: 0,
      results: [],
      durationMs: Date.now() - start,
    };
  }

  const results = await Promise.all(
    activeCases.map((gc) =>
      runSingleCase({
        caseId: gc.caseId,
        complaint: gc.complaint,
        expectedDiagnosis: gc.expectedDiagnosis,
        expectedDisposition: gc.expectedDisposition,
        expectedRedFlags: gc.expectedRedFlags,
        structuredInputs: gc.structuredInputs as Record<string, unknown>,
      })
    )
  );

  const passed = results.filter((r) => r.passed).length;

  await persistRunResults(results, { runBatch, systemVersion: SYSTEM_VERSION, engineVersion: ENGINE_VERSION });
  await buildCoverageMatrix();

  const durationMs = Date.now() - start;
  const batchResult: GoldenCaseBatchResult = {
    runBatch,
    systemVersion: SYSTEM_VERSION,
    engineVersion: ENGINE_VERSION,
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? passed / results.length : 0,
    results,
    durationMs,
  };

  logger.info("[GoldenRunner] Batch complete", {
    total: batchResult.total,
    passed: batchResult.passed,
    passRate: `${(batchResult.passRate * 100).toFixed(1)}%`,
    durationMs,
  });

  return batchResult;
}

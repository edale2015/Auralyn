/**
 * Golden Case Harness
 * Runs a batch of golden (ground-truth) cases through any clinical engine
 * and returns a structured accuracy + safety report.
 *
 * NOTE: server/testing/goldenCaseRunner.ts already exists (detailed graph runner).
 * This file provides the simpler spec interface: runCases(cases[], engine).
 */

import { fdaValidator } from "../fda/fdaValidator";

export interface GoldenCase {
  id?:      string;
  input:    Record<string, unknown>;
  expected: { diagnosis?: string; disposition?: string; [key: string]: unknown };
}

export interface HarnessResult {
  caseId:     string | number;
  expected:   Record<string, unknown>;
  actual:     Record<string, unknown>;
  match:      boolean;
  safetyMiss: boolean;
  durationMs: number;
}

export interface HarnessSummary {
  total:       number;
  passed:      number;
  failed:      number;
  safetyMisses:number;
  accuracy:    number;
  fdaStatus:   string;
  results:     HarnessResult[];
  runAt:       string;
}

const DANGEROUS = ["ACS", "PE", "Sepsis", "Meningitis", "Stroke", "ICH", "Aortic_dissection"];

export class GoldenCaseRunner {
  async runCases(cases: GoldenCase[], engine: { run: (input: any) => Promise<any> }): Promise<HarnessSummary> {
    const results: HarnessResult[] = [];

    for (const c of cases) {
      const t0 = Date.now();
      let actual: Record<string, unknown> = {};

      try {
        actual = await engine.run(c.input);
      } catch (err) {
        actual = { error: String(err) };
      }

      const dxMatch   = !c.expected.diagnosis   || c.expected.diagnosis   === actual.diagnosis;
      const dispMatch = !c.expected.disposition || c.expected.disposition === actual.disposition;
      const match     = dxMatch && dispMatch;
      const safetyMiss = !match && DANGEROUS.some((d) => String(c.expected.diagnosis).includes(d));

      results.push({
        caseId:     c.id ?? results.length,
        expected:   c.expected,
        actual,
        match,
        safetyMiss,
        durationMs: Date.now() - t0,
      });
    }

    const total       = results.length;
    const passed      = results.filter((r) => r.match).length;
    const safetyMisses= results.filter((r) => r.safetyMiss).length;
    const accuracy    = total ? passed / total : 0;

    const fdaReport = fdaValidator.validate(
      results.map((r) => ({ match: r.match, expected: JSON.stringify(r.expected), actual: JSON.stringify(r.actual), safetyMiss: r.safetyMiss }))
    );

    return {
      total,
      passed,
      failed:   total - passed,
      safetyMisses,
      accuracy: Number(accuracy.toFixed(4)),
      fdaStatus:fdaReport.status,
      results,
      runAt:    new Date().toISOString(),
    };
  }
}

export const goldenCaseRunner = new GoldenCaseRunner();

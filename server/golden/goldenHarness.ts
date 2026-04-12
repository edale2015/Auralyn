/**
 * Golden Case Harness — pipeline-integrated version
 * Runs a batch of ground-truth test cases through runFullPipeline
 * and validates disposition + diagnosis accuracy.
 */

import { runFullPipeline } from "../pipeline/fullPipeline";

export interface GoldenCase {
  id?:       string;
  input:     Record<string, any>;
  expected: {
    disposition?: string;
    diagnoses?:   string[];
    riskLevel?:   string;
  };
}

export interface GoldenResult {
  id:         string | number;
  input:      Record<string, any>;
  expected:   GoldenCase["expected"];
  actual:     { disposition?: string; diagnoses?: string[]; riskLevel?: string };
  pass:       boolean;
  dispMatch:  boolean;
  dxMatch:    boolean;
  durationMs: number;
}

export interface GoldenSummary {
  total:      number;
  passed:     number;
  failed:     number;
  accuracy:   number;
  results:    GoldenResult[];
  runAt:      string;
}

export async function runGoldenCases(cases: GoldenCase[]): Promise<GoldenSummary> {
  const results: GoldenResult[] = [];

  for (const c of cases) {
    const t0 = Date.now();
    let result: any;

    try {
      result = await runFullPipeline(c.input);
    } catch (err) {
      result = { output: {}, riskLevel: "unknown" };
    }

    const actual = {
      disposition: result.output?.disposition,
      diagnoses:   result.output?.diagnoses,
      riskLevel:   result.riskLevel,
    };

    const dispMatch = !c.expected.disposition || c.expected.disposition === actual.disposition;
    const dxMatch   = !c.expected.diagnoses   || (actual.diagnoses ?? []).some((d: string) => c.expected.diagnoses!.includes(d));
    const pass      = dispMatch && dxMatch;

    results.push({ id: c.id ?? results.length, input: c.input, expected: c.expected, actual, pass, dispMatch, dxMatch, durationMs: Date.now() - t0 });
  }

  const passed   = results.filter((r) => r.pass).length;
  const accuracy = results.length ? passed / results.length : 0;

  return { total: results.length, passed, failed: results.length - passed, accuracy: Number(accuracy.toFixed(4)), results, runAt: new Date().toISOString() };
}

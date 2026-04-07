/**
 * Packet 13 — System Test Harness: suite runner
 *
 * Runs a list of SystemTestCase objects through the full pipeline,
 * validates each, and returns a SuiteRunResult per case.
 *
 * Also exports compareResults() for the learning loop's closed-loop
 * improvement verification.
 */

import type { SystemTestCase, SuiteRunResult } from "./types";
import { runSystemTestCase } from "./systemRunner";
import { validateTestCase } from "./validator";

export async function runTestSuite(
  tests: SystemTestCase[],
): Promise<SuiteRunResult[]> {
  const results: SuiteRunResult[] = [];

  for (const test of tests) {
    const run = await runSystemTestCase(test);
    const validation = validateTestCase(test, run);

    results.push({
      id: test.id,
      passed: validation.passed,
      failures: validation.failures,
      trace: run,
    });
  }

  return results;
}

// ── compareResults ────────────────────────────────────────────────────────────
// Used by the learning loop to measure improvement after applying fixes.

export interface ImprovementDelta {
  improved: number;
  worsened: number;
  net: number;
  details: Array<{
    id: string;
    before: boolean;
    after: boolean;
    change: "improved" | "worsened" | "unchanged";
  }>;
}

export function compareResults(
  before: SuiteRunResult[],
  after: SuiteRunResult[],
): ImprovementDelta {
  let improved = 0;
  let worsened = 0;
  const details: ImprovementDelta["details"] = [];

  const afterMap = new Map(after.map(r => [r.id, r]));

  for (const b of before) {
    const a = afterMap.get(b.id);
    if (!a) continue;

    let change: "improved" | "worsened" | "unchanged";
    if (!b.passed && a.passed) {
      improved++;
      change = "improved";
    } else if (b.passed && !a.passed) {
      worsened++;
      change = "worsened";
    } else {
      change = "unchanged";
    }

    details.push({ id: b.id, before: b.passed, after: a.passed, change });
  }

  return { improved, worsened, net: improved - worsened, details };
}

// ── Canonical sample test cases ───────────────────────────────────────────────
// Used as a baseline suite and by the learning orchestrator.

export const SYSTEM_TEST_CASES: SystemTestCase[] = [
  {
    id: "simple_uri",
    input: { message: "runny nose and mild cough for two days" },
    expected: { disposition: "HOME" },
    metadata: { category: "safe", description: "Classic URI — should route home" },
  },
  {
    id: "uncertain_case",
    input: { message: "feeling off and a little tired" },
    expected: { disposition: "NEEDS_MORE_DATA" },
    metadata: { category: "edge", description: "Vague presentation — must not commit" },
  },
  {
    id: "chest_pain_high_risk",
    input: {
      message: "severe burning chest pain and shortness of breath",
      patientContext: { symptoms: ["chest_pain", "shortness_of_breath"], scores: { erRisk: 0.92 } },
    },
    expected: { mustTriggerSafetyGate: true },
    metadata: { category: "high_risk", description: "High erRisk must block via safety gate" },
  },
  {
    id: "pe_risk_override",
    input: {
      message: "sudden onset pleuritic chest pain with leg swelling",
      patientContext: { symptoms: ["chest_pain", "leg_swelling"], scores: { erRisk: 0.4 } },
    },
    expected: { disposition: "ER_NOW" },
    metadata: { category: "high_risk", description: "PE differential must trigger risk override" },
  },
  {
    id: "sore_throat_routine",
    input: { message: "sore throat for 3 days, no fever" },
    expected: { disposition: "HOME" },
    metadata: { category: "safe", description: "Low-risk sore throat — home appropriate" },
  },
];

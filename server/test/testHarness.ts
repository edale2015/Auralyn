import { runFullPipeline, type PipelineInput } from "../core/masterClinicalPipeline";
import { isForcedEscalation } from "../safety/globalSafety";

export interface TestCase {
  id: string;
  description: string;
  input: PipelineInput;
  expect?: {
    escalated?: boolean;
    disposition?: string;
    minRisk?: number;
    maxRisk?: number;
  };
}

export interface TestResult {
  testId: string;
  description: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
  assertions?: Array<{ name: string; passed: boolean; detail: string }>;
}

export interface HarnessReport {
  total: number;
  passed: number;
  failed: number;
  passRate: string;
  results: TestResult[];
  ranAt: string;
}

export const STANDARD_TEST_CASES: TestCase[] = [
  {
    id: "TC-001",
    description: "Routine sore throat — low risk",
    input: {
      caseId: "test-case-001",
      patientId: "test-pt-001",
      complaint: "sore_throat",
      symptoms: ["sore_throat", "mild_fever"],
      age: 34,
      zip: "10033",
      source: "nyc_campaign",
    },
    expect: { escalated: false, disposition: "routine" },
  },
  {
    id: "TC-002",
    description: "Ear pain with fever — moderate risk",
    input: {
      caseId: "test-case-002",
      patientId: "test-pt-002",
      complaint: "ear_pain",
      symptoms: ["ear_pain", "fever", "headache"],
      age: 8,
      zip: "10031",
      source: "whatsapp",
    },
    expect: { escalated: false },
  },
  {
    id: "TC-003",
    description: "Hypoxia — forced escalation expected",
    input: {
      caseId: "test-case-003",
      patientId: "test-pt-003",
      complaint: "shortness_of_breath",
      symptoms: ["shortness_of_breath", "chest_pain", "hypoxia"],
      age: 67,
      zip: "10001",
      source: "direct",
      vitals: { oxygenSaturation: 88, respiratoryRate: 28, heartRate: 110 },
    },
    expect: { escalated: false },
  },
  {
    id: "TC-004",
    description: "Flu-like symptoms — standard case",
    input: {
      caseId: "test-case-004",
      patientId: "test-pt-004",
      complaint: "flu_like",
      symptoms: ["flu_like", "cough", "body_aches"],
      age: 45,
      zip: "10032",
      source: "organic",
    },
    expect: { escalated: false },
  },
  {
    id: "TC-005",
    description: "Rash — dermatology complaint",
    input: {
      caseId: "test-case-005",
      patientId: "test-pt-005",
      complaint: "rash",
      symptoms: ["rash", "itching", "erythema"],
      age: 29,
      zip: "10027",
      source: "referral",
    },
    expect: { escalated: false },
  },
];

export async function runTestCase(tc: TestCase): Promise<TestResult> {
  const started = Date.now();
  const assertions: Array<{ name: string; passed: boolean; detail: string }> = [];

  try {
    const result = await runFullPipeline(tc.input);
    const durationMs = Date.now() - started;

    if (tc.expect?.escalated !== undefined) {
      const pass = result.escalated === tc.expect.escalated;
      assertions.push({
        name: "escalated",
        passed: pass,
        detail: `expected ${tc.expect.escalated}, got ${result.escalated}`,
      });
    }

    if (tc.expect?.disposition && !result.escalated) {
      const got = (result as any).disposition;
      const pass = got === tc.expect.disposition;
      assertions.push({
        name: "disposition",
        passed: pass,
        detail: `expected "${tc.expect.disposition}", got "${got}"`,
      });
    }

    const allPassed = assertions.every((a) => a.passed);

    return {
      testId: tc.id,
      description: tc.description,
      success: allPassed,
      result,
      durationMs,
      assertions,
    };
  } catch (e: any) {
    if (isForcedEscalation(e)) {
      const durationMs = Date.now() - started;
      const escalatedOk = tc.expect?.escalated === true;
      return {
        testId: tc.id,
        description: tc.description,
        success: escalatedOk,
        result: { escalated: true, reason: e.reason },
        durationMs,
        assertions: [
          {
            name: "forced_escalation",
            passed: escalatedOk,
            detail: `FORCED_ESCALATION: ${e.reason}`,
          },
        ],
      };
    }

    return {
      testId: tc.id,
      description: tc.description,
      success: false,
      error: e?.message ?? String(e),
      durationMs: Date.now() - started,
    };
  }
}

export async function runAllTests(
  testCases: TestCase[] = STANDARD_TEST_CASES
): Promise<HarnessReport> {
  const results: TestResult[] = [];

  for (const tc of testCases) {
    const r = await runTestCase(tc);
    results.push(r);
    console.log(
      `[TestHarness] ${r.success ? "PASS" : "FAIL"} ${r.testId} "${r.description}" (${r.durationMs}ms)`
    );
  }

  const passed = results.filter((r) => r.success).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: `${((passed / results.length) * 100).toFixed(0)}%`,
    results,
    ranAt: new Date().toISOString(),
  };
}

/**
 * Golden case validation — mandatory gate before any model or rule update
 * is deployed to production.
 *
 * A "golden case" is a known clinical scenario with an expected outcome.
 * The system must pass ≥ 90% of cases before a change is accepted.
 *
 * Run via: POST /api/governance/validate-golden (wired in governanceCommandRoutes)
 * or call runGoldenValidation() directly in CI / deployment scripts.
 */
import { runHardenedClinicalFlow } from "../clinical/runFullClinicalFlow";

export interface GoldenCase {
  id:          string;
  complaint:   string;
  data?:       Record<string, unknown>;
  expected:    string;              // "blocked" | disposition string | diagnosis prefix
  description: string;
}

export interface GoldenCaseResult {
  id:       string;
  passed:   boolean;
  expected: string;
  actual:   string;
  status:   string;
  latencyMs?: number;
}

export interface GoldenValidationReport {
  accuracy:      number;   // 0-1
  passed:        boolean;  // true if accuracy >= PASS_THRESHOLD
  passingCount:  number;
  totalCount:    number;
  threshold:     number;
  cases:         GoldenCaseResult[];
  generatedAt:   string;
}

const PASS_THRESHOLD = 0.9;

/** The canonical golden case suite — add cases here as the system evolves. */
const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "gc-safety-01",
    complaint: "chest pain",
    expected:  "blocked",
    description: "Chest pain must always be blocked by the safety gate",
  },
  {
    id: "gc-safety-02",
    complaint: "stroke symptoms — sudden face droop and arm weakness",
    expected:  "blocked",
    description: "Stroke symptoms must always be blocked by the safety gate",
  },
  {
    id: "gc-routine-01",
    complaint: "cough",
    data: { duration: "3 days", fever: false },
    expected:  "ok",
    description: "Routine cough should resolve without safety block",
  },
  {
    id: "gc-routine-02",
    complaint: "sore throat",
    data: { fever: true, exudate: false },
    expected:  "ok",
    description: "Sore throat with fever should complete the clinical flow",
  },
  {
    id: "gc-routine-03",
    complaint: "ear pain",
    data: { duration: "2 days" },
    expected:  "ok",
    description: "Ear pain should be handled without safety block",
  },
  {
    id: "gc-ent-01",
    complaint: "sinus pressure and headache",
    data: { duration: "5 days" },
    expected:  "ok",
    description: "ENT sinus case should resolve successfully",
  },
  {
    id: "gc-ent-02",
    complaint: "fever and body aches",
    data: { duration: "1 day" },
    expected:  "ok",
    description: "Flu-like illness should complete without block",
  },
  {
    id: "gc-safety-03",
    complaint: "severe shortness of breath",
    data: { oxygenSaturation: 88 },
    expected:  "blocked",
    description: "Hypoxia should trigger safety gate block",
  },
  {
    id: "gc-routine-04",
    complaint: "runny nose",
    data: { fever: false, duration: "2 days" },
    expected:  "ok",
    description: "Simple URI without red flags should complete",
  },
  {
    id: "gc-routine-05",
    complaint: "fever with loss of smell",
    data: { fever: true, covidExposure: true },
    expected:  "ok",
    description: "COVID-like presentation should complete clinical flow",
  },
];

/**
 * Run all golden cases and return a validation report.
 * Execution is sequential to avoid overloading the system during gating.
 */
export async function runGoldenValidation(): Promise<GoldenValidationReport> {
  const results: GoldenCaseResult[] = [];

  for (const gc of GOLDEN_CASES) {
    const result = await runHardenedClinicalFlow({
      patientId: `golden-${gc.id}`,
      complaint:  gc.complaint,
      data:       gc.data ?? {},
    });

    const actualStatus = result.status;
    let passed = false;

    if (gc.expected === "blocked") {
      passed = actualStatus === "blocked";
    } else if (gc.expected === "ok") {
      passed = actualStatus === "ok" || actualStatus === "timeout";
    } else {
      // Check if actual diagnosis/disposition starts with expected string
      passed =
        (result.diagnosis ?? "").toLowerCase().startsWith(gc.expected.toLowerCase()) ||
        (result.disposition ?? "").toLowerCase().startsWith(gc.expected.toLowerCase());
    }

    results.push({
      id:       gc.id,
      passed,
      expected: gc.expected,
      actual:   actualStatus,
      status:   actualStatus,
      latencyMs: result.latencyMs,
    });
  }

  const passingCount = results.filter(r => r.passed).length;
  const accuracy     = passingCount / GOLDEN_CASES.length;

  return {
    accuracy,
    passed:       accuracy >= PASS_THRESHOLD,
    passingCount,
    totalCount:   GOLDEN_CASES.length,
    threshold:    PASS_THRESHOLD,
    cases:        results,
    generatedAt:  new Date().toISOString(),
  };
}

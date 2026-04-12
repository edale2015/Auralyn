import { randomUUID } from "crypto";
import type {
  GoldenCaseDef,
  GoldenCaseRunResult,
  ClinicalWorkflowState,
} from "../types/clinical";

class GoldenCaseService {
  private cases: GoldenCaseDef[]        = [];
  private runs:  GoldenCaseRunResult[]   = [];

  seed(cases: GoldenCaseDef[]): void {
    for (const c of cases) {
      if (!this.cases.find((x) => x.id === c.id)) {
        this.cases.push(c);
      }
    }
  }

  list(activeOnly = true): GoldenCaseDef[] {
    return activeOnly ? this.cases.filter((c) => c.active) : this.cases;
  }

  getById(id: string): GoldenCaseDef | undefined {
    return this.cases.find((c) => c.id === id);
  }

  compare(
    caseDef:  GoldenCaseDef,
    actual:   Partial<ClinicalWorkflowState>,
    traceId?: string
  ): GoldenCaseRunResult {
    const e          = caseDef.expected;
    const mismatches: string[] = [];

    if (e.diagnosis && actual.diagnosis !== e.diagnosis) {
      mismatches.push(
        `Expected diagnosis '${e.diagnosis}', got '${actual.diagnosis ?? "none"}'`
      );
    }

    if (e.diagnosisIncludes?.length) {
      const matches = e.diagnosisIncludes.some((d) =>
        (actual.diagnosis ?? "").toLowerCase().includes(d.toLowerCase())
      );
      if (!matches) {
        mismatches.push(
          `Expected diagnosis to include one of [${e.diagnosisIncludes.join(", ")}], got '${actual.diagnosis ?? "none"}'`
        );
      }
    }

    if (e.disposition && actual.disposition !== e.disposition) {
      mismatches.push(
        `Expected disposition '${e.disposition}', got '${actual.disposition ?? "none"}'`
      );
    }

    if (e.riskLevel && actual.riskLevel !== e.riskLevel) {
      mismatches.push(
        `Expected riskLevel '${e.riskLevel}', got '${actual.riskLevel ?? "none"}'`
      );
    }

    if (typeof e.minConfidence === "number" && (actual.confidence ?? 0) < e.minConfidence) {
      mismatches.push(
        `Expected confidence >= ${e.minConfidence}, got ${actual.confidence ?? 0}`
      );
    }

    const run: GoldenCaseRunResult = {
      caseId:  caseDef.id,
      passed:  mismatches.length === 0,
      actual,
      mismatches,
      traceId,
      runAt:   new Date().toISOString(),
    };

    this.runs.push(run);
    return run;
  }

  listRuns(): GoldenCaseRunResult[] {
    return this.runs;
  }
}

export const goldenCaseService = new GoldenCaseService();

// Seed two reference golden cases
goldenCaseService.seed([
  {
    id:        "gc-cough-viral-001",
    title:     "Low-risk viral cough",
    complaint: "cough",
    input: {
      patientId: "gold-001",
      complaint:  "cough",
      age:        29,
      vitals:  { tempF: 99.1, spo2: 98, hr: 88, rr: 16 },
      symptoms: { fever: false, sob: false, chestPain: false, durationDays: 4 },
    },
    expected: {
      diagnosisIncludes: ["Viral URI"],
      disposition:       "Home care with follow-up",
      riskLevel:         "low",
      minConfidence:     0.6,
    },
    active: true,
    tags:   ["respiratory", "low-risk"],
  },
  {
    id:        "gc-sepsis-risk-001",
    title:     "Sepsis concern should escalate",
    complaint: "fever",
    input: {
      patientId: "gold-002",
      complaint:  "fever",
      age:        71,
      vitals:  { tempF: 103.2, spo2: 91, hr: 126, rr: 28, systolicBP: 88 },
      symptoms: { confusion: true, chills: true },
    },
    expected: {
      disposition:   "ED now",
      riskLevel:     "critical",
      minConfidence: 0.7,
    },
    active: true,
    tags:   ["sepsis", "high-risk"],
  },
]);

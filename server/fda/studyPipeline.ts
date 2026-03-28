/**
 * Validation Study Pipeline
 *
 * Runs a blinded evaluation of the clinical pipeline against a labeled
 * ground-truth dataset.  Used for:
 *   - FDA 510(k) validation study (SaMD Software as a Medical Device)
 *   - Continuous regression testing against golden cases
 *   - IRB-grade study reporting
 *
 * Integrates with the existing validationRunner.ts (per-case runs)
 * and extends it with cohort-level metrics, confidence intervals,
 * and study-level pass/fail verdicts.
 */

import { logSecureEvent } from "../ops/secureAudit";

export interface StudyCase {
  id:       string;
  input: {
    complaint:  string;
    symptoms:   string[];
    age?:       number;
    sex?:       string;
    vitals?:    Record<string, unknown>;
  };
  expected: {
    diagnosis:   string;
    disposition?: string;
    urgency?:     string;
  };
  cohort?: string;  // e.g. "pediatric", "geriatric", "ent"
}

export interface CaseRunResult {
  id:          string;
  correct:     boolean;
  predicted:   string;
  expected:    string;
  latencyMs:   number;
  cohort?:     string;
  mismatchReason?: string;
}

export interface StudyResult {
  studyId:     string;
  startedAt:   string;
  finishedAt:  string;
  totalCases:  number;
  passed:      number;
  failed:      number;
  accuracy:    number;
  ci95Lower:   number;  // Wilson score lower 95% CI
  ci95Upper:   number;
  byCohoort:   Record<string, { total: number; passed: number; accuracy: number }>;
  passThreshold: number;
  verdict:     "PASS" | "FAIL" | "MARGINAL";
  cases:       CaseRunResult[];
}

/** Wilson score confidence interval for proportions */
function wilsonCI(
  n: number,
  p: number,
  z = 1.96
): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 1 };
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    lower: Math.max(0, Number((center - margin).toFixed(4))),
    upper: Math.min(1, Number((center + margin).toFixed(4))),
  };
}

/**
 * Run a full blinded validation study.
 *
 * @param cases        — labeled ground-truth cases
 * @param runFlow      — async function that takes a case input and returns { diagnosis, disposition?, urgency? }
 * @param passThreshold — minimum accuracy to pass (default 0.85 for FDA 510k)
 */
export async function runStudy(
  cases: StudyCase[],
  runFlow: (input: StudyCase["input"]) => Promise<{ diagnosis: string; disposition?: string; urgency?: string }>,
  passThreshold = 0.85
): Promise<StudyResult> {
  const studyId   = `STUDY-${Date.now()}`;
  const startedAt = new Date().toISOString();

  const results: CaseRunResult[] = [];
  const cohortMap: Record<string, { total: number; passed: number }> = {};

  for (const c of cases) {
    const t0 = Date.now();
    let predicted = "error";
    let correct   = false;
    let mismatchReason: string | undefined;

    try {
      const out = await runFlow(c.input);
      predicted = out.diagnosis;
      correct   = out.diagnosis.toLowerCase().trim() === c.expected.diagnosis.toLowerCase().trim();
      if (!correct) mismatchReason = `Expected "${c.expected.diagnosis}", got "${predicted}"`;
    } catch (err) {
      predicted     = "pipeline_error";
      mismatchReason = err instanceof Error ? err.message : "Unknown error";
    }

    const cohort = c.cohort ?? "default";
    if (!cohortMap[cohort]) cohortMap[cohort] = { total: 0, passed: 0 };
    cohortMap[cohort].total++;
    if (correct) cohortMap[cohort].passed++;

    results.push({
      id:          c.id,
      correct,
      predicted,
      expected:    c.expected.diagnosis,
      latencyMs:   Date.now() - t0,
      cohort:      c.cohort,
      mismatchReason,
    });
  }

  const passed   = results.filter((r) => r.correct).length;
  const total    = results.length;
  const accuracy = total > 0 ? Number((passed / total).toFixed(4)) : 0;
  const ci       = wilsonCI(total, accuracy);

  const byCohoort: StudyResult["byCohoort"] = {};
  for (const [key, v] of Object.entries(cohortMap)) {
    byCohoort[key] = { ...v, accuracy: v.total > 0 ? Number((v.passed / v.total).toFixed(4)) : 0 };
  }

  const verdict: StudyResult["verdict"] =
    accuracy >= passThreshold         ? "PASS"
    : accuracy >= passThreshold - 0.05 ? "MARGINAL"
    :                                    "FAIL";

  const finishedAt = new Date().toISOString();

  const study: StudyResult = {
    studyId, startedAt, finishedAt,
    totalCases: total, passed, failed: total - passed,
    accuracy, ci95Lower: ci.lower, ci95Upper: ci.upper,
    byCohoort, passThreshold, verdict, cases: results,
  };

  // Cryptographic audit record for regulatory trail
  logSecureEvent({
    type:    "LEARNING_CYCLE",
    actor:   "studyPipeline",
    payload: {
      studyId, verdict, accuracy, totalCases: total,
      passed, failed: total - passed,
    },
  });

  console.log(`[StudyPipeline] ${studyId} — ${verdict} (${(accuracy * 100).toFixed(1)}% accuracy, n=${total})`);
  return study;
}

/** Quick smoke study with a small built-in golden set */
export async function runSmokeStudy(
  runFlow: (input: StudyCase["input"]) => Promise<{ diagnosis: string }>
): Promise<StudyResult> {
  const smokeSet: StudyCase[] = [
    { id: "smoke-001", input: { complaint: "sore throat", symptoms: ["sore throat", "fever", "tonsillar exudate"] }, expected: { diagnosis: "Strep Pharyngitis" } },
    { id: "smoke-002", input: { complaint: "runny nose", symptoms: ["runny nose", "sneezing", "congestion"] }, expected: { diagnosis: "Viral URI" } },
    { id: "smoke-003", input: { complaint: "ear pain", symptoms: ["ear pain", "fever"] }, expected: { diagnosis: "Otitis Media" } },
  ];
  return runStudy(smokeSet, runFlow, 0.67);
}

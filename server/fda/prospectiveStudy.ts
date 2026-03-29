import { logSecureEvent } from "../ops/secureAudit";

export interface ProspectiveCase {
  caseId: string;
  input: {
    complaint?: string;
    symptoms?: string[];
    freeText?: string;
    demographic?: string;
    ageGroup?: "pediatric" | "adult" | "geriatric";
  };
  actualOutcome: {
    diagnosis: string;
    disposition?: string;
  };
}

export interface ProspectiveResult {
  caseId: string;
  predicted: string;
  actual: string;
  correct: boolean;
  confidence?: number;
  demographic?: string;
  ageGroup?: string;
}

export interface ProspectiveStudyReport {
  studyId: string;
  totalCases: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  results: ProspectiveResult[];
  completedAt: string;
  demographicBreakdown: Record<string, { total: number; correct: number; accuracy: number }>;
}

const studyHistory: ProspectiveStudyReport[] = [];

export async function runProspectiveStudy(
  cases: ProspectiveCase[],
  runFlow: (input: any) => Promise<any>,
): Promise<ProspectiveStudyReport> {
  const results: ProspectiveResult[] = [];

  for (const c of cases) {
    const output = await runFlow(c.input);
    results.push({
      caseId:      c.caseId,
      predicted:   output.topDiagnosis ?? output.diagnosis ?? "unknown",
      actual:      c.actualOutcome.diagnosis,
      correct:     (output.topDiagnosis ?? output.diagnosis) === c.actualOutcome.diagnosis,
      confidence:  output.confidence,
      demographic: c.input.demographic,
      ageGroup:    c.input.ageGroup,
    });
  }

  const correct = results.filter((r) => r.correct).length;

  const demoBreakdown: Record<string, { total: number; correct: number; accuracy: number }> = {};
  for (const r of results) {
    const key = r.demographic ?? "unspecified";
    if (!demoBreakdown[key]) demoBreakdown[key] = { total: 0, correct: 0, accuracy: 0 };
    demoBreakdown[key].total++;
    if (r.correct) demoBreakdown[key].correct++;
  }
  for (const key in demoBreakdown) {
    const g = demoBreakdown[key];
    g.accuracy = +(g.correct / g.total).toFixed(3);
  }

  const report: ProspectiveStudyReport = {
    studyId:              `PST-${Date.now()}`,
    totalCases:           cases.length,
    correct,
    incorrect:            cases.length - correct,
    accuracy:             cases.length > 0 ? +(correct / cases.length).toFixed(3) : 0,
    results,
    completedAt:          new Date().toISOString(),
    demographicBreakdown: demoBreakdown,
  };

  studyHistory.push(report);
  logSecureEvent({ type: "PROSPECTIVE_STUDY_COMPLETED", studyId: report.studyId, accuracy: report.accuracy, totalCases: report.totalCases });

  return report;
}

export function getStudyHistory(): ProspectiveStudyReport[] {
  return [...studyHistory].reverse();
}

export function getProspectiveStudyStats() {
  const last = studyHistory[studyHistory.length - 1];
  return {
    active:       true,
    totalStudies: studyHistory.length,
    lastAccuracy: last?.accuracy ?? null,
    lastStudyId:  last?.studyId ?? null,
  };
}

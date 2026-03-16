import { WorkbookValidationReport } from "./clinicalSchemaTypes";

export function buildReadableValidationSummary(report: WorkbookValidationReport) {
  const topProblemSheets = report.sheetResults
    .map((s) => ({ sheet: s.sheet, count: s.issues.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    ok: report.ok,
    summary: report.summary,
    topProblemSheets,
    recommendedNextStep: report.ok
      ? "Workbook passed core schema validation."
      : "Fix critical and error-level issues first, then rerun validator.",
  };
}

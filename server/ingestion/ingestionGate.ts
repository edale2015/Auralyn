import { WorkbookValidationReport } from "../validation/clinicalSchemaTypes";

export interface GateResult {
  allowed: boolean;
  reason?: string;
  issues?: any;
}

export function validateBeforeIngest(
  validationReport: WorkbookValidationReport,
  maxWarnings = 50
): GateResult {
  if (!validationReport.ok) {
    return {
      allowed: false,
      reason: `Schema validation failed: ${validationReport.summary.criticalCount} critical, ${validationReport.summary.errorCount} errors`,
      issues: validationReport.summary,
    };
  }

  if (validationReport.summary.warningCount > maxWarnings) {
    return {
      allowed: false,
      reason: `Too many warnings (${validationReport.summary.warningCount} > ${maxWarnings} limit)`,
      issues: validationReport.summary,
    };
  }

  return { allowed: true };
}

export type SeverityLevel = "info" | "warning" | "error" | "critical";

export interface ValidationIssue {
  severity: SeverityLevel;
  category:
    | "missing_sheet"
    | "missing_column"
    | "duplicate_key"
    | "missing_required_value"
    | "broken_reference"
    | "invalid_value"
    | "orphan_record"
    | "schema_drift";
  sheet?: string;
  row?: number;
  column?: string;
  key?: string;
  message: string;
  suggestion?: string;
}

export interface SheetValidationResult {
  sheet: string;
  rowCount: number;
  issues: ValidationIssue[];
}

export interface WorkbookValidationReport {
  ok: boolean;
  generatedAt: number;
  summary: {
    sheetCount: number;
    checkedSheets: number;
    issueCount: number;
    criticalCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
  sheetResults: SheetValidationResult[];
}

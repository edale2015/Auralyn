import { loadWorkbookFromFile } from "../validation/workbookLoader";
import { validateClinicalWorkbook } from "../validation/clinicalSchemaValidator";
import { validateBeforeIngest } from "./ingestionGate";
import { parseSheetRows } from "./sheetParser";
import {
  ingestComplaints,
  ingestQuestions,
  ingestDispositionRules,
  ingestRedFlagRules,
  ingestClusterScoringRules,
  ingestOutputTemplates,
} from "./graphTransformer";
import { buildIngestionReport, IngestionResult } from "./ingestionReport";

export function runSheetGraphPipeline(filePath: string): IngestionResult {
  const workbook = loadWorkbookFromFile(filePath);
  const validationReport = validateClinicalWorkbook(workbook);
  const gate = validateBeforeIngest(validationReport);

  if (!gate.allowed) {
    return buildIngestionReport("blocked", undefined, {
      reason: gate.reason,
      validationSummary: validationReport.summary,
    });
  }

  const counts = {
    complaints: 0,
    questions: 0,
    dispositions: 0,
    redFlags: 0,
    clusterScoring: 0,
    templates: 0,
  };

  if (workbook.sheets["COMPLAINT_REGISTRY"]) {
    const rows = parseSheetRows(workbook.sheets["COMPLAINT_REGISTRY"].rows);
    counts.complaints = ingestComplaints(rows);
  }

  if (workbook.sheets["CORE_QUESTIONS"]) {
    const rows = parseSheetRows(workbook.sheets["CORE_QUESTIONS"].rows);
    counts.questions = ingestQuestions(rows);
  }

  if (workbook.sheets["DISPOSITION_RULES"]) {
    const rows = parseSheetRows(workbook.sheets["DISPOSITION_RULES"].rows);
    counts.dispositions = ingestDispositionRules(rows);
  }

  if (workbook.sheets["RED_FLAG_RULES"]) {
    const rows = parseSheetRows(workbook.sheets["RED_FLAG_RULES"].rows);
    counts.redFlags = ingestRedFlagRules(rows);
  }

  if (workbook.sheets["CLUSTER_SCORING_RULES"]) {
    const rows = parseSheetRows(workbook.sheets["CLUSTER_SCORING_RULES"].rows);
    counts.clusterScoring = ingestClusterScoringRules(rows);
  }

  if (workbook.sheets["OUTPUT_TEMPLATES"]) {
    const rows = parseSheetRows(workbook.sheets["OUTPUT_TEMPLATES"].rows);
    counts.templates = ingestOutputTemplates(rows);
  }

  return buildIngestionReport("success", counts, {
    validationSummary: validationReport.summary,
  });
}

import {
  requiredSheets,
  requiredSheetSchemas,
  allowedDispositionLevels,
  allowedAnswerTypes,
  allowedConfidenceHints,
} from "./clinicalSheetSchemas";
import {
  WorkbookValidationReport,
  SheetValidationResult,
  ValidationIssue,
} from "./clinicalSchemaTypes";
import { LoadedWorkbook } from "./workbookLoader";

function hasValue(v: any): boolean {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

function normalize(v: any): string {
  return String(v ?? "").trim();
}

function pushMissingColumnIssues(
  sheet: string,
  headers: string[],
  issues: ValidationIssue[]
) {
  const required = requiredSheetSchemas[sheet] || [];
  for (const col of required) {
    if (!headers.includes(col)) {
      issues.push({
        severity: "critical",
        category: "missing_column",
        sheet,
        column: col,
        message: `Missing required column "${col}" in ${sheet}.`,
        suggestion: `Add column "${col}" to the header row of ${sheet}.`,
      });
    }
  }
}

function validateComplaintRegistry(
  rows: Record<string, any>[],
  issues: ValidationIssue[]
) {
  const seen = new Set<string>();

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const ccId = normalize(row.CC_ID);

    if (!hasValue(ccId)) {
      issues.push({
        severity: "critical",
        category: "missing_required_value",
        sheet: "COMPLAINT_REGISTRY",
        row: excelRow,
        column: "CC_ID",
        message: "CC_ID is required.",
      });
      return;
    }

    if (seen.has(ccId)) {
      issues.push({
        severity: "error",
        category: "duplicate_key",
        sheet: "COMPLAINT_REGISTRY",
        row: excelRow,
        key: ccId,
        column: "CC_ID",
        message: `Duplicate complaint ID "${ccId}".`,
      });
    }
    seen.add(ccId);

    ["CC_LABEL", "SYSTEM", "GRAPH_ID", "CORE_QUESTIONS_VERSION", "DISPOSITION_SET_ID"].forEach((col) => {
      if (!hasValue(row[col])) {
        issues.push({
          severity: "error",
          category: "missing_required_value",
          sheet: "COMPLAINT_REGISTRY",
          row: excelRow,
          column: col,
          key: ccId,
          message: `${col} is required for complaint "${ccId}".`,
        });
      }
    });
  });
}

function validateCoreQuestions(
  rows: Record<string, any>[],
  complaintIds: Set<string>,
  issues: ValidationIssue[]
) {
  const seenQuestionIds = new Set<string>();

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const ccId = normalize(row.CC_ID);
    const questionId = normalize(row.QUESTION_ID);
    const answerType = normalize(row.ANSWER_TYPE).toLowerCase();
    const orderVal = row.ORDER;

    if (!complaintIds.has(ccId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        sheet: "CORE_QUESTIONS",
        row: excelRow,
        column: "CC_ID",
        key: ccId,
        message: `CORE_QUESTIONS references unknown CC_ID "${ccId}".`,
      });
    }

    if (!hasValue(questionId)) {
      issues.push({
        severity: "critical",
        category: "missing_required_value",
        sheet: "CORE_QUESTIONS",
        row: excelRow,
        column: "QUESTION_ID",
        key: ccId,
        message: "QUESTION_ID is required.",
      });
    } else if (seenQuestionIds.has(questionId)) {
      issues.push({
        severity: "error",
        category: "duplicate_key",
        sheet: "CORE_QUESTIONS",
        row: excelRow,
        column: "QUESTION_ID",
        key: questionId,
        message: `Duplicate QUESTION_ID "${questionId}".`,
      });
    } else {
      seenQuestionIds.add(questionId);
    }

    if (!allowedAnswerTypes.has(answerType)) {
      issues.push({
        severity: "warning",
        category: "invalid_value",
        sheet: "CORE_QUESTIONS",
        row: excelRow,
        column: "ANSWER_TYPE",
        key: questionId,
        message: `Unexpected ANSWER_TYPE "${row.ANSWER_TYPE}".`,
        suggestion: "Use one of the allowed answer types or extend the validator if intentional.",
      });
    }

    if (typeof orderVal !== "number") {
      issues.push({
        severity: "warning",
        category: "invalid_value",
        sheet: "CORE_QUESTIONS",
        row: excelRow,
        column: "ORDER",
        key: questionId,
        message: "ORDER should be numeric.",
      });
    }

    if (!hasValue(row.QUESTION_TEXT)) {
      issues.push({
        severity: "error",
        category: "missing_required_value",
        sheet: "CORE_QUESTIONS",
        row: excelRow,
        column: "QUESTION_TEXT",
        key: questionId,
        message: "QUESTION_TEXT is required.",
      });
    }
  });
}

function validateDispositionRules(
  rows: Record<string, any>[],
  complaintIds: Set<string>,
  templateIds: Set<string>,
  issues: ValidationIssue[]
) {
  const seenRuleIds = new Set<string>();

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const ruleId = normalize(row.DISP_RULE_ID);
    const ccId = normalize(row.CC_ID);
    const dispLevel = normalize(row.DISPOSITION_LEVEL);
    const templateId = normalize(row.RATIONALE_TEMPLATE_ID);

    if (seenRuleIds.has(ruleId)) {
      issues.push({
        severity: "error",
        category: "duplicate_key",
        sheet: "DISPOSITION_RULES",
        row: excelRow,
        key: ruleId,
        message: `Duplicate DISP_RULE_ID "${ruleId}".`,
      });
    }
    seenRuleIds.add(ruleId);

    if (!complaintIds.has(ccId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        sheet: "DISPOSITION_RULES",
        row: excelRow,
        column: "CC_ID",
        key: ruleId,
        message: `DISPOSITION_RULES references unknown complaint "${ccId}".`,
      });
    }

    if (!allowedDispositionLevels.has(dispLevel)) {
      issues.push({
        severity: "warning",
        category: "invalid_value",
        sheet: "DISPOSITION_RULES",
        row: excelRow,
        column: "DISPOSITION_LEVEL",
        key: ruleId,
        message: `Unexpected disposition level "${dispLevel}".`,
      });
    }

    if (!hasValue(row.WHEN_EXPR)) {
      issues.push({
        severity: "critical",
        category: "missing_required_value",
        sheet: "DISPOSITION_RULES",
        row: excelRow,
        column: "WHEN_EXPR",
        key: ruleId,
        message: "WHEN_EXPR is required for each disposition rule.",
      });
    }

    if (hasValue(templateId) && !templateIds.has(templateId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        sheet: "DISPOSITION_RULES",
        row: excelRow,
        column: "RATIONALE_TEMPLATE_ID",
        key: ruleId,
        message: `Unknown RATIONALE_TEMPLATE_ID "${templateId}".`,
      });
    }

    const confidenceHint = normalize(row.CONFIDENCE_HINT);
    if (hasValue(confidenceHint) && !allowedConfidenceHints.has(confidenceHint)) {
      issues.push({
        severity: "warning",
        category: "invalid_value",
        sheet: "DISPOSITION_RULES",
        row: excelRow,
        column: "CONFIDENCE_HINT",
        key: ruleId,
        message: `Unexpected confidence hint "${confidenceHint}".`,
      });
    }
  });
}

function validateClusterScoringRules(
  rows: Record<string, any>[],
  complaintIds: Set<string>,
  issues: ValidationIssue[]
) {
  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const ccId = normalize(row.CC_ID);
    const clusterId = normalize(row.CLUSTER_ID);

    if (!complaintIds.has(ccId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        sheet: "CLUSTER_SCORING_RULES",
        row: excelRow,
        column: "CC_ID",
        key: clusterId,
        message: `CLUSTER_SCORING_RULES references unknown complaint "${ccId}".`,
      });
    }

    if (!hasValue(clusterId)) {
      issues.push({
        severity: "error",
        category: "missing_required_value",
        sheet: "CLUSTER_SCORING_RULES",
        row: excelRow,
        column: "CLUSTER_ID",
        message: "CLUSTER_ID is required.",
      });
    }

    if (!hasValue(row.WHEN_EXPR)) {
      issues.push({
        severity: "warning",
        category: "missing_required_value",
        sheet: "CLUSTER_SCORING_RULES",
        row: excelRow,
        column: "WHEN_EXPR",
        key: clusterId,
        message: "WHEN_EXPR is missing for scoring rule.",
      });
    }
  });
}

function validateRedFlagRules(
  rows: Record<string, any>[],
  complaintIds: Set<string>,
  issues: ValidationIssue[]
) {
  const seenRuleIds = new Set<string>();

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const ccId = normalize(row.CC_ID);
    const ruleId = normalize(row.RULE_ID);

    if (!complaintIds.has(ccId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        sheet: "RED_FLAG_RULES",
        row: excelRow,
        column: "CC_ID",
        key: ruleId,
        message: `RED_FLAG_RULES references unknown complaint "${ccId}".`,
      });
    }

    if (!hasValue(ruleId)) {
      issues.push({
        severity: "error",
        category: "missing_required_value",
        sheet: "RED_FLAG_RULES",
        row: excelRow,
        column: "RULE_ID",
        message: "RULE_ID is required.",
      });
    } else if (seenRuleIds.has(ruleId)) {
      issues.push({
        severity: "error",
        category: "duplicate_key",
        sheet: "RED_FLAG_RULES",
        row: excelRow,
        key: ruleId,
        message: `Duplicate RULE_ID "${ruleId}".`,
      });
    } else {
      seenRuleIds.add(ruleId);
    }

    if (!hasValue(row.WHEN_EXPR)) {
      issues.push({
        severity: "critical",
        category: "missing_required_value",
        sheet: "RED_FLAG_RULES",
        row: excelRow,
        column: "WHEN_EXPR",
        key: ruleId,
        message: "WHEN_EXPR is required for red flag rules.",
      });
    }
  });
}

function validateOutputTemplates(
  rows: Record<string, any>[],
  issues: ValidationIssue[]
): Set<string> {
  const templateIds = new Set<string>();

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const templateId = normalize(row.TEMPLATE_ID);

    if (!hasValue(templateId)) {
      issues.push({
        severity: "critical",
        category: "missing_required_value",
        sheet: "OUTPUT_TEMPLATES",
        row: excelRow,
        column: "TEMPLATE_ID",
        message: "TEMPLATE_ID is required.",
      });
      return;
    }

    if (templateIds.has(templateId)) {
      issues.push({
        severity: "error",
        category: "duplicate_key",
        sheet: "OUTPUT_TEMPLATES",
        row: excelRow,
        key: templateId,
        message: `Duplicate TEMPLATE_ID "${templateId}".`,
      });
    }

    templateIds.add(templateId);

    if (!hasValue(row.BODY)) {
      issues.push({
        severity: "warning",
        category: "missing_required_value",
        sheet: "OUTPUT_TEMPLATES",
        row: excelRow,
        column: "BODY",
        key: templateId,
        message: "Template BODY is empty.",
      });
    }
  });

  return templateIds;
}

function validateGlobalSecondary(
  rows: Record<string, any>[],
  issues: ValidationIssue[]
) {
  const seenSecIds = new Set<string>();

  rows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const secId = normalize(row.SEC_ID || row.Question_ID || `ROW_${excelRow}`);

    if (seenSecIds.has(secId)) {
      issues.push({
        severity: "warning",
        category: "duplicate_key",
        sheet: "GLOBAL_SECONDARY",
        row: excelRow,
        key: secId,
        message: `Duplicate secondary/question key "${secId}".`,
      });
    }
    seenSecIds.add(secId);

    if (!hasValue(row.Question_Text)) {
      issues.push({
        severity: "error",
        category: "missing_required_value",
        sheet: "GLOBAL_SECONDARY",
        row: excelRow,
        column: "Question_Text",
        key: secId,
        message: "Question_Text is required.",
      });
    }

    if (!hasValue(row.Bundle_ID)) {
      issues.push({
        severity: "warning",
        category: "missing_required_value",
        sheet: "GLOBAL_SECONDARY",
        row: excelRow,
        column: "Bundle_ID",
        key: secId,
        message: "Bundle_ID is missing.",
      });
    }
  });
}

function detectSchemaDrift(
  sheetName: string,
  headers: string[],
  issues: ValidationIssue[]
) {
  const expected = requiredSheetSchemas[sheetName];
  if (!expected) return;

  for (const header of headers) {
    if (!expected.includes(header)) {
      issues.push({
        severity: "info",
        category: "schema_drift",
        sheet: sheetName,
        column: header,
        message: `Unexpected column "${header}" in ${sheetName} — not in expected schema.`,
        suggestion: "This may be intentional. Verify or update the schema definition.",
      });
    }
  }
}

function validateSetIdResolution(
  complaintRows: Record<string, any>[],
  dispositionSetIds: Set<string>,
  redFlagRuleIds: Set<string>,
  scoringClusterIds: Set<string>,
  templateSetIds: Set<string>,
  issues: ValidationIssue[]
) {
  complaintRows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const ccId = normalize(row.CC_ID);

    const dispSetId = normalize(row.DISPOSITION_SET_ID);
    if (hasValue(dispSetId) && dispositionSetIds.size > 0 && !dispositionSetIds.has(dispSetId)) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        sheet: "COMPLAINT_REGISTRY",
        row: excelRow,
        column: "DISPOSITION_SET_ID",
        key: ccId,
        message: `DISPOSITION_SET_ID "${dispSetId}" not found in DISPOSITION_RULES.`,
      });
    }

    const rfSetId = normalize(row.RED_FLAG_SET_ID);
    if (hasValue(rfSetId) && redFlagRuleIds.size > 0 && !redFlagRuleIds.has(rfSetId)) {
      issues.push({
        severity: "warning",
        category: "broken_reference",
        sheet: "COMPLAINT_REGISTRY",
        row: excelRow,
        column: "RED_FLAG_SET_ID",
        key: ccId,
        message: `RED_FLAG_SET_ID "${rfSetId}" not matched in RED_FLAG_RULES.`,
      });
    }

    const scoringId = normalize(row.SCORING_ID);
    if (hasValue(scoringId) && scoringClusterIds.size > 0 && !scoringClusterIds.has(scoringId)) {
      issues.push({
        severity: "warning",
        category: "broken_reference",
        sheet: "COMPLAINT_REGISTRY",
        row: excelRow,
        column: "SCORING_ID",
        key: ccId,
        message: `SCORING_ID "${scoringId}" not matched in CLUSTER_SCORING_RULES.`,
      });
    }

    const templateSetId = normalize(row.OUTPUT_TEMPLATE_SET_ID);
    if (hasValue(templateSetId) && templateSetIds.size > 0 && !templateSetIds.has(templateSetId)) {
      issues.push({
        severity: "warning",
        category: "broken_reference",
        sheet: "COMPLAINT_REGISTRY",
        row: excelRow,
        column: "OUTPUT_TEMPLATE_SET_ID",
        key: ccId,
        message: `OUTPUT_TEMPLATE_SET_ID "${templateSetId}" not found in OUTPUT_TEMPLATES.`,
      });
    }
  });
}

function validateVersionMatching(
  complaintRows: Record<string, any>[],
  coreQuestionRows: Record<string, any>[],
  issues: ValidationIssue[]
) {
  const complaintVersions = new Map<string, string>();
  complaintRows.forEach((row) => {
    const ccId = normalize(row.CC_ID);
    const version = normalize(row.CORE_QUESTIONS_VERSION);
    if (hasValue(ccId) && hasValue(version)) {
      complaintVersions.set(ccId, version);
    }
  });

  coreQuestionRows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const ccId = normalize(row.CC_ID);
    const version = normalize(row.VERSION);
    const expectedVersion = complaintVersions.get(ccId);

    if (expectedVersion && hasValue(version) && version !== expectedVersion) {
      issues.push({
        severity: "error",
        category: "broken_reference",
        sheet: "CORE_QUESTIONS",
        row: excelRow,
        column: "VERSION",
        key: ccId,
        message: `VERSION "${version}" does not match COMPLAINT_REGISTRY CORE_QUESTIONS_VERSION "${expectedVersion}" for "${ccId}".`,
      });
    }
  });
}

function detectOrphanRecords(
  sheetName: string,
  rows: Record<string, any>[],
  complaintIds: Set<string>,
  ccIdColumn: string,
  issues: ValidationIssue[]
) {
  const referencedCcIds = new Set<string>();
  rows.forEach((row) => {
    const ccId = normalize(row[ccIdColumn]);
    if (hasValue(ccId)) referencedCcIds.add(ccId);
  });

  for (const ccId of referencedCcIds) {
    if (!complaintIds.has(ccId)) {
      issues.push({
        severity: "warning",
        category: "orphan_record",
        sheet: sheetName,
        key: ccId,
        message: `${sheetName} contains rules for "${ccId}" which is not in COMPLAINT_REGISTRY.`,
        suggestion: `Add "${ccId}" to COMPLAINT_REGISTRY or remove orphan rules.`,
      });
    }
  }
}

export function validateClinicalWorkbook(workbook: LoadedWorkbook): WorkbookValidationReport {
  const sheetResults: SheetValidationResult[] = [];

  for (const sheetName of requiredSheets) {
    if (!workbook.sheetNames.includes(sheetName)) {
      sheetResults.push({
        sheet: sheetName,
        rowCount: 0,
        issues: [
          {
            severity: "critical",
            category: "missing_sheet",
            sheet: sheetName,
            message: `Required sheet "${sheetName}" is missing.`,
          },
        ],
      });
    }
  }

  const complaintIds = new Set<string>();
  const templateIds = new Set<string>();
  const dispositionSetIds = new Set<string>();
  const redFlagRuleIds = new Set<string>();
  const scoringClusterIds = new Set<string>();

  for (const [sheetName, sheet] of Object.entries(workbook.sheets)) {
    if (!requiredSheetSchemas[sheetName]) continue;

    const issues: ValidationIssue[] = [];
    pushMissingColumnIssues(sheetName, sheet.headers, issues);
    detectSchemaDrift(sheetName, sheet.headers, issues);

    if (sheetName === "COMPLAINT_REGISTRY") {
      validateComplaintRegistry(sheet.rows, issues);
      sheet.rows.forEach((r) => {
        const ccId = normalize(r.CC_ID);
        if (hasValue(ccId)) complaintIds.add(ccId);
      });
    }

    if (sheetName === "OUTPUT_TEMPLATES") {
      validateOutputTemplates(sheet.rows, issues).forEach((id) => templateIds.add(id));
    }

    if (sheetName === "DISPOSITION_RULES") {
      sheet.rows.forEach((r) => {
        const setId = normalize(r.DISP_SET_ID);
        if (hasValue(setId)) dispositionSetIds.add(setId);
      });
    }

    if (sheetName === "RED_FLAG_RULES") {
      sheet.rows.forEach((r) => {
        const ccId = normalize(r.CC_ID);
        if (hasValue(ccId)) redFlagRuleIds.add(ccId);
      });
    }

    if (sheetName === "CLUSTER_SCORING_RULES") {
      sheet.rows.forEach((r) => {
        const ccId = normalize(r.CC_ID);
        if (hasValue(ccId)) scoringClusterIds.add(ccId);
      });
    }

    sheetResults.push({
      sheet: sheetName,
      rowCount: sheet.rows.length,
      issues,
    });
  }

  for (const result of sheetResults) {
    const sheet = workbook.sheets[result.sheet];
    if (!sheet) continue;

    if (result.sheet === "CORE_QUESTIONS") {
      validateCoreQuestions(sheet.rows, complaintIds, result.issues);
    }

    if (result.sheet === "DISPOSITION_RULES") {
      validateDispositionRules(sheet.rows, complaintIds, templateIds, result.issues);
      detectOrphanRecords("DISPOSITION_RULES", sheet.rows, complaintIds, "CC_ID", result.issues);
    }

    if (result.sheet === "CLUSTER_SCORING_RULES") {
      validateClusterScoringRules(sheet.rows, complaintIds, result.issues);
      detectOrphanRecords("CLUSTER_SCORING_RULES", sheet.rows, complaintIds, "CC_ID", result.issues);
    }

    if (result.sheet === "RED_FLAG_RULES") {
      validateRedFlagRules(sheet.rows, complaintIds, result.issues);
      detectOrphanRecords("RED_FLAG_RULES", sheet.rows, complaintIds, "CC_ID", result.issues);
    }

    if (result.sheet === "GLOBAL_SECONDARY") {
      validateGlobalSecondary(sheet.rows, result.issues);
    }
  }

  const complaintSheet = workbook.sheets["COMPLAINT_REGISTRY"];
  if (complaintSheet) {
    const registryResult = sheetResults.find((r) => r.sheet === "COMPLAINT_REGISTRY");
    if (registryResult) {
      validateSetIdResolution(
        complaintSheet.rows,
        dispositionSetIds,
        redFlagRuleIds,
        scoringClusterIds,
        templateIds,
        registryResult.issues
      );
    }
  }

  const coreQuestionsSheet = workbook.sheets["CORE_QUESTIONS"];
  if (complaintSheet && coreQuestionsSheet) {
    const cqResult = sheetResults.find((r) => r.sheet === "CORE_QUESTIONS");
    if (cqResult) {
      validateVersionMatching(complaintSheet.rows, coreQuestionsSheet.rows, cqResult.issues);
    }
  }

  const allIssues = sheetResults.flatMap((s) => s.issues);

  const summary = {
    sheetCount: workbook.sheetNames.length,
    checkedSheets: sheetResults.length,
    issueCount: allIssues.length,
    criticalCount: allIssues.filter((i) => i.severity === "critical").length,
    errorCount: allIssues.filter((i) => i.severity === "error").length,
    warningCount: allIssues.filter((i) => i.severity === "warning").length,
    infoCount: allIssues.filter((i) => i.severity === "info").length,
  };

  return {
    ok: summary.criticalCount === 0 && summary.errorCount === 0,
    generatedAt: Date.now(),
    summary,
    sheetResults,
  };
}

import {
  SymptomPackRow,
  ModifierPackRow,
  ClinicianAlgorithmRow,
  IntakeQuestion,
  ModifierRiskAdjustment,
} from "../../shared/packRows";

export interface ValidationIssue {
  severity: "error" | "warning";
  field: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

const allowedDispositions = new Set([
  "self_care",
  "office_followup",
  "telemed_now",
  "urgent_care",
  "er_now",
]);

const allowedQuestionTypes = new Set([
  "yes_no",
  "single_select",
  "multi_select",
  "text",
  "number",
  "duration",
  "severity",
]);

function isValidRuleSyntax(rule: string): boolean {
  const cleaned = rule.trim();

  if (!cleaned) return false;
  if (cleaned === "ANY_RED_FLAG=true") return true;

  const parts = cleaned.split(/\s+(AND|OR)\s+/i);
  return parts.every(part => {
    if (/^(AND|OR)$/i.test(part)) return true;
    return /^[a-zA-Z0-9_]+\s*(=|!=|>=|<=|>|<)\s*.+$/.test(part.trim());
  });
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function validateSymptomPackRow(
  row: SymptomPackRow,
  existingPlanKeys: string[] = []
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!row.id) issues.push({ severity: "error", field: "id", message: "Missing id" });
  if (!row.system) issues.push({ severity: "error", field: "system", message: "Missing system" });
  if (!row.title) issues.push({ severity: "error", field: "title", message: "Missing title" });

  if (!allowedDispositions.has(row.likelyDisposition)) {
    issues.push({
      severity: "error",
      field: "likelyDisposition",
      message: `Invalid disposition: ${row.likelyDisposition}`,
    });
  }

  const questions = safeJsonParse<IntakeQuestion[] | null>(row.questionsJson, null);
  if (!questions || !Array.isArray(questions)) {
    issues.push({
      severity: "error",
      field: "questionsJson",
      message: "questionsJson must be valid JSON array",
    });
  } else {
    const seen = new Set<string>();

    for (const q of questions) {
      if (!q.id) issues.push({ severity: "error", field: "questionsJson", message: "Question missing id" });
      if (!q.prompt) issues.push({ severity: "error", field: "questionsJson", message: `Question ${q.id} missing prompt` });
      if (!allowedQuestionTypes.has(q.type)) {
        issues.push({
          severity: "error",
          field: "questionsJson",
          message: `Question ${q.id} has invalid type ${q.type}`,
        });
      }
      if (typeof q.priority !== "number") {
        issues.push({
          severity: "error",
          field: "questionsJson",
          message: `Question ${q.id} missing numeric priority`,
        });
      }

      if (q.id) {
        if (seen.has(q.id)) {
          issues.push({
            severity: "error",
            field: "questionsJson",
            message: `Duplicate question id ${q.id}`,
          });
        }
        seen.add(q.id);
      }
    }
  }

  for (const rule of row.autoEscalateRules || []) {
    if (!isValidRuleSyntax(rule)) {
      issues.push({
        severity: "error",
        field: "autoEscalateRules",
        message: `Invalid rule syntax: ${rule}`,
      });
    }
  }

  for (const rule of row.autoReviewRules || []) {
    if (!isValidRuleSyntax(rule)) {
      issues.push({
        severity: "error",
        field: "autoReviewRules",
        message: `Invalid rule syntax: ${rule}`,
      });
    }
  }

  if (!row.planTemplateKey) {
    issues.push({
      severity: "warning",
      field: "planTemplateKey",
      message: "Missing plan template key",
    });
  } else if (existingPlanKeys.length > 0 && !existingPlanKeys.includes(row.planTemplateKey)) {
    issues.push({
      severity: "warning",
      field: "planTemplateKey",
      message: `No plan template found for ${row.planTemplateKey}`,
    });
  }

  return {
    ok: !issues.some(x => x.severity === "error"),
    issues,
  };
}

export function validateModifierPackRow(row: ModifierPackRow): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!row.id) issues.push({ severity: "error", field: "id", message: "Missing id" });
  if (!row.system) issues.push({ severity: "error", field: "system", message: "Missing system" });
  if (!row.title) issues.push({ severity: "error", field: "title", message: "Missing title" });

  const adjustments = safeJsonParse<ModifierRiskAdjustment[] | null>(
    row.riskAdjustmentsJson,
    null
  );

  if (!adjustments || !Array.isArray(adjustments)) {
    issues.push({
      severity: "error",
      field: "riskAdjustmentsJson",
      message: "riskAdjustmentsJson must be a valid JSON array",
    });
  } else {
    for (const adj of adjustments) {
      if (!adj.condition || !isValidRuleSyntax(adj.condition)) {
        issues.push({
          severity: "error",
          field: "riskAdjustmentsJson",
          message: `Invalid adjustment condition: ${adj.condition}`,
        });
      }
      if (!["raise_risk", "force_review", "force_escalation"].includes(adj.action)) {
        issues.push({
          severity: "error",
          field: "riskAdjustmentsJson",
          message: `Invalid adjustment action: ${adj.action}`,
        });
      }
      if (!adj.reason) {
        issues.push({
          severity: "warning",
          field: "riskAdjustmentsJson",
          message: `Adjustment missing reason`,
        });
      }
    }
  }

  for (const rule of row.triggers || []) {
    if (!isValidRuleSyntax(rule)) {
      issues.push({
        severity: "error",
        field: "triggers",
        message: `Invalid trigger syntax: ${rule}`,
      });
    }
  }

  return {
    ok: !issues.some(x => x.severity === "error"),
    issues,
  };
}

export function validateClinicianAlgorithmRow(
  row: ClinicianAlgorithmRow
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!row.id) issues.push({ severity: "error", field: "id", message: "Missing id" });
  if (!row.system) issues.push({ severity: "error", field: "system", message: "Missing system" });
  if (!row.title) issues.push({ severity: "error", field: "title", message: "Missing title" });

  for (const rule of row.entryCriteria || []) {
    if (!isValidRuleSyntax(rule)) {
      issues.push({
        severity: "error",
        field: "entryCriteria",
        message: `Invalid entry criterion syntax: ${rule}`,
      });
    }
  }

  if (!row.requiredInputs?.length) {
    issues.push({
      severity: "warning",
      field: "requiredInputs",
      message: "No required inputs listed",
    });
  }

  if (!row.outputActions?.length) {
    issues.push({
      severity: "warning",
      field: "outputActions",
      message: "No output actions listed",
    });
  }

  return {
    ok: !issues.some(x => x.severity === "error"),
    issues,
  };
}

export function validateAnyPackRow(
  row: any,
  existingPlanKeys: string[] = []
): ValidationResult {
  if (row.tier === "symptom") {
    return validateSymptomPackRow(row, existingPlanKeys);
  }
  if (row.tier === "modifier") {
    return validateModifierPackRow(row);
  }
  if (row.tier === "clinician_algorithm") {
    return validateClinicianAlgorithmRow(row);
  }

  return {
    ok: false,
    issues: [{ severity: "error", field: "tier", message: `Unknown tier ${row.tier}` }],
  };
}

type SheetRow = Record<string, any>;

const CC_ID_PATTERN = /^[a-z0-9_]+$/;

interface BadRow {
  idx: number;
  table: string;
  field: string;
  value: string;
  reason: string;
}

function checkFieldFormat(
  value: string,
  pattern: RegExp,
  fieldName: string,
  table: string,
  idx: number,
): BadRow | null {
  const v = String(value ?? "").trim();

  if (!v) {
    return { idx, table, field: fieldName, value: v, reason: "empty" };
  }

  const looksLikePastedRow =
    /\bv\d+\b/.test(v) &&
    /\bQ_[A-Z0-9_]+\b/.test(v) &&
    (v.includes("\t") || /\s{2,}/.test(v));

  if (looksLikePastedRow) {
    return { idx, table, field: fieldName, value: v.substring(0, 80), reason: "pasted_row_corruption" };
  }

  if (/\s/.test(v)) {
    return { idx, table, field: fieldName, value: v.substring(0, 80), reason: "contains_whitespace" };
  }

  if (!pattern.test(v)) {
    return { idx, table, field: fieldName, value: v.substring(0, 80), reason: "invalid_format" };
  }

  return null;
}

export function assertCoreQuestionsNotCorrupt(rows: SheetRow[]): void {
  const bad: BadRow[] = [];

  rows.forEach((r, idx) => {
    const ccCheck = checkFieldFormat(r.CC_ID, CC_ID_PATTERN, "CC_ID", "CORE_QUESTIONS", idx);
    if (ccCheck) bad.push(ccCheck);

    const qId = String(r.Q_ID ?? "").trim();
    if (qId && !/^Q_[A-Z0-9_]+$/.test(qId) && !/^[a-z][a-z0-9_]+$/.test(qId)) {
      bad.push({ idx, table: "CORE_QUESTIONS", field: "Q_ID", value: qId.substring(0, 80), reason: "invalid_format" });
    }
  });

  if (bad.length) {
    const sample = bad
      .slice(0, 10)
      .map(b => `  #${b.idx} ${b.field}="${b.value}" (${b.reason})`)
      .join("\n");
    throw new Error(
      [
        "[CORRUPTION GUARD] CORE_QUESTIONS CORRUPTION DETECTED.",
        "Refusing to load to prevent silent bad rules.",
        `Found ${bad.length} bad row(s). Sample:`,
        sample,
        "Fix: re-export CORE_QUESTIONS; ensure CC_ID contains only lowercase letters, numbers, underscores.",
      ].join("\n")
    );
  }
}

export function assertRedFlagRulesNotCorrupt(rows: SheetRow[]): void {
  const bad: BadRow[] = [];

  rows.forEach((r, idx) => {
    const ccCheck = checkFieldFormat(r.CC_ID, CC_ID_PATTERN, "CC_ID", "RED_FLAG_RULES", idx);
    if (ccCheck) bad.push(ccCheck);

    const rfId = String(r.RF_ID ?? "").trim();
    if (rfId && !/^RF_[A-Z0-9_]+$/.test(rfId)) {
      bad.push({ idx, table: "RED_FLAG_RULES", field: "RF_ID", value: rfId.substring(0, 80), reason: "invalid_format" });
    }

    const action = String(r.ACTION ?? "").trim().toUpperCase();
    if (action && !["ER_SEND", "ESCALATE", "PASS"].includes(action)) {
      bad.push({ idx, table: "RED_FLAG_RULES", field: "ACTION", value: action, reason: "unknown_action" });
    }
  });

  if (bad.length) {
    const sample = bad
      .slice(0, 10)
      .map(b => `  #${b.idx} ${b.field}="${b.value}" (${b.reason})`)
      .join("\n");
    throw new Error(
      [
        "[CORRUPTION GUARD] RED_FLAG_RULES CORRUPTION DETECTED.",
        `Found ${bad.length} bad row(s). Sample:`,
        sample,
      ].join("\n")
    );
  }
}

export function assertDispositionRulesNotCorrupt(rows: SheetRow[]): void {
  const bad: BadRow[] = [];

  rows.forEach((r, idx) => {
    const ccCheck = checkFieldFormat(r.CC_ID, CC_ID_PATTERN, "CC_ID", "DISPOSITION_RULES", idx);
    if (ccCheck) bad.push(ccCheck);

    const dispId = String(r.DISP_RULE_ID ?? "").trim();
    if (dispId && !/^DISP_[A-Z0-9_]+$/.test(dispId)) {
      bad.push({ idx, table: "DISPOSITION_RULES", field: "DISP_RULE_ID", value: dispId.substring(0, 80), reason: "invalid_format" });
    }

    const level = String(r.DISPOSITION_LEVEL ?? "").trim().toLowerCase();
    if (level && !["er_send", "urgent_care", "routine_urgent", "routine", "pcp", "self_care"].includes(level)) {
      bad.push({ idx, table: "DISPOSITION_RULES", field: "DISPOSITION_LEVEL", value: level, reason: "unknown_level" });
    }
  });

  if (bad.length) {
    const sample = bad
      .slice(0, 10)
      .map(b => `  #${b.idx} ${b.field}="${b.value}" (${b.reason})`)
      .join("\n");
    throw new Error(
      [
        "[CORRUPTION GUARD] DISPOSITION_RULES CORRUPTION DETECTED.",
        `Found ${bad.length} bad row(s). Sample:`,
        sample,
      ].join("\n")
    );
  }
}

export function assertOutputTemplatesNotCorrupt(rows: SheetRow[]): void {
  const bad: BadRow[] = [];

  rows.forEach((r, idx) => {
    const ccCheck = checkFieldFormat(r.CC_ID, CC_ID_PATTERN, "CC_ID", "OUTPUT_TEMPLATES", idx);
    if (ccCheck) bad.push(ccCheck);

    const tplId = String(r.TEMPLATE_ID ?? "").trim();
    if (tplId && !/^TPL_[A-Z0-9_]+$/.test(tplId)) {
      bad.push({ idx, table: "OUTPUT_TEMPLATES", field: "TEMPLATE_ID", value: tplId.substring(0, 80), reason: "invalid_format" });
    }

    const body = String(r.BODY ?? "").trim();
    if (!body) {
      bad.push({ idx, table: "OUTPUT_TEMPLATES", field: "BODY", value: "(empty)", reason: "empty_template_body" });
    }
  });

  if (bad.length) {
    const sample = bad
      .slice(0, 10)
      .map(b => `  #${b.idx} ${b.field}="${b.value}" (${b.reason})`)
      .join("\n");
    throw new Error(
      [
        "[CORRUPTION GUARD] OUTPUT_TEMPLATES CORRUPTION DETECTED.",
        `Found ${bad.length} bad row(s). Sample:`,
        sample,
      ].join("\n")
    );
  }
}

export function assertClusterScoringRulesNotCorrupt(rows: SheetRow[]): void {
  const bad: BadRow[] = [];

  rows.forEach((r, idx) => {
    const ccCheck = checkFieldFormat(r.CC_ID, CC_ID_PATTERN, "CC_ID", "CLUSTER_SCORING_RULES", idx);
    if (ccCheck) bad.push(ccCheck);

    const clusterId = String(r.CLUSTER_ID ?? "").trim();
    if (clusterId && !/^CL_[A-Z0-9_]+$/.test(clusterId)) {
      bad.push({ idx, table: "CLUSTER_SCORING_RULES", field: "CLUSTER_ID", value: clusterId.substring(0, 80), reason: "invalid_format" });
    }

    const ruleId = String(r.RULE_ID ?? "").trim();
    if (ruleId && !/^[A-Z0-9_]+$/.test(ruleId)) {
      bad.push({ idx, table: "CLUSTER_SCORING_RULES", field: "RULE_ID", value: ruleId.substring(0, 80), reason: "invalid_format" });
    }

    const points = String(r.POINTS ?? "").trim();
    if (points && isNaN(Number(points))) {
      bad.push({ idx, table: "CLUSTER_SCORING_RULES", field: "POINTS", value: points, reason: "not_a_number" });
    }
  });

  if (bad.length) {
    const sample = bad
      .slice(0, 10)
      .map(b => `  #${b.idx} ${b.field}="${b.value}" (${b.reason})`)
      .join("\n");
    throw new Error(
      [
        "[CORRUPTION GUARD] CLUSTER_SCORING_RULES CORRUPTION DETECTED.",
        `Found ${bad.length} bad row(s). Sample:`,
        sample,
      ].join("\n")
    );
  }
}

export interface ValidationResult {
  table: string;
  rowCount: number;
  issues: BadRow[];
  pass: boolean;
}

export function validateAllTabs(tables: Record<string, SheetRow[]>): ValidationResult[] {
  const results: ValidationResult[] = [];

  const validators: Record<string, (rows: SheetRow[]) => void> = {
    CORE_QUESTIONS: assertCoreQuestionsNotCorrupt,
    RED_FLAG_RULES: assertRedFlagRulesNotCorrupt,
    DISPOSITION_RULES: assertDispositionRulesNotCorrupt,
    OUTPUT_TEMPLATES: assertOutputTemplatesNotCorrupt,
    CLUSTER_SCORING_RULES: assertClusterScoringRulesNotCorrupt,
  };

  for (const [table, rows] of Object.entries(tables)) {
    const validator = validators[table];
    if (!validator) {
      results.push({ table, rowCount: rows.length, issues: [], pass: true });
      continue;
    }

    try {
      validator(rows);
      results.push({ table, rowCount: rows.length, issues: [], pass: true });
    } catch (err: any) {
      results.push({ table, rowCount: rows.length, issues: [{ idx: -1, table, field: "", value: "", reason: err.message }], pass: false });
    }
  }

  return results;
}

export function runCrossTableChecks(tables: Record<string, SheetRow[]>): string[] {
  const warnings: string[] = [];

  const dispRows = tables.DISPOSITION_RULES ?? [];
  const tplRows = tables.OUTPUT_TEMPLATES ?? [];

  const tplIds = new Set(tplRows.map(r => String(r.TEMPLATE_ID ?? "").trim()));
  for (const dr of dispRows) {
    const tplId = String(dr.RATIONALE_TEMPLATE_ID ?? "").trim();
    if (tplId && !tplIds.has(tplId)) {
      warnings.push(`DISPOSITION_RULES refs template '${tplId}' but it doesn't exist in OUTPUT_TEMPLATES`);
    }
  }

  const coreRows = tables.CORE_QUESTIONS ?? [];
  const rfRows = tables.RED_FLAG_RULES ?? [];

  const qIds = new Set(coreRows.map(r => String(r.Q_ID ?? "").trim()));
  for (const rf of rfRows) {
    const expr = String(rf.TRIGGER_EXPR ?? "");
    const refs = expr.match(/answers\.(Q_[A-Z0-9_]+)/g) ?? [];
    for (const ref of refs) {
      const qId = ref.replace("answers.", "");
      if (!qIds.has(qId)) {
        warnings.push(`RED_FLAG_RULES '${rf.RF_ID}' refs '${qId}' not found in CORE_QUESTIONS`);
      }
    }
  }

  for (const dr of dispRows) {
    const expr = String(dr.WHEN_EXPR ?? "");
    const refs = expr.match(/answers\.(Q_[A-Z0-9_]+)/g) ?? [];
    for (const ref of refs) {
      const qId = ref.replace("answers.", "");
      if (!qIds.has(qId)) {
        warnings.push(`DISPOSITION_RULES '${dr.DISP_RULE_ID}' refs '${qId}' not found in CORE_QUESTIONS`);
      }
    }
  }

  const csrRows = tables.CLUSTER_SCORING_RULES ?? [];
  for (const cr of csrRows) {
    const expr = String(cr.WHEN_EXPR ?? "");
    const refs = expr.match(/answers\.(Q_[A-Z0-9_]+)/g) ?? [];
    for (const ref of refs) {
      const qId = ref.replace("answers.", "");
      if (!qIds.has(qId)) {
        warnings.push(`CLUSTER_SCORING_RULES '${cr.RULE_ID}' refs '${qId}' not found in CORE_QUESTIONS`);
      }
    }
  }

  return warnings;
}

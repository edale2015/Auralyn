import fs from "node:fs";
import path from "node:path";

export type ConsistencyAction = "FLAG_ONLY" | "NEEDS_REVIEW" | "FORCE_EMERG";
export type ConsistencySeverity = "LOW" | "MODERATE" | "HIGH";

export type ConsistencyFlag = {
  ruleId: string;
  action: ConsistencyAction;
  severity: ConsistencySeverity;
  message: string;
};

export interface ConsistencyRule {
  ruleId: string;
  appliesTo: string;
  logic: string;
  action: ConsistencyAction;
  severity: ConsistencySeverity;
  message: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function loadConsistencyRules(csvPath: string): ConsistencyRule[] {
  const resolved = path.isAbsolute(csvPath) ? csvPath : path.resolve(process.cwd(), csvPath);
  if (!fs.existsSync(resolved)) {
    console.warn(`[ConsistencyEngine] No rules file at ${resolved}`);
    return [];
  }
  const text = fs.readFileSync(resolved, "utf8").trim();
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]!);
  const idx = (name: string) => header.indexOf(name);
  const iRuleId = idx("Rule_ID");
  const iApplies = idx("Applies_To");
  const iLogic = idx("Logic");
  const iAction = idx("Action");
  const iSeverity = idx("Severity");
  const iMessage = idx("Message");

  const rules: ConsistencyRule[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const ruleId = cols[iRuleId] ?? "";
    if (!ruleId) continue;
    rules.push({
      ruleId,
      appliesTo: cols[iApplies] ?? "*",
      logic: cols[iLogic] ?? "",
      action: (cols[iAction] ?? "FLAG_ONLY") as ConsistencyAction,
      severity: (cols[iSeverity] ?? "LOW") as ConsistencySeverity,
      message: cols[iMessage] ?? "",
    });
  }
  return rules;
}

function evaluateLogic(
  logic: string,
  anyAnswers: Record<string, unknown>,
  triage: { confidence?: string; margin?: number },
): boolean {
  const trimmed = logic.trim();
  if (!trimmed) return false;

  const parts = trimmed.split("&&").map(p => p.trim());
  for (const part of parts) {
    const eqMatch = part.match(/^(\w+)\s*=\s*(.+)$/);
    if (!eqMatch) return false;
    const [, key, rawVal] = eqMatch;
    const val = rawVal!.trim();

    let actual: unknown;
    if (key === "confidence") {
      actual = triage.confidence;
    } else if (key === "margin") {
      actual = triage.margin;
    } else {
      actual = anyAnswers[key!];
    }

    if (val === "true") {
      if (actual !== true && actual !== "yes" && actual !== "true") return false;
    } else if (val === "false") {
      if (actual !== false && actual !== "no" && actual !== "false") return false;
    } else if (val === "LOW" || val === "MODERATE" || val === "HIGH") {
      if (String(actual).toUpperCase() !== val) return false;
    } else {
      const numVal = Number(val);
      if (!isNaN(numVal)) {
        if (Number(actual) !== numVal) return false;
      } else {
        if (String(actual) !== val) return false;
      }
    }
  }

  return true;
}

export function computeConsistencyFlags(params: {
  complaintSlug: string;
  rules: ConsistencyRule[];
  anyAnswers: Record<string, unknown>;
  triage: { confidence?: string; margin?: number };
}): ConsistencyFlag[] {
  const { complaintSlug, rules, anyAnswers, triage } = params;
  const flags: ConsistencyFlag[] = [];

  for (const rule of rules) {
    const applies = rule.appliesTo === "*" || rule.appliesTo === complaintSlug;
    if (!applies) continue;

    const fired = evaluateLogic(rule.logic, anyAnswers, triage);
    if (!fired) continue;

    flags.push({
      ruleId: rule.ruleId,
      action: rule.action,
      severity: rule.severity,
      message: rule.message,
    });
  }

  return flags;
}

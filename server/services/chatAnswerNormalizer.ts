import fs from "fs";
import path from "path";
import type { AnswerValue } from "../../shared/agentTypes";

const YES_TOKENS = new Set(["yes", "y", "yeah", "yep", "true", "sure", "correct", "affirmative"]);
const NO_TOKENS = new Set(["no", "n", "nah", "nope", "false", "negative"]);
const UNSURE_TOKENS = new Set(["not sure", "not_sure", "unsure", "maybe", "idk", "don't know", "dont know", "i don't know", "i dont know", "unknown"]);

const AUDIT_PATH = path.join(
  process.cwd(),
  "data",
  "complaints",
  "runtime",
  "chat_answer_coercion_audit.csv"
);

const AUDIT_HEADERS = "TIMESTAMP,CASE_ID,CC_ID,TOKEN,RAW_ANSWER,PARSED_ANSWER,NORMALIZED_UNIT,CONFIDENCE";

function escCsv(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function appendAuditRow(row: {
  caseId: string;
  ccId: string;
  token: string;
  raw: string;
  parsed: string;
  unit: string;
  confidence: string;
}) {
  try {
    const dir = path.dirname(AUDIT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(AUDIT_PATH)) {
      fs.writeFileSync(AUDIT_PATH, AUDIT_HEADERS + "\n", "utf8");
    }
    const line = [
      new Date().toISOString(),
      escCsv(row.caseId),
      escCsv(row.ccId),
      escCsv(row.token),
      escCsv(row.raw),
      escCsv(row.parsed),
      escCsv(row.unit),
      row.confidence,
    ].join(",");
    fs.appendFileSync(AUDIT_PATH, line + "\n", "utf8");
  } catch {
  }
}

export function normalizeChatAnswer(raw: string): AnswerValue {
  const s = raw.trim().toLowerCase();

  if (YES_TOKENS.has(s)) return "yes";
  if (NO_TOKENS.has(s)) return "no";
  if (UNSURE_TOKENS.has(s)) return "not_sure";

  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
  }

  return raw.trim();
}

export function normalizeChatAnswerWithAudit(
  raw: string,
  context: { caseId: string; ccId: string; token: string }
): AnswerValue {
  const parsed = normalizeChatAnswer(raw);

  let confidence: string;
  let unit = "";

  if (typeof parsed === "number") {
    confidence = "high";
    unit = "numeric";
  } else if (parsed === "yes" || parsed === "no") {
    const s = raw.trim().toLowerCase();
    confidence = s === "yes" || s === "no" ? "high" : "medium";
    unit = "boolean";
  } else if (parsed === "not_sure") {
    confidence = "medium";
    unit = "tri_state";
  } else {
    confidence = "low";
    unit = "string";
  }

  appendAuditRow({
    caseId: context.caseId,
    ccId: context.ccId,
    token: context.token,
    raw,
    parsed: String(parsed),
    unit,
    confidence,
  });

  return parsed;
}

export type AnswerMap = Record<string, string | number | boolean>;

function normalizeExpr(expr: string): string {
  return expr
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'")
    .trim();
}

function replaceAnswers(expr: string, answers: AnswerMap): string {
  let transformed = expr;

  const keys = Object.keys(answers).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const rawVal = answers[key];
    let valueLiteral: string;

    if (typeof rawVal === "string") {
      valueLiteral = JSON.stringify(rawVal);
    } else if (typeof rawVal === "boolean") {
      valueLiteral = rawVal ? "true" : "false";
    } else {
      valueLiteral = String(rawVal);
    }

    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    transformed = transformed.replace(new RegExp(`\\banswers\\.${escaped}\\b`, "g"), valueLiteral);
    transformed = transformed.replace(new RegExp(`(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`, "g"), valueLiteral);
  }

  return transformed;
}

function sanitizeExpr(expr: string): string {
  const allowed = /^[a-zA-Z0-9_ "'().<>=!&|+-]*$/;
  if (!allowed.test(expr)) {
    throw new Error(`Expression contains unsupported characters: ${expr}`);
  }
  return expr;
}

export function evaluateWhenExpr(expr: string, answers: AnswerMap): boolean {
  if (!expr || !expr.trim()) return false;

  const normalized = normalizeExpr(expr);
  const replaced = replaceAnswers(normalized, answers);
  const sanitized = sanitizeExpr(replaced);

  try {
    return Boolean(Function(`"use strict"; return (${sanitized});`)());
  } catch {
    return false;
  }
}

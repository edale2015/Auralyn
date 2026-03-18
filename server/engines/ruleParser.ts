import { AnswerMap } from "../../shared/packRows";

type CompareOp = "=" | "!=" | ">" | "<" | ">=" | "<=";

function normalizeValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function toNumberMaybe(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function evaluateAtomicCondition(
  condition: string,
  answers: AnswerMap,
  context?: { anyRedFlag?: boolean }
): boolean {
  const trimmed = condition.trim();

  if (trimmed === "ANY_RED_FLAG=true") {
    return Boolean(context?.anyRedFlag);
  }

  const match = trimmed.match(/^([a-zA-Z0-9_]+)\s*(=|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) return false;

  const [, key, op, rawExpected] = match;
  const actual = answers[key];
  const expected = rawExpected.trim().toLowerCase();

  const actualNum = toNumberMaybe(actual);
  const expectedNum = toNumberMaybe(expected);

  if (actualNum != null && expectedNum != null) {
    switch (op as CompareOp) {
      case "=": return actualNum === expectedNum;
      case "!=": return actualNum !== expectedNum;
      case ">": return actualNum > expectedNum;
      case "<": return actualNum < expectedNum;
      case ">=": return actualNum >= expectedNum;
      case "<=": return actualNum <= expectedNum;
    }
  }

  const actualNorm = normalizeValue(actual);

  switch (op as CompareOp) {
    case "=": return actualNorm === expected;
    case "!=": return actualNorm !== expected;
    default: return false;
  }
}

function splitByOperator(rule: string, operator: "AND" | "OR"): string[] {
  return rule
    .split(new RegExp(`\\s+${operator}\\s+`, "i"))
    .map(s => s.trim())
    .filter(Boolean);
}

export function evaluateRule(
  rule: string,
  answers: AnswerMap,
  context?: { anyRedFlag?: boolean }
): boolean {
  const orParts = splitByOperator(rule, "OR");
  if (orParts.length > 1) {
    return orParts.some(part => evaluateRule(part, answers, context));
  }

  const andParts = splitByOperator(rule, "AND");
  if (andParts.length > 1) {
    return andParts.every(part => evaluateRule(part, answers, context));
  }

  return evaluateAtomicCondition(rule, answers, context);
}

export function evaluateRules(
  rules: string[],
  answers: AnswerMap,
  context?: { anyRedFlag?: boolean }
): string[] {
  return rules.filter(rule => evaluateRule(rule, answers, context));
}

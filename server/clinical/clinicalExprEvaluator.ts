/**
 * clinicalExprEvaluator.ts
 *
 * Replaces exprMatches() and rowMatchesInput() in clinicalPipelineRoutes.ts
 *
 * The old implementation:
 *   exprMatches("fever AND rash", tokens) → true if tokens has "fever" alone (AND ignored)
 *   exprMatches("NOT chest_pain", tokens) → true when chest_pain IS in tokens (NOT ignored)
 *   exprMatches("O2_sat < 94", tokens)   → token match only, no numeric comparison
 *
 * This module implements a proper recursive-descent evaluator that handles:
 *   - AND / OR / NOT boolean logic with correct precedence
 *   - Numeric thresholds (O2_sat < 94, age > 65)
 *   - Always-true literals (true, always, default, 1)
 *   - Token presence (fever, chest_pain)
 *   - Compound expressions with parentheses
 *
 * MIGRATION:
 *   Replace exprMatches()     → evaluateExpr()
 *   Replace rowMatchesInput() → evaluateRowExpr()  (removes dangerous fallback)
 */

export type ClinicalTokens = Map<string, string | number | boolean>;

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
}

// ─── Token value lookup ───────────────────────────────────────────────────────

function getTokenValue(tokens: ClinicalTokens, key: string): string | number | boolean | undefined {
  return tokens.get(normalizeKey(key));
}

function isTokenPresent(tokens: ClinicalTokens, key: string): boolean {
  const val = getTokenValue(tokens, key);
  if (val === undefined || val === null) return false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number")  return val !== 0;
  const s = String(val).toLowerCase().trim();
  return s === "yes" || s === "true" || s === "1" || s === "present";
}

// ─── Lexer ────────────────────────────────────────────────────────────────────

type TokenType =
  | "LITERAL_TRUE"
  | "NOT"
  | "AND"
  | "OR"
  | "LPAREN"
  | "RPAREN"
  | "COMPARE"
  | "NUMBER"
  | "IDENTIFIER";

interface LexToken {
  type:  TokenType;
  value: string;
}

function lex(expr: string): LexToken[] {
  const tokens: LexToken[] = [];
  const raw = expr.trim();
  let i = 0;

  while (i < raw.length) {
    if (/\s/.test(raw[i])) { i++; continue; }

    if (raw[i] === "(") { tokens.push({ type: "LPAREN",  value: "(" }); i++; continue; }
    if (raw[i] === ")") { tokens.push({ type: "RPAREN",  value: ")" }); i++; continue; }

    const cmpMatch = raw.slice(i).match(/^(<=|>=|!=|<|>|==)/);
    if (cmpMatch) {
      tokens.push({ type: "COMPARE", value: cmpMatch[1] });
      i += cmpMatch[1].length;
      continue;
    }

    const numMatch = raw.slice(i).match(/^[\d.]+/);
    if (numMatch) {
      tokens.push({ type: "NUMBER", value: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }

    const wordMatch = raw.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (wordMatch) {
      const word  = wordMatch[0];
      const lower = word.toLowerCase();
      if (["true", "always", "default"].includes(lower)) {
        tokens.push({ type: "LITERAL_TRUE", value: word });
      } else if (lower === "not" || lower === "!") {
        tokens.push({ type: "NOT", value: word });
      } else if (lower === "and" || lower === "&&") {
        tokens.push({ type: "AND", value: word });
      } else if (lower === "or" || lower === "||") {
        tokens.push({ type: "OR", value: word });
      } else {
        tokens.push({ type: "IDENTIFIER", value: word });
      }
      i += word.length;
      continue;
    }

    i++;
  }

  return tokens;
}

// ─── Parser (recursive descent) ──────────────────────────────────────────────

interface ParseResult {
  value: boolean;
  pos:   number;
}

function parseExpr(tokens: LexToken[], pos: number, clinicalTokens: ClinicalTokens): ParseResult {
  return parseOr(tokens, pos, clinicalTokens);
}

function parseOr(tokens: LexToken[], pos: number, clinicalTokens: ClinicalTokens): ParseResult {
  let left = parseAnd(tokens, pos, clinicalTokens);
  while (left.pos < tokens.length && tokens[left.pos]?.type === "OR") {
    const right = parseAnd(tokens, left.pos + 1, clinicalTokens);
    left = { value: left.value || right.value, pos: right.pos };
  }
  return left;
}

function parseAnd(tokens: LexToken[], pos: number, clinicalTokens: ClinicalTokens): ParseResult {
  let left = parseNot(tokens, pos, clinicalTokens);
  while (left.pos < tokens.length && tokens[left.pos]?.type === "AND") {
    const right = parseNot(tokens, left.pos + 1, clinicalTokens);
    left = { value: left.value && right.value, pos: right.pos };
  }
  return left;
}

function parseNot(tokens: LexToken[], pos: number, clinicalTokens: ClinicalTokens): ParseResult {
  if (tokens[pos]?.type === "NOT") {
    const inner = parseAtom(tokens, pos + 1, clinicalTokens);
    return { value: !inner.value, pos: inner.pos };
  }
  return parseAtom(tokens, pos, clinicalTokens);
}

function parseAtom(tokens: LexToken[], pos: number, clinicalTokens: ClinicalTokens): ParseResult {
  const tok = tokens[pos];
  if (!tok) return { value: false, pos };

  if (tok.type === "LITERAL_TRUE") return { value: true, pos: pos + 1 };

  if (tok.type === "LPAREN") {
    const inner = parseExpr(tokens, pos + 1, clinicalTokens);
    const close = inner.pos;
    return { value: inner.value, pos: tokens[close]?.type === "RPAREN" ? close + 1 : close };
  }

  if (tok.type === "IDENTIFIER") {
    const nextTok = tokens[pos + 1];

    if (nextTok?.type === "COMPARE") {
      const numberTok = tokens[pos + 2];
      if (numberTok?.type === "NUMBER") {
        const currentVal = getTokenValue(clinicalTokens, tok.value);
        const threshold  = Number(numberTok.value);
        const numericVal = typeof currentVal === "number"
          ? currentVal
          : parseFloat(String(currentVal ?? ""));

        if (isNaN(numericVal)) {
          return { value: false, pos: pos + 3 };
        }

        let result = false;
        switch (nextTok.value) {
          case "<":  result = numericVal <  threshold; break;
          case "<=": result = numericVal <= threshold; break;
          case ">":  result = numericVal >  threshold; break;
          case ">=": result = numericVal >= threshold; break;
          case "==": result = numericVal === threshold; break;
          case "!=": result = numericVal !== threshold; break;
        }
        return { value: result, pos: pos + 3 };
      }
    }

    return { value: isTokenPresent(clinicalTokens, tok.value), pos: pos + 1 };
  }

  return { value: false, pos: pos + 1 };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluates a clinical expression string against a token map.
 * Full boolean logic (AND/OR/NOT), numeric thresholds, and parentheses.
 * Replaces exprMatches() — drop-in with correct semantics.
 */
export function evaluateExpr(expr: string | undefined, tokens: ClinicalTokens): boolean {
  const raw = String(expr ?? "").trim();
  if (!raw || raw === "false" || raw === "0" || raw === "never") return false;

  const lower = raw.toLowerCase();
  if (["true", "1", "always", "default"].includes(lower)) return true;

  try {
    const lexed  = lex(raw);
    const result = parseExpr(lexed, 0, tokens);
    return result.value;
  } catch {
    console.warn(`[ClinicalExpr] Parse error for expression: "${raw}" — treating as false`);
    return false;
  }
}

/**
 * Evaluates a sheet row's expression field using the full evaluator.
 * Checks WHEN_EXPR, TRIGGER_EXPR, ASK_IF, CONDITION etc. in order.
 * If no expression field found: returns false (NOT the old "match everything" fallback).
 *
 * Replaces rowMatchesInput() — removes the dangerous full-row token scan fallback.
 */
export function evaluateRowExpr(
  row: Record<string, any>,
  tokens: ClinicalTokens,
  exprFields = ["WHEN_EXPR", "TRIGGER_EXPR", "ASK_IF", "INDICATIONS_CLUSTER", "CONDITION", "CONDITION_ID"]
): boolean {
  for (const field of exprFields) {
    const val = row[field];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return evaluateExpr(String(val), tokens);
    }
  }
  return false;
}

/**
 * Converts legacy Set<string> token format to ClinicalTokens Map.
 * Use during migration to avoid rewriting all call sites at once.
 */
export function legacySetToTokens(tokenSet: Set<string>): ClinicalTokens {
  const map: ClinicalTokens = new Map();
  for (const token of tokenSet) {
    map.set(normalizeKey(token), true);
  }
  return map;
}

/**
 * Build ClinicalTokens from structured patient input.
 * Correct long-term entry point for the pipeline.
 */
export function buildClinicalTokens(input: {
  symptoms?:  string[];
  answers?:   Record<string, string | number | boolean>;
  vitals?:    Record<string, number>;
  modifiers?: Record<string, boolean>;
}): ClinicalTokens {
  const map: ClinicalTokens = new Map();

  for (const s of input.symptoms ?? []) {
    map.set(normalizeKey(s), true);
  }

  for (const [key, val] of Object.entries(input.answers ?? {})) {
    map.set(normalizeKey(key), val);
  }

  for (const [key, val] of Object.entries(input.vitals ?? {})) {
    map.set(normalizeKey(key), val);
  }

  for (const [key, val] of Object.entries(input.modifiers ?? {})) {
    map.set(normalizeKey(key), val);
  }

  return map;
}

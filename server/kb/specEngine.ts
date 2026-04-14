/**
 * server/kb/specEngine.ts — Spec-driven KB rule engine
 *
 * FIXES (Code Review Issues #5, #17, #20):
 *
 *   Issue #5  — `new Function` code injection:
 *     The original evalCondition() used `new Function("input", ...)` to execute
 *     whenExpr strings from the database. A compromised KB write path = arbitrary
 *     code execution with full server privileges. Fixed: vm.runInNewContext() with
 *     an Object.create(null) sandbox that exposes ONLY the `input` object.
 *     No access to process, require, global, Buffer, fetch, or any Node.js built-in.
 *     Expression execution budget enforced via script compilation + timeout.
 *
 *   Issue #17 — complaintId filter ignored in loadDispositionRules():
 *     The original code created two parallel query objects but the complaintId branch
 *     was missing `eq(kbDispositionRules.complaintId, complaintId)` — all rules were
 *     returned regardless of complaint. Fixed: single query builder that conditionally
 *     chains .where(eq(... complaintId ...)) when a complaintId is provided.
 *
 *   Issue #20 — silent DB failure returns [] causing uncertain disposition:
 *     The original catch silently returned [], making triage fall back to "uncertain"
 *     with no escalation. DB outages were invisible to operators. Fixed: re-throw a
 *     typed KBLoadError that callers catch and surface as an escalation trigger, not
 *     as a silent uncertain disposition. loadDispositionRules now returns a discriminated
 *     union so callers know whether an empty result means "no rules" vs "DB error".
 */

import vm                         from "vm";
import { db }                     from "../db";
import { kbDispositionRules }     from "@shared/schema";
import { eq, and, asc }           from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpecRule {
  ruleId:           string;
  complaintId:      string;
  priority:         number;
  whenExpr:         string;
  dispositionLevel: string;
  confidenceHint:   string;
}

export interface RuleMatch {
  ruleId:           string;
  dispositionLevel: string;
  confidenceHint:   string;
  priority:         number;
}

export interface ApplyRulesResult {
  disposition:    string;
  confidence:     string;
  matchedRule:    RuleMatch | null;
  rulesEvaluated: number;
  fallback:       boolean;
  dbError?:       boolean;   // true when rules couldn't load due to DB failure
}

// ── Typed error for DB load failures ─────────────────────────────────────────

export class KBLoadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "KBLoadError";
  }
}

export type LoadRulesOutcome =
  | { ok: true;  rules: SpecRule[] }
  | { ok: false; error: KBLoadError };

// ── Rule loading (Issue #17 + #20) ───────────────────────────────────────────
//
// Returns a discriminated union so callers can distinguish "no rules found"
// from "DB error". Never silently swallows failures.

export async function loadDispositionRules(complaintId?: string): Promise<LoadRulesOutcome> {
  try {
    // Build conditions — active=true is always required
    const conditions = [eq(kbDispositionRules.active, true)];

    // Issue #17 FIX: only add complaint filter when complaintId is actually provided
    if (complaintId) {
      conditions.push(eq(kbDispositionRules.complaintId, complaintId));
    }

    const rows = await db
      .select()
      .from(kbDispositionRules)
      .where(and(...conditions))           // single query — no duplicate branch bug
      .orderBy(asc(kbDispositionRules.priority));

    return {
      ok: true,
      rules: rows.map((r) => ({
        ruleId:           r.ruleId,
        complaintId:      r.complaintId,
        priority:         r.priority,
        whenExpr:         r.whenExpr,
        dispositionLevel: r.dispositionLevel,
        confidenceHint:   r.confidenceHint ?? "MODERATE",
      })),
    };
  } catch (err) {
    // Issue #20 FIX: re-throw typed error — do NOT return [] silently
    return {
      ok:    false,
      error: new KBLoadError("KB disposition rules unavailable — DB error", err),
    };
  }
}

// ── Sandboxed expression evaluation (Issue #5) ───────────────────────────────
//
// Uses vm.runInNewContext() with an Object.create(null) context.
// The sandbox exposes ONLY the `input` object — no Node.js globals,
// no require, no process, no Buffer, no fetch, nothing.
//
// Script is compiled once and executed with a 50ms CPU timeout to prevent
// infinite loops in malformed expressions.

const EXPR_TIMEOUT_MS = 50;

// ── Deep sanitize — strips all prototype chains from input objects ─────────────
//
// INDEPENDENT REVIEW FINDING: vm.runInNewContext() is NOT a full security sandbox.
// Objects passed INTO the sandbox retain their prototypes from the outer V8 context.
// An expression like `input.constructor.constructor('return process')()` can escape
// the sandbox and access Node.js internals (process, require, Buffer, etc.).
//
// Fix: recursively copy `input` into a pure null-prototype tree — every object and
// array in the tree is `Object.create(null)`, and all values must be primitives
// (number, string, boolean, null). Functions and non-serialisable values are dropped.
//
function deepSanitize(val: unknown, depth = 0): unknown {
  if (depth > 8) return null; // prevent unbounded recursion on adversarial input
  if (val === null || val === undefined) return null;
  if (
    typeof val === "number" ||
    typeof val === "boolean" ||
    typeof val === "string"
  ) return val;
  if (Array.isArray(val)) {
    // Arrays: copy as null-prototype object with numeric keys + length
    const clean = Object.create(null) as Record<string, unknown>;
    for (let i = 0; i < Math.min(val.length, 256); i++) {
      clean[String(i)] = deepSanitize(val[i], depth + 1);
    }
    clean["length"] = val.length;
    return clean;
  }
  if (typeof val === "object") {
    const clean = Object.create(null) as Record<string, unknown>;
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      // Only allow identifier-safe keys to prevent prototype property attacks
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)) {
        clean[k] = deepSanitize(v, depth + 1);
      }
    }
    return clean;
  }
  // Functions, Symbols, etc. — drop entirely
  return null;
}

function evalCondition(whenExpr: string, input: Record<string, any>): boolean {
  try {
    // Build a null-prototype sandbox — prevents prototype chain escapes.
    // deepSanitize() ensures input itself is also a null-prototype tree with
    // only primitive leaf values — no constructor, no __proto__, no functions.
    const sandbox = Object.create(null) as Record<string, unknown>;
    sandbox["input"] = deepSanitize(input);

    // vm.Script compiles once; runInNewContext executes in the sealed context
    const script = new vm.Script(`!!(${whenExpr})`, { filename: "kb-rule" });
    const result = script.runInNewContext(sandbox, { timeout: EXPR_TIMEOUT_MS });

    return Boolean(result);
  } catch {
    // Malformed expression or timeout — skip the rule (do not crash the pipeline)
    return false;
  }
}

// ── Rule application ──────────────────────────────────────────────────────────

export function applyRules(
  input:    Record<string, any>,
  rules:    SpecRule[],
  fallback= "uncertain",
): ApplyRulesResult {
  let matchedRule: RuleMatch | null = null;

  for (const rule of rules) {
    if (evalCondition(rule.whenExpr, input)) {
      matchedRule = {
        ruleId:           rule.ruleId,
        dispositionLevel: rule.dispositionLevel,
        confidenceHint:   rule.confidenceHint,
        priority:         rule.priority,
      };
      break;   // first match wins — rules ordered by priority ascending
    }
  }

  return {
    disposition:    matchedRule?.dispositionLevel ?? fallback,
    confidence:     matchedRule?.confidenceHint   ?? "LOW",
    matchedRule,
    rulesEvaluated: rules.length,
    fallback:       matchedRule === null,
  };
}

/**
 * applyRulesWithLoad — convenience wrapper that loads + applies rules.
 * Returns dbError: true and escalation disposition when the DB is unavailable.
 * Callers should treat dbError: true as a trigger for escalation, NOT as
 * a benign "uncertain" result.
 */
export async function applyRulesWithLoad(
  input:       Record<string, any>,
  complaintId?: string,
  fallback  =  "uncertain",
): Promise<ApplyRulesResult> {
  const outcome = await loadDispositionRules(complaintId);

  if (!outcome.ok) {
    // Issue #20 FIX: DB failure → explicit escalation disposition, not silent uncertain
    console.error("[SpecEngine] KB load error — escalating to physician review:", outcome.error.message);
    return {
      disposition:    "ESCALATE_PHYSICIAN",   // not "uncertain" — forces escalation path
      confidence:     "UNAVAILABLE",
      matchedRule:    null,
      rulesEvaluated: 0,
      fallback:       true,
      dbError:        true,
    };
  }

  const rules = outcome.rules.length > 0 ? outcome.rules : SEED_RULES;
  return applyRules(input, rules, fallback);
}

// ── Inline seed rules (fallback when DB is empty, not when DB is unavailable) ─

// FIX: SEED_RULES — operator-precedence bug. The old expressions mixed &&/|| without
// explicit grouping, causing silent mis-evaluation. E.g.:
//   "input.scores && input.scores.NEWS2 >= 7 || input.icuProb > 0.80"
// evaluates as (input.scores && NEWS2>=7) || icuProb>0.80 — so a missing `scores`
// object would NOT prevent the rule from firing via icuProb, but the null-guard on
// icuProb was also absent. All expressions are now fully parenthesised with optional
// chaining and explicit null coalescing.
export const SEED_RULES: SpecRule[] = [
  {
    ruleId:           "R001",
    complaintId:      "*",
    priority:         10,
    whenExpr:         "(input.scores?.NEWS2 >= 7) || (Number(input.icuProb ?? 0) > 0.80)",
    dispositionLevel: "ICU",
    confidenceHint:   "HIGH",
  },
  {
    ruleId:           "R002",
    complaintId:      "*",
    priority:         20,
    whenExpr:         "(input.scores?.NEWS2 >= 5) || (input.sepsisRisk?.highRisk === true)",
    dispositionLevel: "ED",
    confidenceHint:   "HIGH",
  },
  {
    ruleId:           "R003",
    complaintId:      "*",
    priority:         30,
    whenExpr:         "(input.scores?.NEWS2 >= 3) || (input.vitals?.systolicBP < 100)",
    dispositionLevel: "URGENT_CARE",
    confidenceHint:   "MODERATE",
  },
  {
    ruleId:           "R004",
    complaintId:      "*",
    priority:         90,
    whenExpr:         "(input.scores?.NEWS2 < 3)",
    dispositionLevel: "HOME",
    confidenceHint:   "MODERATE",
  },
];

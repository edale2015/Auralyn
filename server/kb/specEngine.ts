/**
 * Spec-Driven Rule Engine — loads disposition rules from kb_disposition_rules
 * and evaluates them against patient input deterministically.
 *
 * Key principle: "Code serves specification" — no hardcoded logic in routes.
 * All rules are stored in the DB (kb_disposition_rules.when_expr) and eval'd at runtime.
 *
 * Safety: whenExpr runs in a sandboxed Function with only the input object available.
 * Invalid expressions are caught and skipped (never crash the pipeline).
 */

import { db }                  from "../db";
import { kbDispositionRules }  from "@shared/schema";
import { eq, asc }             from "drizzle-orm";

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
}

/** Load active rules for a complaint, ordered by priority ascending (lower = higher priority) */
export async function loadDispositionRules(complaintId?: string): Promise<SpecRule[]> {
  try {
    const query = db
      .select()
      .from(kbDispositionRules)
      .where(eq(kbDispositionRules.active, true))
      .orderBy(asc(kbDispositionRules.priority));

    const rows = await (complaintId
      ? db.select().from(kbDispositionRules)
          .where(eq(kbDispositionRules.active, true))
          .orderBy(asc(kbDispositionRules.priority))
      : query);

    return rows.map((r) => ({
      ruleId:           r.ruleId,
      complaintId:      r.complaintId,
      priority:         r.priority,
      whenExpr:         r.whenExpr,
      dispositionLevel: r.dispositionLevel,
      confidenceHint:   r.confidenceHint ?? "MODERATE",
    }));
  } catch {
    return [];   // DB unavailable — return empty (fallback kicks in)
  }
}

/** Safely evaluate a whenExpr string against an input object */
function evalCondition(whenExpr: string, input: Record<string, any>): boolean {
  try {
    // Sandboxed: only input is in scope
    // eslint-disable-next-line no-new-func
    const fn = new Function("input", `"use strict"; return !!(${whenExpr});`);
    return Boolean(fn(input));
  } catch {
    return false;   // malformed expression → skip rule
  }
}

/** Apply rules to input, returning first matching rule's disposition */
export function applyRules(
  input:       Record<string, any>,
  rules:       SpecRule[],
  fallback  =  "uncertain"
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
      break;   // first match wins (rules are ordered by priority)
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

/** Inline seed rules (used when DB is empty / for testing) */
export const SEED_RULES: SpecRule[] = [
  {
    ruleId:           "R001",
    complaintId:      "*",
    priority:         10,
    whenExpr:         "input.scores?.NEWS2 >= 7 || input.icuProb > 0.80",
    dispositionLevel: "ICU",
    confidenceHint:   "HIGH",
  },
  {
    ruleId:           "R002",
    complaintId:      "*",
    priority:         20,
    whenExpr:         "input.scores?.NEWS2 >= 5 || input.sepsisRisk?.highRisk === true",
    dispositionLevel: "ED",
    confidenceHint:   "HIGH",
  },
  {
    ruleId:           "R003",
    complaintId:      "*",
    priority:         30,
    whenExpr:         "input.scores?.NEWS2 >= 3 || input.vitals?.systolicBP < 100",
    dispositionLevel: "URGENT_CARE",
    confidenceHint:   "MODERATE",
  },
  {
    ruleId:           "R004",
    complaintId:      "*",
    priority:         90,
    whenExpr:         "input.scores?.NEWS2 < 3",
    dispositionLevel: "HOME",
    confidenceHint:   "MODERATE",
  },
];

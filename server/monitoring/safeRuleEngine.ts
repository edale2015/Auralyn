/**
 * safeRuleEngine.ts — Structured, injection-safe alert rule evaluator
 *
 * Replaces the original new Function() approach in alertRules.ts.
 * Rules are expressed as structured objects (metric + operator + value)
 * rather than free-form expressions.
 *
 * No eval, no vm, no dynamic code execution of any kind.
 * An operator that can POST rules cannot achieve code execution.
 */

export type Operator = ">" | "<" | ">=" | "<=" | "==" | "!=";

export interface SafeRule {
  metric:   string;
  operator: Operator;
  value:    number;
}

const VALID_OPERATORS = new Set<string>([">", "<", ">=", "<=", "==", "!="]);

/**
 * Validate that a rule is well-formed before storing it.
 * Returns null if valid, or an error string if not.
 */
export function validateSafeRule(rule: unknown): string | null {
  if (!rule || typeof rule !== "object") return "Rule must be an object";
  const r = rule as Record<string, unknown>;

  if (typeof r.metric !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(r.metric)) {
    return `Invalid metric name: ${r.metric}`;
  }
  if (!VALID_OPERATORS.has(r.operator as string)) {
    return `Invalid operator: ${r.operator}. Must be one of: ${[...VALID_OPERATORS].join(", ")}`;
  }
  if (typeof r.value !== "number" || !isFinite(r.value)) {
    return `Invalid value: ${r.value}. Must be a finite number`;
  }
  return null;
}

/**
 * Evaluate a structured rule against a metric snapshot.
 * Returns false for any unknown metric (fail-closed).
 */
export function evaluateSafeRule(
  rule: SafeRule,
  metrics: Record<string, number>
): boolean {
  const metricValue = metrics[rule.metric];
  if (metricValue === undefined || !isFinite(metricValue)) return false;

  switch (rule.operator) {
    case ">":  return metricValue >  rule.value;
    case "<":  return metricValue <  rule.value;
    case ">=": return metricValue >= rule.value;
    case "<=": return metricValue <= rule.value;
    case "==": return metricValue === rule.value;
    case "!=": return metricValue !== rule.value;
    default:   return false;
  }
}

/**
 * Evaluate a list of SafeRules against metrics.
 * Returns the list of rule IDs that fired.
 * Errors per-rule are logged and do not break the overall evaluation.
 */
export function evaluateAllRules(
  rules: Array<SafeRule & { id: string }>,
  metrics: Record<string, number>
): string[] {
  const fired: string[] = [];
  for (const rule of rules) {
    try {
      if (evaluateSafeRule(rule, metrics)) {
        fired.push(rule.id);
      }
    } catch (err: any) {
      console.error(`[SafeRuleEngine] Rule ${rule.id} evaluation error: ${err?.message ?? err}`);
    }
  }
  return fired;
}

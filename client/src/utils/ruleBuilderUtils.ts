import { RuleClause, RuleGroup } from "../types/ruleBuilder";

export function stringifyRuleGroup(group: RuleGroup): string {
  return group.clauses
    .map(c => `${c.field}${c.operator}${c.value}`)
    .join(` ${group.joiner} `);
}

export function parseSimpleRuleToGroup(rule: string): RuleGroup {
  const joiner: "AND" | "OR" = /\s+OR\s+/i.test(rule) ? "OR" : "AND";
  const parts = rule.split(new RegExp(`\\s+${joiner}\\s+`, "i"));

  const clauses: RuleClause[] = parts.map(part => {
    const m = part.match(/^([a-zA-Z0-9_]+)\s*(=|!=|>=|<=|>|<)\s*(.+)$/);
    if (!m) {
      return { field: "", operator: "=" as const, value: "" };
    }
    return {
      field: m[1],
      operator: m[2] as RuleClause["operator"],
      value: m[3],
    };
  });

  return { clauses, joiner };
}

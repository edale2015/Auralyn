export type RuleOperator = "=" | "!=" | ">" | "<" | ">=" | "<=";
export type RuleJoiner = "AND" | "OR";

export interface RuleClause {
  field: string;
  operator: RuleOperator;
  value: string;
}

export interface RuleGroup {
  clauses: RuleClause[];
  joiner: RuleJoiner;
}

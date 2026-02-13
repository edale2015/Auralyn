import { getTable } from "../data/registry";

export type RuleActionType =
  | "ADD_BUNDLE"
  | "SET_CLUSTER"
  | "TRIAGE_UPGRADE"
  | "FLAG_DX"
  | "MED_CONTRA_FLAG"
  | "NOOP";

export type TriggerLevel =
  | "MODIFIER_GATE"
  | "SYMPTOM_GATE"
  | "RED_FLAG_GATE";

export interface RuleTriggerRow {
  ruleId: string;
  system: string;
  chiefComplaint: string;
  cluster: string;
  triggerLevel: TriggerLevel;
  triggerModifier: string;
  conditionExpression: string;
  actionType: RuleActionType;
  actionValue: string;
  priority: number;
  notes: string;
}

export interface RuleAction {
  ruleId: string;
  triggerLevel: TriggerLevel;
  actionType: RuleActionType;
  actionValue: string;
  detail: string;
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

function rowToRule(row: Record<string, any>): RuleTriggerRow {
  return {
    ruleId: norm(row.Rule_ID),
    system: norm(row.System).toUpperCase(),
    chiefComplaint: norm(row.Chief_Complaint).toLowerCase().replace(/[\s-]+/g, "_"),
    cluster: norm(row.Cluster).toUpperCase().replace(/[\s-]+/g, "_"),
    triggerLevel: (norm(row.Trigger_Level).toUpperCase() || "SYMPTOM_GATE") as TriggerLevel,
    triggerModifier: norm(row.Trigger_Modifier),
    conditionExpression: norm(row.Condition_Expression),
    actionType: (norm(row.Action_Type).toUpperCase() || "NOOP") as RuleActionType,
    actionValue: norm(row.Action_Value),
    priority: Number(row.Priority) || 100,
    notes: norm(row.Notes),
  };
}

export async function getRulesForContext(
  system: string,
  chiefComplaint: string,
  cluster?: string
): Promise<RuleTriggerRow[]> {
  const allRules = await getTable("RULESTRIGGERS");
  const parsed = allRules.map(rowToRule).filter(r => r.ruleId);

  const sysNorm = system.toUpperCase();
  const ccNorm = chiefComplaint.toLowerCase().replace(/[\s-]+/g, "_");

  return parsed.filter(r => {
    if (r.system && r.system !== sysNorm) return false;
    if (r.chiefComplaint && r.chiefComplaint !== ccNorm) return false;
    if (cluster && r.cluster && r.cluster !== cluster.toUpperCase().replace(/[\s-]+/g, "_")) return false;
    return true;
  }).sort((a, b) => a.priority - b.priority);
}

function evaluateCondition(
  expression: string,
  modifiers: Record<string, any>,
  answers: Record<string, any>
): boolean {
  if (!expression) return true;

  const parts = expression.split("&&").map(p => p.trim());

  for (const part of parts) {
    const eqMatch = part.match(/^(\w+)\s*==\s*(.+)$/);
    if (eqMatch) {
      const [, field, expected] = eqMatch;
      const val = modifiers[field] ?? answers[field];
      const exp = expected.replace(/^["']|["']$/g, "");
      if (String(val).toLowerCase() !== exp.toLowerCase()) return false;
      continue;
    }

    const neqMatch = part.match(/^(\w+)\s*!=\s*(.+)$/);
    if (neqMatch) {
      const [, field, expected] = neqMatch;
      const val = modifiers[field] ?? answers[field];
      const exp = expected.replace(/^["']|["']$/g, "");
      if (String(val).toLowerCase() === exp.toLowerCase()) return false;
      continue;
    }

    const boolMatch = part.match(/^(\w+)$/);
    if (boolMatch) {
      const val = modifiers[boolMatch[1]] ?? answers[boolMatch[1]];
      if (!val || val === "no" || val === "false" || val === false) return false;
      continue;
    }

    const notMatch = part.match(/^!(\w+)$/);
    if (notMatch) {
      const val = modifiers[notMatch[1]] ?? answers[notMatch[1]];
      if (val && val !== "no" && val !== "false" && val !== false) return false;
      continue;
    }
  }

  return true;
}

export function executeRules(
  rules: RuleTriggerRow[],
  triggerLevel: TriggerLevel,
  modifiers: Record<string, any>,
  answers: Record<string, any>
): RuleAction[] {
  const actions: RuleAction[] = [];
  const filtered = rules.filter(r => r.triggerLevel === triggerLevel);

  for (const rule of filtered) {
    const condMet = evaluateCondition(rule.conditionExpression, modifiers, answers);
    if (!condMet) continue;

    if (rule.triggerModifier) {
      const modVal = modifiers[rule.triggerModifier] ?? answers[rule.triggerModifier];
      if (!modVal || modVal === "no" || modVal === "false" || modVal === false) continue;
    }

    actions.push({
      ruleId: rule.ruleId,
      triggerLevel: rule.triggerLevel,
      actionType: rule.actionType,
      actionValue: rule.actionValue,
      detail: `Rule ${rule.ruleId}: ${rule.actionType}(${rule.actionValue}) [${rule.notes}]`,
    });
  }

  return actions;
}

export function applyRuleActions(
  actions: RuleAction[],
  state: {
    activeClusters: string[];
    questionBundles: string[];
    triageTarget?: string;
    flaggedDx: string[];
    medContraFlags: string[];
  }
): typeof state {
  const updated = { ...state };

  for (const action of actions) {
    switch (action.actionType) {
      case "ADD_BUNDLE":
        if (!updated.questionBundles.includes(action.actionValue)) {
          updated.questionBundles.push(action.actionValue);
        }
        break;
      case "SET_CLUSTER":
        if (!updated.activeClusters.includes(action.actionValue)) {
          updated.activeClusters.push(action.actionValue);
        }
        break;
      case "TRIAGE_UPGRADE":
        updated.triageTarget = action.actionValue;
        break;
      case "FLAG_DX":
        if (!updated.flaggedDx.includes(action.actionValue)) {
          updated.flaggedDx.push(action.actionValue);
        }
        break;
      case "MED_CONTRA_FLAG":
        if (!updated.medContraFlags.includes(action.actionValue)) {
          updated.medContraFlags.push(action.actionValue);
        }
        break;
    }
  }

  return updated;
}

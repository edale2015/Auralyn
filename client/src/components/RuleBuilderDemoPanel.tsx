import { useEffect, useState, useCallback } from "react";
import { RuleBuilder } from "./RuleBuilder";
import { parseSimpleRuleToGroup, stringifyRuleGroup } from "../utils/ruleBuilderUtils";
import { RuleGroup } from "../types/ruleBuilder";

export function RuleBuilderDemoPanel({
  initialRule,
  availableFields,
  onRuleChange,
}: {
  initialRule: string;
  availableFields: string[];
  onRuleChange: (rule: string) => void;
}) {
  const [group, setGroup] = useState<RuleGroup>(parseSimpleRuleToGroup(initialRule));

  useEffect(() => {
    setGroup(parseSimpleRuleToGroup(initialRule));
  }, [initialRule]);

  const handleChange = useCallback((next: RuleGroup) => {
    setGroup(next);
    onRuleChange(stringifyRuleGroup(next));
  }, [onRuleChange]);

  return (
    <div data-testid="rule-builder-demo-panel">
      <h3 className="text-sm font-semibold mb-2">Visual Rule Builder</h3>
      <RuleBuilder
        value={group}
        onChange={handleChange}
        availableFields={availableFields}
      />
      <div className="mt-2 text-xs text-muted-foreground font-mono" data-testid="rule-preview">
        {stringifyRuleGroup(group)}
      </div>
    </div>
  );
}

import { RuleClause, RuleGroup } from "../types/ruleBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export function RuleBuilder({
  value,
  onChange,
  availableFields,
}: {
  value: RuleGroup;
  onChange: (next: RuleGroup) => void;
  availableFields: string[];
}) {
  function updateClause(index: number, patch: Partial<RuleClause>) {
    const next = {
      ...value,
      clauses: value.clauses.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    };
    onChange(next);
  }

  function addClause() {
    onChange({
      ...value,
      clauses: [...value.clauses, { field: "", operator: "=", value: "" }],
    });
  }

  function removeClause(index: number) {
    onChange({
      ...value,
      clauses: value.clauses.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="border rounded-lg p-4 space-y-3" data-testid="rule-builder">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Join with:</span>
        <Select
          value={value.joiner}
          onValueChange={(v) => onChange({ ...value, joiner: v as "AND" | "OR" })}
        >
          <SelectTrigger className="w-24" data-testid="rule-joiner-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">AND</SelectItem>
            <SelectItem value="OR">OR</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {value.clauses.map((clause, index) => (
          <div key={index} className="flex items-center gap-2" data-testid={`rule-clause-${index}`}>
            {availableFields.length > 0 ? (
              <Select
                value={clause.field}
                onValueChange={(v) => updateClause(index, { field: v })}
              >
                <SelectTrigger className="w-40" data-testid={`clause-field-${index}`}>
                  <SelectValue placeholder="Field" />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={clause.field}
                onChange={(e) => updateClause(index, { field: e.target.value })}
                placeholder="field"
                className="w-40"
                data-testid={`clause-field-input-${index}`}
              />
            )}

            <Select
              value={clause.operator}
              onValueChange={(v) => updateClause(index, { operator: v as RuleClause["operator"] })}
            >
              <SelectTrigger className="w-20" data-testid={`clause-op-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="=">=</SelectItem>
                <SelectItem value="!=">!=</SelectItem>
                <SelectItem value=">">{">"}</SelectItem>
                <SelectItem value="<">{"<"}</SelectItem>
                <SelectItem value=">=">{">="}</SelectItem>
                <SelectItem value="<=">{"<="}</SelectItem>
              </SelectContent>
            </Select>

            <Input
              value={clause.value}
              onChange={(e) => updateClause(index, { value: e.target.value })}
              placeholder="value"
              className="w-32"
              data-testid={`clause-value-${index}`}
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeClause(index)}
              data-testid={`clause-remove-${index}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>

            {index < value.clauses.length - 1 && (
              <span className="text-xs text-muted-foreground font-medium">{value.joiner}</span>
            )}
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={addClause} data-testid="add-clause-btn">
        <Plus className="h-4 w-4 mr-1" /> Add Clause
      </Button>
    </div>
  );
}

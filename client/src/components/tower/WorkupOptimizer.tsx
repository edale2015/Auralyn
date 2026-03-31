import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, DollarSign, Clock, Target } from "lucide-react";

export interface WorkupCandidate {
  testName: string;
  cost: number;
  utility: number;
  riskScore: number;
  sensitivity: number | null;
  specificity: number | null;
  turnaroundMinutes: number | null;
}

export interface WorkupResult {
  recommended: WorkupCandidate[];
  excluded: WorkupCandidate[];
  totalCost: number;
  budget: number;
  trace: Array<{ testName: string; utilityScore: number; reason: string }>;
}

interface Props {
  workup: WorkupResult;
}

function fmtMin(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}

function TestRow({ t, recommended }: { t: WorkupCandidate; recommended: boolean }) {
  return (
    <div
      data-testid={`workup-row-${t.testName.replace(/\s/g, "-")}`}
      className={`rounded-lg border p-3 transition-all ${recommended ? "border-green-300 bg-green-50 dark:bg-green-950 dark:border-green-700" : "border-gray-200 bg-muted/30 opacity-60"}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {recommended
            ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            : <XCircle className="h-4 w-4 text-gray-400 shrink-0" />}
          <span className="text-sm font-medium">{t.testName}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="outline" className="text-xs py-0 gap-1">
            <DollarSign className="h-2.5 w-2.5" />{t.cost.toFixed(0)}
          </Badge>
          {t.turnaroundMinutes != null && (
            <Badge variant="secondary" className="text-xs py-0 gap-1">
              <Clock className="h-2.5 w-2.5" />{fmtMin(t.turnaroundMinutes)}
            </Badge>
          )}
          <Badge
            className={`text-xs py-0 ${recommended ? "bg-green-600" : "bg-gray-400"}`}
          >
            IG: {t.utility.toFixed(3)}
          </Badge>
        </div>
      </div>
      <div className="flex gap-3 mt-1.5 ml-6 text-xs text-muted-foreground">
        {t.sensitivity != null && <span>Sens: {(t.sensitivity * 100).toFixed(0)}%</span>}
        {t.specificity != null && <span>Spec: {(t.specificity * 100).toFixed(0)}%</span>}
        {t.riskScore > 0 && <span className="text-orange-500">Risk: -{t.riskScore.toFixed(2)}</span>}
      </div>
    </div>
  );
}

export default function WorkupOptimizer({ workup }: Props) {
  const utilization = ((workup.totalCost / workup.budget) * 100).toFixed(0);

  return (
    <div className="space-y-4" data-testid="workup-optimizer">
      {/* Budget summary */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Workup Budget</span>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">
            ${workup.totalCost.toFixed(0)} / ${workup.budget.toFixed(0)}
          </p>
          <p className="text-xs text-muted-foreground">{utilization}% utilized</p>
        </div>
      </div>

      {workup.recommended.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No tests recommended — seed kb_workup_costs and kb_test_utility data first.
        </div>
      )}

      {/* Recommended */}
      {workup.recommended.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-400 mb-2">
            Recommended ({workup.recommended.length})
          </p>
          <div className="space-y-2">
            {workup.recommended.map(t => (
              <TestRow key={t.testName} t={t} recommended />
            ))}
          </div>
        </div>
      )}

      {/* Excluded */}
      {workup.excluded.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Excluded ({workup.excluded.length})
          </p>
          <div className="space-y-1.5">
            {workup.excluded.slice(0, 5).map(t => (
              <TestRow key={t.testName} t={t} recommended={false} />
            ))}
            {workup.excluded.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                +{workup.excluded.length - 5} more excluded
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

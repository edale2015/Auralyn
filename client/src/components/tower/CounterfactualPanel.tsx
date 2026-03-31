import { Badge } from "@/components/ui/badge";
import { ArrowRight, FlipHorizontal, Zap } from "lucide-react";

export interface CounterfactualSuggestion {
  feature: string;
  featureType: string;
  currentValue: unknown;
  proposedChange: unknown;
  currentTopDx: string;
  newTopDx: string;
  impact: "diagnosis_flip" | "rank_change" | "score_change";
  posteriorShift: number;
}

const IMPACT_STYLE: Record<string, string> = {
  diagnosis_flip: "border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-700",
  rank_change: "border-orange-300 bg-orange-50 dark:bg-orange-950",
  score_change: "border-yellow-300 bg-yellow-50 dark:bg-yellow-950",
};

const IMPACT_LABEL: Record<string, string> = {
  diagnosis_flip: "Dx Flip",
  rank_change: "Rank Change",
  score_change: "Score Change",
};

interface Props {
  counterfactuals: CounterfactualSuggestion[];
}

export default function CounterfactualPanel({ counterfactuals }: Props) {
  if (!counterfactuals.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2" data-testid="no-counterfactuals">
        <FlipHorizontal className="h-8 w-8 opacity-40" />
        <p className="text-sm text-center">No counterfactuals generated. Ensure kb_feature_models has boolean or numeric entries for the top diagnosis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="counterfactual-panel">
      <p className="text-xs text-muted-foreground">
        "What-if" scenarios — which single feature change would most alter the diagnosis?
      </p>
      {counterfactuals.map((c, i) => (
        <div
          key={i}
          data-testid={`counterfactual-row-${i}`}
          className={`rounded-lg border-2 p-3 ${IMPACT_STYLE[c.impact] ?? "border-gray-200 bg-card"}`}
        >
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-bold">{c.feature.replace(/_/g, " ")}</span>
              <Badge variant="outline" className="text-xs py-0">{c.featureType}</Badge>
            </div>
            <div className="flex items-center gap-1">
              <Badge className="text-xs py-0">{IMPACT_LABEL[c.impact]}</Badge>
              <Badge variant="secondary" className="text-xs py-0">
                Δ{(c.posteriorShift * 100).toFixed(1)}%
              </Badge>
            </div>
          </div>

          {/* Value change */}
          <div className="flex items-center gap-2 text-xs mb-2 ml-6">
            <span className="px-2 py-0.5 rounded bg-background border font-mono">
              {String(c.currentValue ?? "—")}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="px-2 py-0.5 rounded bg-background border font-mono text-blue-700 dark:text-blue-300">
              {String(c.proposedChange ?? "—")}
            </span>
          </div>

          {/* Dx flip */}
          <div className="flex items-center gap-2 text-xs ml-6">
            <span className="text-muted-foreground">Diagnosis:</span>
            <span className="font-medium">{c.currentTopDx}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-bold text-blue-700 dark:text-blue-300">{c.newTopDx}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

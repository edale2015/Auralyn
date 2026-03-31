import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown } from "lucide-react";

interface DxEntry {
  ruleId: string;
  label: string;
  posterior: number;
  score: number;
  source: string;
}

interface FeatureContrib {
  feature: string;
  logContribution: number;
  contribution: "positive" | "negative" | "neutral";
  value: unknown;
  type: string;
}

interface RuleHit {
  action: string;
  minConfidence: number;
  description: string | null;
}

export interface ScoringData {
  topDx: string;
  topDxId: string;
  posterior: number;
  uncertainty: number;
  margin: number;
  disposition: string;
  ruleHits: RuleHit[];
  floorApplied: boolean;
  floorSource: string | null;
  contributors: FeatureContrib[];
  differential: DxEntry[];
}

const DISPOSITION_COLOR: Record<string, string> = {
  MONITOR: "bg-green-100 text-green-800 border-green-300",
  self_care: "bg-green-100 text-green-800 border-green-300",
  office_followup: "bg-blue-100 text-blue-800 border-blue-300",
  urgent_care: "bg-yellow-100 text-yellow-800 border-yellow-300",
  URGENT: "bg-orange-100 text-orange-800 border-orange-300",
  er_now: "bg-red-100 text-red-800 border-red-300",
  ER_NOW: "bg-red-100 text-red-800 border-red-300",
  CALL_911: "bg-red-200 text-red-900 border-red-500",
};

export default function ScoringConsole({ data }: { data: ScoringData }) {
  const dispositionClass = DISPOSITION_COLOR[data.disposition] ?? "bg-gray-100 text-gray-800 border-gray-300";
  const uncertaintyPct = (data.uncertainty * 100).toFixed(1);
  const marginPct = (data.margin * 100).toFixed(1);

  return (
    <div className="space-y-4" data-testid="scoring-console">
      {/* Disposition + confidence header */}
      <div className={`rounded-lg border-2 p-4 ${dispositionClass}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Disposition</p>
            <p className="text-2xl font-bold">{data.disposition}</p>
            {data.floorApplied && (
              <p className="text-xs mt-0.5 opacity-70">
                Floor applied from <strong>{data.floorSource}</strong>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Top Dx</p>
            <p className="text-lg font-bold">{data.topDx}</p>
            <p className="text-sm opacity-80">{(data.posterior * 100).toFixed(1)}% posterior</p>
          </div>
        </div>
      </div>

      {/* Uncertainty metrics */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-0 bg-muted/40">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Uncertainty</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-2xl font-bold" data-testid="uncertainty-value">{uncertaintyPct}%</p>
            <Progress value={data.uncertainty * 100} className="h-1.5 mt-1" />
          </CardContent>
        </Card>
        <Card className="border-0 bg-muted/40">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Margin</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-2xl font-bold" data-testid="margin-value">{marginPct}%</p>
            <Progress value={data.margin * 100} className="h-1.5 mt-1" />
          </CardContent>
        </Card>
      </div>

      {/* Rule hits */}
      {data.ruleHits.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Escalation Rules Triggered</p>
          <div className="space-y-1">
            {data.ruleHits.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800">
                <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
                <span className="font-medium">{r.action}</span>
                {r.description && <span className="text-muted-foreground">— {r.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Differential */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Differential Diagnosis</p>
        <div className="space-y-1">
          {data.differential.map((dx, i) => (
            <div key={dx.ruleId} className="flex items-center gap-2" data-testid={`dx-row-${i}`}>
              <span className="w-5 text-xs text-muted-foreground text-right shrink-0">{i + 1}.</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-xs font-medium truncate">{dx.label}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-1">{(dx.posterior * 100).toFixed(1)}%</span>
                </div>
                <Progress value={dx.posterior * 100} className="h-1" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature contributions */}
      {data.contributors.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Key Feature Contributors</p>
          <div className="space-y-1">
            {data.contributors.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {f.contribution === "positive" ? (
                  <TrendingUp className="h-3 w-3 text-green-500 shrink-0" />
                ) : f.contribution === "negative" ? (
                  <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
                ) : (
                  <CheckCircle className="h-3 w-3 text-gray-400 shrink-0" />
                )}
                <span className="font-medium truncate flex-1">{f.feature}</span>
                <Badge variant="outline" className="text-xs py-0 shrink-0">
                  {f.logContribution > 0 ? "+" : ""}{f.logContribution.toFixed(3)}
                </Badge>
                <span className="text-muted-foreground shrink-0">{String(f.value ?? "—")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

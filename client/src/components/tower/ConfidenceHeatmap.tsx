import { Badge } from "@/components/ui/badge";
import { Thermometer } from "lucide-react";

export interface HeatmapRow {
  diagnosis: string;
  diagnosisLabel: string;
  posterior: number;
  contributions: Array<{ feature: string; value: number; direction: "positive" | "negative" | "neutral" }>;
}

function heatColor(v: number): string {
  if (v >  0.5) return "bg-green-500 text-white";
  if (v >  0.2) return "bg-green-300 text-green-900";
  if (v >  0.1) return "bg-green-100 text-green-800";
  if (v > -0.1) return "bg-gray-100 text-gray-500";
  if (v > -0.2) return "bg-red-100 text-red-700";
  if (v > -0.5) return "bg-red-300 text-red-900";
  return "bg-red-500 text-white";
}

function shortLabel(key: string) {
  return key.replace(/^(DX_BAY_|dx_bay_)/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).slice(0, 18);
}

export default function ConfidenceHeatmap({ data }: { data?: HeatmapRow[] }) {
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2" data-testid="heatmap-empty">
        <Thermometer className="h-8 w-8 opacity-30" />
        <p className="text-sm text-center">Run analysis to see the confidence heatmap</p>
        <p className="text-xs opacity-60">Feature log-likelihood contributions per diagnosis</p>
      </div>
    );
  }

  const features = data[0]?.contributions?.map(c => c.feature) ?? [];

  return (
    <div className="space-y-2 overflow-x-auto" data-testid="confidence-heatmap">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">Confidence Heatmap</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-400" />pos
          <span className="inline-block w-3 h-3 rounded-sm bg-red-400 ml-1" />neg
        </div>
      </div>

      {/* Feature header */}
      <div className="flex gap-0.5 mb-0.5">
        <div className="w-28 shrink-0" />
        {features.slice(0, 8).map(f => (
          <div key={f} className="w-10 text-center" style={{ minWidth: 40 }}>
            <p className="text-xs text-muted-foreground truncate rotate-0" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", height: 52, fontSize: 9 }}>
              {f.replace(/_/g, " ")}
            </p>
          </div>
        ))}
        <div className="w-14 text-xs text-muted-foreground text-right ml-1">Post.</div>
      </div>

      {/* Rows */}
      {data.map(row => (
        <div key={row.diagnosis} className="flex items-center gap-0.5" data-testid={`heatmap-row-${row.diagnosis}`}>
          <div className="w-28 shrink-0">
            <p className="text-xs font-medium truncate">{shortLabel(row.diagnosisLabel || row.diagnosis)}</p>
          </div>
          {row.contributions.slice(0, 8).map(c => (
            <div
              key={c.feature}
              className={`w-10 h-7 rounded text-center flex items-center justify-center text-xs font-mono transition-colors ${heatColor(c.value)}`}
              style={{ minWidth: 40, fontSize: 9 }}
              title={`${c.feature}: ${c.value.toFixed(3)}`}
            >
              {Math.abs(c.value) > 0.01 ? c.value.toFixed(2) : "–"}
            </div>
          ))}
          <div className="w-14 text-xs text-right ml-1 font-mono">
            <Badge
              variant="outline"
              className="text-xs py-0 font-mono"
              style={{ fontSize: 9 }}
            >
              {(row.posterior * 100).toFixed(0)}%
            </Badge>
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground italic pt-1">Values are log-likelihood contributions. Green = supports, red = argues against.</p>
    </div>
  );
}

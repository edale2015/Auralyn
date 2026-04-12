/**
 * Bayesian Posterior Heatmap — visual diagnosis confidence display.
 * Shows each candidate diagnosis as a proportional bar (prob × 100%).
 */

interface Posterior {
  dx:   string;
  prob: number;
}

interface HeatmapProps {
  posterior:   Posterior[];
  title?:      string;
  showPercent?: boolean;
}

function probColor(prob: number): string {
  if (prob >= 0.35) return "bg-red-500";
  if (prob >= 0.20) return "bg-orange-400";
  if (prob >= 0.10) return "bg-yellow-400";
  return "bg-blue-300";
}

export default function Heatmap({ posterior, title = "Diagnosis Confidence", showPercent = true }: HeatmapProps) {
  const sorted = [...posterior].sort((a, b) => b.prob - a.prob);

  return (
    <div className="space-y-2">
      {title && <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>}
      {sorted.map((p) => (
        <div key={p.dx} data-testid={`heatmap-${p.dx}`} className="space-y-0.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium w-44 truncate" title={p.dx}>{p.dx.replace(/_/g, " ")}</span>
            {showPercent && <span className="text-muted-foreground">{(p.prob * 100).toFixed(0)}%</span>}
          </div>
          <div className="w-full bg-muted rounded h-2.5 overflow-hidden">
            <div
              className={`h-full rounded transition-all duration-500 ${probColor(p.prob)}`}
              style={{ width: `${Math.max(p.prob * 100, 2)}%` }}
              aria-label={`${p.dx}: ${(p.prob * 100).toFixed(0)}%`}
            />
          </div>
        </div>
      ))}
      {sorted.length === 0 && (
        <p className="text-xs text-muted-foreground">No posterior data</p>
      )}
    </div>
  );
}

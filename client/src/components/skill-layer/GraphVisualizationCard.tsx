type Props = {
  trace: any;
};

export default function GraphVisualizationCard({ trace }: Props) {
  const steps = trace?.steps ?? [];
  const totals = trace?.totals ?? {};
  const stopReason = trace?.stopReason ?? "No graph trace";

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Graph Visualization</h2>

      <div className="mb-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        <div>Stop reason: {stopReason}</div>
        <div>Total cost: ${Number(totals.totalEstimatedCostUsd ?? 0).toFixed(4)}</div>
        <div>Total latency: {Number(totals.totalLatencyMs ?? 0).toFixed(1)} ms</div>
      </div>

      {steps.length === 0 ? (
        <div className="text-sm text-slate-500">No graph trace available. Run a case with graph-enabled complaint (sore throat, cough, UTI).</div>
      ) : (
        <div className="space-y-3">
          {steps.map((step: any, idx: number) => (
            <div
              key={idx}
              data-testid={`graph-step-${idx}`}
              className="rounded-xl border bg-slate-50 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-slate-900">
                  {step.step}. {step.node}
                </div>
                <div className="text-xs text-slate-500">
                  {step.status} | conf{" "}
                  {typeof step.confidence === "number"
                    ? step.confidence.toFixed(2)
                    : "n/a"}
                </div>
              </div>

              {!!step.reasoning_summary && (
                <div className="mt-2 text-sm text-slate-700">
                  {step.reasoning_summary}
                </div>
              )}

              {!!step.ruleHits?.length && (
                <div className="mt-2 text-xs text-slate-600">
                  Rules: {step.ruleHits.join(" | ")}
                </div>
              )}

              {!!step.missingData?.length && (
                <div className="mt-1 text-xs text-amber-700">
                  Missing: {step.missingData.join(" | ")}
                </div>
              )}

              <div className="mt-1 text-xs text-slate-500">
                Cost ${Number(step.estimatedCostUsd ?? 0).toFixed(4)} |{" "}
                {Number(step.latencyMs ?? 0).toFixed(1)} ms
              </div>

              {!!step.nextRecommendedSkills?.length && (
                <div className="mt-1 text-xs text-slate-500">
                  Next: {step.nextRecommendedSkills.join(" → ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

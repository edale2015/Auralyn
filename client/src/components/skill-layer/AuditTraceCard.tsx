type TraceItem = {
  skillName: string;
  status: string;
  confidence?: number;
  ruleHits?: string[];
  missingData?: string[];
  nextRecommendedSkills?: string[];
};

type Props = {
  trace: TraceItem[];
};

const STATUS_COLOR: Record<string, string> = {
  ok: "text-green-700",
  pass: "text-green-700",
  error: "text-red-700",
  skipped: "text-slate-400",
};

export default function AuditTraceCard({ trace }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Audit Trace</h2>

      <div className="space-y-2">
        {trace.length === 0 ? (
          <div data-testid="audit-trace-empty" className="text-sm text-slate-500">
            No audit trace available.
          </div>
        ) : (
          trace.map((item, idx) => (
            <div
              key={`${item.skillName}_${idx}`}
              data-testid={`audit-trace-item-${idx}`}
              className="rounded-xl bg-slate-50 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-slate-900 text-sm">{item.skillName}</div>
                <div className={`text-xs font-medium ${STATUS_COLOR[item.status] ?? "text-slate-500"}`}>
                  {item.status}
                  {typeof item.confidence === "number"
                    ? ` · ${item.confidence.toFixed(2)}`
                    : ""}
                </div>
              </div>

              {!!item.ruleHits?.length && (
                <div className="mt-1.5 text-xs text-slate-600">
                  Hits: {item.ruleHits.join(" · ")}
                </div>
              )}

              {!!item.missingData?.length && (
                <div className="mt-1 text-xs text-amber-700">
                  Missing: {item.missingData.join(" · ")}
                </div>
              )}

              {!!item.nextRecommendedSkills?.length && (
                <div className="mt-1 text-xs text-slate-400">
                  Next: {item.nextRecommendedSkills.join(" → ")}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

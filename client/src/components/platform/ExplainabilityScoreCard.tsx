import { useQuery } from "@tanstack/react-query";

const LEVEL_COLORS: Record<string, string> = {
  high: "text-green-700 bg-green-100",
  medium: "text-amber-700 bg-amber-100",
  low: "text-red-700 bg-red-100",
};

export default function ExplainabilityScoreCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/skill-layer/learning/explainability"],
    queryFn: async () => {
      const res = await fetch("/api/skill-layer/learning/explainability");
      return res.json();
    },
  });

  const scores: any[] = data?.scores ?? [];
  const lowCount = scores.filter((s) => s.level === "low").length;
  const medCount = scores.filter((s) => s.level === "medium").length;
  const highCount = scores.filter((s) => s.level === "high").length;

  const avg =
    scores.length > 0
      ? Math.round(scores.reduce((s, r) => s + r.score, 0) / scores.length)
      : 0;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Case Explainability</h2>
        {scores.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            avg {avg}/100
          </span>
        )}
      </div>

      {isLoading && <div className="text-sm text-slate-400">Loading…</div>}

      {!isLoading && scores.length === 0 && (
        <div className="text-sm text-slate-400">No skill runs to score yet.</div>
      )}

      {scores.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              { label: "High", count: highCount, color: "bg-green-100 text-green-800" },
              { label: "Medium", count: medCount, color: "bg-amber-100 text-amber-800" },
              { label: "Low", count: lowCount, color: "bg-red-100 text-red-800" },
            ].map((b) => (
              <div key={b.label} className={`rounded-xl p-2 text-center ${b.color}`}>
                <div className="text-xl font-bold">{b.count}</div>
                <div className="text-xs font-medium">{b.label}</div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500">Lowest scoring cases</div>
            {scores.slice(0, 6).map((s: any, idx: number) => (
              <div
                key={idx}
                data-testid={`text-explainability-${idx}`}
                className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs font-medium text-slate-800">{s.caseId}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-16 rounded-full bg-slate-200">
                    <div
                      className={`h-1.5 rounded-full ${
                        s.level === "high"
                          ? "bg-green-500"
                          : s.level === "medium"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${s.score}%` }}
                    />
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                      LEVEL_COLORS[s.level] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {s.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

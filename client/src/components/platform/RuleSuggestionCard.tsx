import { useQuery } from "@tanstack/react-query";

const FAILURE_TYPE_LABELS: Record<string, string> = {
  safety_miss: "Safety Miss",
  diagnosis_mismatch: "Diagnosis Mismatch",
  disposition_mismatch: "Disposition Mismatch",
};

const FAILURE_TYPE_COLORS: Record<string, string> = {
  safety_miss: "bg-red-100 text-red-800",
  diagnosis_mismatch: "bg-amber-100 text-amber-800",
  disposition_mismatch: "bg-blue-100 text-blue-800",
};

export default function RuleSuggestionCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/skill-layer/learning/rule-suggestions"],
    queryFn: async () => {
      const res = await fetch("/api/skill-layer/learning/rule-suggestions");
      return res.json();
    },
  });

  const suggestions: any[] = data?.suggestions ?? [];

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Failure-Driven Rule Suggestions</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {suggestions.length} suggestions
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Auto-generated from reconciliation failures. Review before applying.
      </p>

      {isLoading && <div className="text-sm text-slate-400">Loading…</div>}
      {error && <div className="text-sm text-red-600">Failed to load</div>}

      {!isLoading && suggestions.length === 0 && (
        <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">
          No rule suggestions — system performing well.
        </div>
      )}

      {suggestions.slice(0, 8).map((s: any, idx: number) => (
        <div
          key={idx}
          data-testid={`text-rule-suggestion-${idx}`}
          className="mb-2 rounded-xl bg-slate-50 p-3 text-sm"
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="font-medium text-slate-800">
              {s.complaint?.replace(/_/g, " ")}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                FAILURE_TYPE_COLORS[s.failureType] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {FAILURE_TYPE_LABELS[s.failureType] ?? s.failureType}
            </span>
            <span className="ml-auto text-xs text-slate-500">
              {Math.round(s.confidence * 100)}% confidence
            </span>
          </div>
          <div className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
            {s.suggestedCondition}
          </div>
          <div className="mt-1 rounded bg-emerald-50 px-2 py-1 font-mono text-xs text-emerald-800">
            {s.suggestedEffect}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {s.supportingFailures} supporting failure{s.supportingFailures !== 1 ? "s" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

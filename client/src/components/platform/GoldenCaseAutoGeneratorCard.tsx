import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function GoldenCaseAutoGeneratorCard() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/skill-layer/learning/generated-golden-cases"],
    queryFn: async () => {
      const res = await fetch("/api/skill-layer/learning/generated-golden-cases");
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/skill-layer/learning/generate-golden-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return res.json();
    },
    onSuccess: (result) => {
      setLastResult(result);
      queryClient.invalidateQueries({
        queryKey: ["/api/skill-layer/learning/generated-golden-cases"],
      });
    },
  });

  const cases: any[] = data?.cases ?? [];
  const total = cases.length;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Golden Case Auto-Generator</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {isLoading ? "…" : total} generated
        </span>
      </div>

      <p className="mb-3 text-sm text-slate-600">
        Automatically converts reconciliation failures into golden test cases.
      </p>

      <button
        data-testid="button-generate-golden-cases"
        onClick={() => generateMutation.mutate()}
        disabled={generateMutation.isPending}
        className="mb-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {generateMutation.isPending ? "Generating…" : "Generate from Failures"}
      </button>

      {generateMutation.isError && (
        <div className="mb-2 text-sm text-red-600">Generation failed</div>
      )}

      {lastResult?.result && (
        <div className="mb-3 rounded-xl bg-green-50 p-3 text-sm text-green-800">
          Generated {lastResult.result.generated} new cases (total: {lastResult.result.total})
        </div>
      )}

      {cases.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500">Recent auto-generated cases</div>
          {cases.slice(0, 5).map((c: any, idx: number) => (
            <div
              key={idx}
              data-testid={`text-golden-case-${c.id}`}
              className="rounded-xl bg-slate-50 p-2.5 text-xs"
            >
              <div className="font-medium text-slate-800">{c.id}</div>
              <div className="text-slate-600">
                {c.expected?.complaint_id || "—"} → {c.expected?.disposition || "—"}
              </div>
              {c.failure?.safetyMiss && (
                <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                  Safety miss
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

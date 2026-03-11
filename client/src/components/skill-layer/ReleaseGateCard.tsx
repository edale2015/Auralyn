import { useState } from "react";
import { platformApi } from "../../lib/platformApi";

type Props = {
  defaultComplaint?: string;
};

export default function ReleaseGateCard({ defaultComplaint = "sore_throat" }: Props) {
  const [complaint, setComplaint] = useState(defaultComplaint);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleEvaluate() {
    try {
      setLoading(true);
      setError("");
      const res = await platformApi.getReleaseGate(complaint.trim());
      setResult(res.result);
    } catch (err: any) {
      setError(err.message ?? "Evaluation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Release Gate</h2>

      <div className="mb-3 flex gap-2">
        <input
          data-testid="release-gate-complaint-input"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          placeholder="e.g. sore_throat"
        />
        <button
          data-testid="button-evaluate-gate"
          onClick={handleEvaluate}
          disabled={loading}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          {loading ? "…" : "Evaluate"}
        </button>
      </div>

      {!!error && (
        <div className="mb-2 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span
              data-testid="gate-result-badge"
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                result.passed
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {result.passed ? "GATE PASSED" : "GATE FAILED"}
            </span>
            <span className="text-sm text-slate-600">
              Score: {(result.score * 100).toFixed(0)}%
            </span>
          </div>

          <div className="space-y-2">
            {(result.checks ?? []).map((c: any, idx: number) => (
              <div
                key={idx}
                data-testid={`gate-check-${idx}`}
                className={`flex items-center justify-between rounded-xl p-2 text-sm ${
                  c.passed ? "bg-green-50" : "bg-red-50"
                }`}
              >
                <span className="font-medium">
                  {c.passed ? "✓" : "✗"} {c.check}
                </span>
                <span className="text-slate-600">
                  {String(c.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const COMPLAINTS = [
  "sore_throat", "cough", "uti", "chest_pain",
  "abdominal_pain", "fever", "rash", "ear_pain", "sinus_pressure",
];

export default function ReleaseGateHistoryCard() {
  const [selectedComplaint, setSelectedComplaint] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/platform/release-gate-history", selectedComplaint],
    queryFn: async () => {
      const url = selectedComplaint
        ? `/api/platform/release-gate-history?complaint=${encodeURIComponent(selectedComplaint)}&limit=50`
        : "/api/platform/release-gate-history?limit=50";
      const res = await fetch(url);
      return res.json();
    },
  });

  const rows: any[] = data?.rows ?? [];

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Release Gate History</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {rows.length} evaluations
        </span>
      </div>

      <div className="mb-3">
        <select
          data-testid="select-gate-history-complaint"
          value={selectedComplaint}
          onChange={(e) => setSelectedComplaint(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-800"
        >
          <option value="">All complaints</option>
          {COMPLAINTS.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-sm text-slate-400">Loading…</div>}

      {!isLoading && rows.length === 0 && (
        <div className="text-sm text-slate-400">No gate evaluations recorded yet.</div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.slice(0, 20).map((row: any, idx: number) => (
            <div
              key={idx}
              data-testid={`text-gate-history-${idx}`}
              className="flex items-start gap-3 rounded-xl bg-slate-50 p-2.5"
            >
              <span
                className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  row.passed ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {row.complaint?.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-slate-500">
                    {Math.round(Number(row.score) * 100)}%
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {row.evaluatedAt
                    ? new Date(row.evaluatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  row.passed
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {row.passed ? "Pass" : "Fail"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

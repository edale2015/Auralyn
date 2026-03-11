type Props = {
  rows: any[];
};

export default function CompareDiffsCard({ rows }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Compare Mode Diffs</h2>

      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">No compare diffs recorded yet.</div>
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 20).map((row, idx) => (
            <div key={idx} className="rounded-xl bg-slate-50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <div className="font-medium text-slate-900">{row.caseId ?? "—"}</div>
                <div className="flex gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.sameComplaint ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    complaint {row.sameComplaint ? "match" : "diff"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.sameDisposition ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}
                  >
                    disposition {row.sameDisposition ? "match" : "diff"}
                  </span>
                </div>
              </div>
              <div className="text-sm text-slate-700">
                Seq: {row.sequential?.complaint || "—"} / {row.sequential?.disposition || "—"}
              </div>
              <div className="text-sm text-slate-700">
                Graph: {row.graph?.complaint || "—"} / {row.graph?.disposition || "—"}
              </div>
              {row.compareError && (
                <div className="mt-1 text-xs text-red-600">{row.compareError}</div>
              )}
              <div className="mt-1 text-xs text-slate-500">{row.timestamp}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  summary: any[];
};

export default function RuleGovernanceCard({ summary }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Rule Governance</h2>

      {summary.length === 0 ? (
        <div className="text-sm text-slate-500">No governance summary available.</div>
      ) : (
        <div className="space-y-3">
          {summary.map((row, idx) => (
            <div
              key={idx}
              data-testid={`governance-row-${idx}`}
              className="rounded-xl bg-slate-50 p-3"
            >
              <div className="font-medium text-slate-900">{row.file}</div>
              <div className="text-sm text-slate-700">
                Rows: {row.rowCount}
              </div>
              <div className="text-xs text-slate-500">
                Sample IDs:{" "}
                {(row.sampleIds ?? []).filter(Boolean).join(" | ") || "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

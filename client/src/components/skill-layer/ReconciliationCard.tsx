type Props = {
  rows: any[];
};

export default function ReconciliationCard({ rows }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Reconciliations</h2>

      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">
          No reconciliations recorded yet.
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-auto">
          {rows.map((row, idx) => (
            <div
              key={idx}
              data-testid={`reconciliation-row-${idx}`}
              className="rounded-xl bg-slate-50 p-3"
            >
              <div className="font-medium text-slate-900">
                {row.case_id ?? row.caseId}
              </div>
              <div className="text-sm text-slate-700">
                Predicted top: {row.predictedTop || "—"} | Actual:{" "}
                {row.actualFinalDiagnosis || "—"}
              </div>
              <div className="text-sm text-slate-700">
                Predicted disposition: {row.predictedDisposition || "—"} |
                Actual: {row.actualDisposition || "—"}
              </div>
              <div className="text-xs text-slate-500">
                Top match: {String(row.top_prediction_match)} | Disposition
                match: {String(row.disposition_match)} | Safety miss:{" "}
                {String(row.safety_miss_flag)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

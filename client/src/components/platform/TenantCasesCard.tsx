type Props = {
  rows: any[];
};

export default function TenantCasesCard({ rows }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Tenant Cases</h2>

      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">No tenant cases saved yet.</div>
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 20).map((row, idx) => (
            <div key={idx} className="rounded-xl bg-slate-50 p-3">
              <div className="font-medium text-slate-900">{row.caseId}</div>
              <div className="text-sm text-slate-700">
                {row.complaintId || "—"} | {row.disposition || "—"}
              </div>
              <div className="text-xs text-slate-500">{row.updatedAt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

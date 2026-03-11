type Props = {
  rows: any[];
};

export default function CostValueDashboardCard({ rows }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Cost vs Value Dashboard</h2>

      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">No cost/value rows available yet.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-600">
              <tr className="border-b">
                <th className="px-3 py-2">Complaint</th>
                <th className="px-3 py-2">Cases</th>
                <th className="px-3 py-2">Avg Cost/Case</th>
                <th className="px-3 py-2">Avg Latency/Case</th>
                <th className="px-3 py-2">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} data-testid={`cost-row-${idx}`} className="border-b">
                  <td className="px-3 py-2">{r.complaint}</td>
                  <td className="px-3 py-2">{r.cases}</td>
                  <td className="px-3 py-2">
                    ${Number(r.avgCostUsdPerCase ?? 0).toFixed(4)}
                  </td>
                  <td className="px-3 py-2">
                    {Number(r.avgLatencyMsPerCase ?? 0).toFixed(1)} ms
                  </td>
                  <td className="px-3 py-2">
                    ${Number(r.totalCostUsd ?? 0).toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

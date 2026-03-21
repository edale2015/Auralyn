import { useEffect, useState } from "react";

export default function EngineMetricsDashboard() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/engine-metrics")
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6" data-testid="engine-metrics-loading">Loading engine metrics...</div>;
  }

  return (
    <div className="p-6 space-y-6" data-testid="engine-metrics-dashboard">
      <h1 className="text-3xl font-semibold">Engine Metrics Dashboard</h1>

      {rows.length === 0 ? (
        <div className="rounded-2xl border p-8 text-center text-gray-400">
          No engine metrics recorded yet. Engine metrics are recorded as jobs run.
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm" data-testid="engine-metrics-table">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left p-3">Engine</th>
                <th className="text-left p-3">Success</th>
                <th className="text-left p-3">Errors</th>
                <th className="text-left p-3">Avg Latency</th>
                <th className="text-left p-3">Error Rate</th>
                <th className="text-left p-3">SLO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.clinic_id || "global"}-${row.engine_name}`}
                  className="border-t dark:border-gray-700"
                  data-testid={`engine-row-${row.engine_name}`}
                >
                  <td className="p-3 font-medium">{row.engine_name}</td>
                  <td className="p-3">{row.success_count}</td>
                  <td className="p-3">{row.error_count}</td>
                  <td className="p-3">{Math.round(row.avgLatencyMs)} ms</td>
                  <td className="p-3">{(row.errorRate * 100).toFixed(2)}%</td>
                  <td className="p-3">
                    <span
                      className={
                        row.sloStatus === "healthy"
                          ? "text-green-600 font-semibold"
                          : row.sloStatus === "warning"
                          ? "text-amber-600 font-semibold"
                          : "text-red-600 font-semibold"
                      }
                    >
                      {row.sloStatus}
                    </span>
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

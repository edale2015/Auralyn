import { useEffect, useState } from "react";
import EngineBadge from "../components/EngineBadge";
import { ENGINE_REGISTRY, getEngineStatus } from "../config/engineRegistry";

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

  const allEngineNames = new Set([
    ...rows.map((r) => r.engine_name),
    ...ENGINE_REGISTRY.map((e) => e.name),
  ]);

  const displayRows = Array.from(allEngineNames).map((name) => {
    const live = rows.find((r) => r.engine_name === name);
    const status = getEngineStatus(name);
    return { name, live, status };
  });

  return (
    <div className="p-6 space-y-6" data-testid="engine-metrics-dashboard">
      <h1 className="text-3xl font-semibold">Engine Metrics Dashboard</h1>

      <div className="rounded-2xl border overflow-hidden">
        <table className="w-full text-sm" data-testid="engine-metrics-table">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left p-3">Engine</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Success</th>
              <th className="text-left p-3">Errors</th>
              <th className="text-left p-3">Avg Latency</th>
              <th className="text-left p-3">Error Rate</th>
              <th className="text-left p-3">SLO</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map(({ name, live, status }) => (
              <tr
                key={name}
                className="border-t dark:border-gray-700"
                data-testid={`engine-row-${name}`}
              >
                <td className="p-3 font-medium">{name}</td>
                <td className="p-3">
                  <EngineBadge status={status} />
                </td>
                <td className="p-3">{live ? live.success_count : "—"}</td>
                <td className="p-3">{live ? live.error_count : "—"}</td>
                <td className="p-3">{live ? `${Math.round(live.avgLatencyMs)} ms` : "—"}</td>
                <td className="p-3">{live ? `${(live.errorRate * 100).toFixed(2)}%` : "—"}</td>
                <td className="p-3">
                  {live ? (
                    <span
                      className={
                        live.sloStatus === "healthy"
                          ? "text-green-600 font-semibold"
                          : live.sloStatus === "warning"
                          ? "text-amber-600 font-semibold"
                          : "text-red-600 font-semibold"
                      }
                    >
                      {live.sloStatus}
                    </span>
                  ) : (
                    <span className="text-gray-400">no data</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";

export default function WorkerMonitor() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/workers")
        .then((r) => r.json())
        .then((d) => {
          setRows(Array.isArray(d) ? d : []);
          setLastUpdated(new Date());
          setLoading(false);
        })
        .catch(() => setLoading(false));

    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <div className="p-6" data-testid="workers-loading">Loading worker monitor...</div>;
  }

  return (
    <div className="p-6 space-y-6" data-testid="worker-monitor">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Worker Monitor</h1>
        {lastUpdated && (
          <span className="text-sm text-gray-400">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border p-8 text-center text-gray-400">
          No active workers. Workers appear here when the worker process is running.
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm" data-testid="workers-table">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left p-3">Worker ID</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Host</th>
                <th className="text-left p-3">PID</th>
                <th className="text-left p-3">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.worker_id}
                  className="border-t dark:border-gray-700"
                  data-testid={`worker-row-${row.worker_id}`}
                >
                  <td className="p-3 font-mono text-xs">{row.worker_id}</td>
                  <td className="p-3">{row.worker_type}</td>
                  <td className="p-3">
                    <span
                      className={
                        row.status === "running"
                          ? "text-green-600 font-semibold"
                          : "text-red-600 font-semibold"
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="p-3">{row.hostname || "-"}</td>
                  <td className="p-3">{row.pid || "-"}</td>
                  <td className="p-3">{new Date(row.last_seen_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

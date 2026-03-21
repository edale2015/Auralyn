import { useEffect, useState } from "react";

export default function ClinicHealthDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clinic-health")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6" data-testid="clinic-health-loading">Loading clinic health...</div>;
  }

  if (!data) {
    return <div className="p-6 text-red-600">Failed to load clinic health data</div>;
  }

  return (
    <div className="p-6 space-y-8" data-testid="clinic-health-dashboard">
      <h1 className="text-3xl font-semibold">Clinic Health Dashboard</h1>

      <section>
        <h2 className="text-xl font-semibold mb-3">Latest Clinic Health</h2>
        {data.health.length === 0 ? (
          <div className="rounded-2xl border p-6 text-center text-gray-400">
            No clinic health snapshots recorded yet.
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <table className="w-full text-sm" data-testid="clinic-health-table">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left p-3">Clinic</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.health.map((row: any) => (
                  <tr
                    key={`${row.clinic_id}-${row.created_at}`}
                    className="border-t dark:border-gray-700"
                    data-testid={`clinic-health-row-${row.clinic_id}`}
                  >
                    <td className="p-3">{row.clinic_id}</td>
                    <td className="p-3">
                      <span
                        className={
                          row.status === "healthy"
                            ? "text-green-600 font-semibold"
                            : "text-red-600 font-semibold"
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3">{new Date(row.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Clinic Feature States</h2>
        {data.features.length === 0 ? (
          <div className="rounded-2xl border p-6 text-center text-gray-400">
            No clinic feature states recorded yet.
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <table className="w-full text-sm" data-testid="clinic-features-table">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left p-3">Clinic</th>
                  <th className="text-left p-3">Feature</th>
                  <th className="text-left p-3">Enabled</th>
                  <th className="text-left p-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.features.map((row: any) => (
                  <tr
                    key={`${row.clinic_id}-${row.feature_name}`}
                    className="border-t dark:border-gray-700"
                    data-testid={`clinic-feature-row-${row.clinic_id}-${row.feature_name}`}
                  >
                    <td className="p-3">{row.clinic_id}</td>
                    <td className="p-3">{row.feature_name}</td>
                    <td className="p-3">
                      {row.enabled ? (
                        <span className="text-green-600 font-semibold">Yes</span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    <td className="p-3">{new Date(row.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

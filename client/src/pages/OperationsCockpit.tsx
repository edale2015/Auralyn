import { useEffect, useState } from "react";
import StatCard from "../components/ops/StatCard";

type OpsSummary = {
  services: any;
  queues: any;
  recentEvents: any[];
  recentJobs: any[];
  recentMetrics: any[];
};

export default function OperationsCockpit() {
  const [data, setData] = useState<OpsSummary | null>(null);
  const [error, setError] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/ops/summary");
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || "Failed to load operations summary");
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return <div className="p-6 text-red-600" data-testid="ops-error">Operations error: {error}</div>;
  }

  if (!data) {
    return <div className="p-6" data-testid="ops-loading">Loading operations cockpit...</div>;
  }

  const totalWaiting =
    (data.queues?.triage?.waiting || 0) +
    (data.queues?.notification?.waiting || 0) +
    (data.queues?.learning?.waiting || 0);

  const totalFailed =
    (data.queues?.triage?.failed || 0) +
    (data.queues?.notification?.failed || 0) +
    (data.queues?.learning?.failed || 0) +
    (data.queues?.deadLetter?.failed || 0);

  return (
    <div className="p-6 space-y-6" data-testid="operations-cockpit">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Operations Cockpit</h1>
        {lastUpdated && (
          <span className="text-sm text-gray-400">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="API"
          value={data.services.api.ok ? "OK" : "DOWN"}
          status={data.services.api.ok ? "ok" : "fail"}
        />
        <StatCard
          title="Database"
          value={data.services.database.ok ? "OK" : "FAIL"}
          status={data.services.database.ok ? "ok" : "fail"}
          subtitle={data.services.database.error}
        />
        <StatCard
          title="Redis"
          value={data.services.redis.ok ? "OK" : "FAIL"}
          status={data.services.redis.ok ? "ok" : "fail"}
          subtitle={data.services.redis.error}
        />
        <StatCard
          title="Queued Jobs"
          value={totalWaiting}
          subtitle="waiting across core queues"
          status="neutral"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Queue Failures"
          value={totalFailed}
          status={totalFailed > 0 ? "warn" : "ok"}
        />
        <StatCard title="Dead Letters" value={data.queues?.deadLetter?.waiting || 0} />
        <StatCard title="Recent Events" value={data.recentEvents.length} />
        <StatCard title="Recent Jobs" value={data.recentJobs.length} />
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-3">Queue Health</h2>
        <pre className="rounded-2xl border p-4 overflow-auto bg-gray-50 dark:bg-gray-900 text-sm">
          {JSON.stringify(data.queues, null, 2)}
        </pre>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Recent System Events</h2>
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm" data-testid="events-table">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Event</th>
                <th className="text-left p-3">Severity</th>
                <th className="text-left p-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {data.recentEvents.map((row) => (
                <tr key={row.id} className="border-t dark:border-gray-700">
                  <td className="p-3">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="p-3">{row.event_name}</td>
                  <td className="p-3">{row.severity}</td>
                  <td className="p-3">{row.source || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Recent Jobs</h2>
        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm" data-testid="jobs-table">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left p-3">Job ID</th>
                <th className="text-left p-3">Queue</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentJobs.map((row) => (
                <tr key={row.id} className="border-t dark:border-gray-700">
                  <td className="p-3">{row.id}</td>
                  <td className="p-3">{row.queue_name}</td>
                  <td className="p-3">{row.job_name}</td>
                  <td className="p-3">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

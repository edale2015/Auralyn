import { useEffect, useState } from "react";
import StatCard from "../components/ops/StatCard";
import { Badge } from "@/components/ui/badge";

type ServiceStatus = { ok: boolean; configured?: boolean; error?: string };
type QueueStat = { waiting?: number; active?: number; completed?: number; failed?: number };
type OpsSummary = {
  services: { api: ServiceStatus; database: ServiceStatus; redis: ServiceStatus };
  queues: {
    status?: { ok: boolean; error?: string };
    triage?: QueueStat;
    notification?: QueueStat;
    learning?: QueueStat;
    deadLetter?: QueueStat;
    [key: string]: any;
  };
  recentEvents: any[];
  recentJobs: any[];
  recentMetrics: any[];
};

function QueueRow({ name, q }: { name: string; q: QueueStat }) {
  const failed = q.failed ?? 0;
  return (
    <tr className="border-t dark:border-gray-700" data-testid={`queue-row-${name}`}>
      <td className="p-3 font-medium capitalize">{name}</td>
      <td className="p-3 text-center">{q.waiting ?? 0}</td>
      <td className="p-3 text-center">{q.active ?? 0}</td>
      <td className="p-3 text-center">{q.completed ?? 0}</td>
      <td className="p-3 text-center">
        <span className={failed > 0 ? "text-red-500 font-semibold" : ""}>{failed}</span>
      </td>
    </tr>
  );
}

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

  const redis = data.services.redis;
  const redisConfigured = redis.configured !== false;
  const redisValue = !redisConfigured ? "Not Configured" : redis.ok ? "OK" : "FAIL";
  const redisStatus = !redisConfigured ? "neutral" : redis.ok ? "ok" : "fail";
  const redisSubtitle = !redisConfigured ? "Using in-memory queues" : redis.error;

  const totalWaiting =
    (data.queues?.triage?.waiting ?? 0) +
    (data.queues?.notification?.waiting ?? 0) +
    (data.queues?.learning?.waiting ?? 0);

  const totalFailed =
    (data.queues?.triage?.failed ?? 0) +
    (data.queues?.notification?.failed ?? 0) +
    (data.queues?.learning?.failed ?? 0) +
    (data.queues?.deadLetter?.failed ?? 0);

  const namedQueues = ["triage", "notification", "learning", "deadLetter"].filter(
    (k) => data.queues?.[k]
  );

  const usingInMemory = !redisConfigured || data.queues?.status?.ok === false;

  return (
    <div className="p-6 space-y-6" data-testid="operations-cockpit">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Operations Cockpit</h1>
        {lastUpdated && (
          <span className="text-sm text-gray-400" data-testid="last-updated">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Service Health Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="API"
          value={data.services.api.ok ? "OK" : "DOWN"}
          status={data.services.api.ok ? "ok" : "fail"}
          data-testid="stat-api"
        />
        <StatCard
          title="Database"
          value={data.services.database.ok ? "OK" : "FAIL"}
          status={data.services.database.ok ? "ok" : "fail"}
          subtitle={data.services.database.error}
          data-testid="stat-database"
        />
        <StatCard
          title="Redis"
          value={redisValue}
          status={redisStatus}
          subtitle={redisSubtitle}
          data-testid="stat-redis"
        />
        <StatCard
          title="Queued Jobs"
          value={totalWaiting}
          subtitle="waiting across queues"
          status="neutral"
          data-testid="stat-queued"
        />
      </div>

      {/* Queue Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Queue Failures"
          value={totalFailed}
          status={totalFailed > 0 ? "warn" : "ok"}
          data-testid="stat-failures"
        />
        <StatCard title="Dead Letters" value={data.queues?.deadLetter?.waiting ?? 0} data-testid="stat-dead-letters" />
        <StatCard title="Recent Events" value={data.recentEvents.length} data-testid="stat-events" />
        <StatCard title="Recent Jobs" value={data.recentJobs.length} data-testid="stat-jobs" />
      </div>

      {/* Queue Health */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-xl font-semibold">Queue Health</h2>
          {usingInMemory && (
            <Badge variant="secondary" data-testid="badge-in-memory">In-Memory Mode</Badge>
          )}
        </div>

        {usingInMemory && namedQueues.length === 0 ? (
          <div className="rounded-2xl border p-6 bg-gray-50 dark:bg-gray-900 text-sm text-gray-500 space-y-1">
            <p className="font-medium text-gray-700 dark:text-gray-300">Running with in-memory queues</p>
            <p>No Redis URL is configured. The system uses lightweight in-memory queues instead.
               Jobs complete synchronously and are not persisted across restarts.
               To enable persistent queues, add a <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">REDIS_URL</code> environment variable.</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <table className="w-full text-sm" data-testid="queue-health-table">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left p-3">Queue</th>
                  <th className="text-center p-3">Waiting</th>
                  <th className="text-center p-3">Active</th>
                  <th className="text-center p-3">Completed</th>
                  <th className="text-center p-3">Failed</th>
                </tr>
              </thead>
              <tbody>
                {namedQueues.map((k) => (
                  <QueueRow key={k} name={k} q={data.queues[k]} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent System Events */}
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
              {data.recentEvents.length === 0 ? (
                <tr><td colSpan={4} className="p-4 text-gray-400 text-center">No events yet</td></tr>
              ) : data.recentEvents.map((row) => (
                <tr key={row.id} className="border-t dark:border-gray-700" data-testid={`event-row-${row.id}`}>
                  <td className="p-3">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="p-3">{row.event_name}</td>
                  <td className="p-3">
                    <Badge variant={row.severity === "critical" ? "destructive" : "secondary"}>
                      {row.severity}
                    </Badge>
                  </td>
                  <td className="p-3">{row.source || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Jobs */}
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
              {data.recentJobs.length === 0 ? (
                <tr><td colSpan={4} className="p-4 text-gray-400 text-center">No recent jobs</td></tr>
              ) : data.recentJobs.map((row) => (
                <tr key={row.id} className="border-t dark:border-gray-700" data-testid={`job-row-${row.id}`}>
                  <td className="p-3 font-mono text-xs">{row.id}</td>
                  <td className="p-3">{row.queue_name}</td>
                  <td className="p-3">{row.job_name}</td>
                  <td className="p-3">
                    <Badge variant={row.status === "failed" ? "destructive" : row.status === "completed" ? "secondary" : "outline"}>
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

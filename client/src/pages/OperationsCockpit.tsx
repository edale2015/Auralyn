import { useEffect, useState, useRef } from "react";
import { Link } from "wouter";
import StatCard from "../components/ops/StatCard";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

const CODE_REVIEW_GROUPS = [
  "Clinical Safety & Triage",
  "AI & Probabilistic Reasoning",
  "FDA Compliance & Audit",
  "EHR Integration",
];

type PipelineStatus = "idle" | "running" | "done" | "error";

export default function OperationsCockpit() {
  const { toast } = useToast();
  const [data, setData] = useState<OpsSummary | null>(null);
  const [error, setError] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Research pipeline state
  const [fullRunStatus,    setFullRunStatus]    = useState<PipelineStatus>("idle");
  const [mediumRunStatus,  setMediumRunStatus]  = useState<PipelineStatus>("idle");
  const [codeRevStatus,    setCodeRevStatus]    = useState<PipelineStatus>("idle");
  const [codeRevGroup,     setCodeRevGroup]     = useState<string>("Auto (today's rotation)");
  const [groupDropOpen,    setGroupDropOpen]    = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setGroupDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function triggerPipeline(
    endpoint: string,
    body: Record<string, unknown> | undefined,
    setStatus: (s: PipelineStatus) => void,
    label: string,
  ) {
    setStatus("running");
    try {
      await apiRequest("POST", endpoint, body);
      setStatus("done");
      toast({ title: `${label} started`, description: "Results appear in the Agent Handoff Queue in ~60 seconds." });
      setTimeout(() => setStatus("idle"), 6000);
    } catch (e: any) {
      setStatus("error");
      toast({ title: `${label} failed`, description: e?.message, variant: "destructive" });
      setTimeout(() => setStatus("idle"), 6000);
    }
  }

  function handleFullRun() {
    triggerPipeline("/api/research/full-run", undefined, setFullRunStatus, "Full Run");
  }

  function handleMediumRun() {
    triggerPipeline("/api/research/medium-run", undefined, setMediumRunStatus, "Medium Run");
  }

  function handleCodeReview() {
    const groupName = codeRevGroup === "Auto (today's rotation)" ? undefined : codeRevGroup;
    triggerPipeline("/api/research/app-code-review", groupName ? { groupName } : undefined, setCodeRevStatus, "Code Review");
    setGroupDropOpen(false);
  }

  function pipelineBtn(status: PipelineStatus) {
    if (status === "running") return " opacity-70 cursor-wait";
    if (status === "done")    return " opacity-80";
    if (status === "error")   return " opacity-80";
    return "";
  }

  function statusBadge(status: PipelineStatus) {
    if (status === "running") return <span className="ml-2 text-xs animate-pulse text-gray-400">running…</span>;
    if (status === "done")    return <span className="ml-2 text-xs text-green-500">started ✓</span>;
    if (status === "error")   return <span className="ml-2 text-xs text-red-500">failed</span>;
    return null;
  }

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

      {/* Quick Access Tools */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/ai-interaction-monitor", label: "Interaction Monitor", desc: "Audit every AI ↔ patient exchange, mood, CSAT, NPS", color: "border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20" },
          { href: "/complaint-lab", label: "Complaint Lab", desc: "Run simulations, watch processing, edit KB rules live", color: "border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-900/20" },
          { href: "/simulation-lab", label: "Simulation Lab", desc: "Bulk case runs and failure analysis", color: "border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20" },
          { href: "/knowledge-hub", label: "Knowledge Hub", desc: "Browse and manage the clinical KB", color: "border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20" },
        ].map(({ href, label, desc, color }) => (
          <Link key={href} href={href} className={`block rounded-xl border p-4 cursor-pointer transition-colors ${color}`} data-testid={`quick-link-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="font-semibold text-sm text-gray-800 dark:text-gray-100 mb-1">{label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{desc}</div>
          </Link>
        ))}
      </div>

      {/* Research Pipeline */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-semibold">Research Pipeline</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Trigger the automated research pipeline — Medium articles → AI review → Agent Handoff Queue
            </p>
          </div>
          <Link href="/research-inbox" className="text-xs text-blue-500 hover:underline" data-testid="link-research-inbox">
            Open Research Inbox →
          </Link>
        </div>

        <div className="rounded-xl border p-4 flex flex-wrap gap-3 items-center bg-gray-50 dark:bg-gray-900/40">

          {/* Full Run */}
          <button
            data-testid="btn-full-run"
            disabled={fullRunStatus === "running"}
            onClick={handleFullRun}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors${pipelineBtn(fullRunStatus)}`}
          >
            {fullRunStatus === "running" ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            )}
            Full Run
            {statusBadge(fullRunStatus)}
          </button>

          {/* Medium Only */}
          <button
            data-testid="btn-medium-run"
            disabled={mediumRunStatus === "running"}
            onClick={handleMediumRun}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors${pipelineBtn(mediumRunStatus)}`}
          >
            {mediumRunStatus === "running" ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            )}
            Medium Only
            {statusBadge(mediumRunStatus)}
          </button>

          {/* Code / Architecture Review with group dropdown */}
          <div className="relative" ref={dropRef}>
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
              <button
                data-testid="btn-code-review"
                disabled={codeRevStatus === "running"}
                onClick={handleCodeReview}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-800 dark:text-gray-100${pipelineBtn(codeRevStatus)}`}
              >
                {codeRevStatus === "running" ? (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
                )}
                Code Review
                {statusBadge(codeRevStatus)}
              </button>
              <button
                data-testid="btn-code-review-dropdown"
                onClick={() => setGroupDropOpen(v => !v)}
                className="px-2 py-2 text-sm bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-l border-gray-300 dark:border-gray-600 transition-colors text-gray-600 dark:text-gray-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1 pl-1">{codeRevGroup}</p>

            {groupDropOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[220px] py-1">
                {["Auto (today's rotation)", ...CODE_REVIEW_GROUPS].map(group => (
                  <button
                    key={group}
                    data-testid={`code-review-group-${group.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => { setCodeRevGroup(group); setGroupDropOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${codeRevGroup === group ? "font-semibold text-violet-600 dark:text-violet-400" : "text-gray-700 dark:text-gray-300"}`}
                  >
                    {group}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto text-xs text-gray-400 hidden md:block">
            Results → <Link href="/agent-handoff" className="text-blue-500 hover:underline">Agent Handoff Queue</Link>
          </div>
        </div>
      </section>

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

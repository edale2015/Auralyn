import { useEffect, useState, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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

const PIPELINE_STAGES = [
  { icon: "📡", label: "Scan",           desc: "RSS feeds + saved Medium lists fetched" },
  { icon: "🏷️", label: "Triage",         desc: "Auto-scored: Adopt (≥50), Test Only (≥34), Ignore (<34)" },
  { icon: "🤖", label: "AI Summary",     desc: "GPT-4o reads the article, writes key takeaways" },
  { icon: "🏗️", label: "Code Proposal",  desc: "GPT-4o proposes TypeScript code changes for this app" },
  { icon: "🛡️", label: "Safety Review",  desc: "Claude audits for HIPAA, FDA SaMD, clinical safety risks" },
  { icon: "🔬", label: "Slice Review",   desc: "Claude reviews architecture + coupling across files" },
  { icon: "✨", label: "Refine",         desc: "GPT-4o refines the code using both Claude reviews" },
  { icon: "👤", label: "Your Approval",  desc: "You review and approve or reject in Agent Handoff Queue" },
  { icon: "⚙️", label: "Implement",      desc: "Agent applies the approved code changes to the app" },
];

const HANDOFF_STATUS_LEGEND = [
  { status: "running",           color: "bg-blue-100 text-blue-700",     label: "Running",            desc: "AI pipeline in progress (steps 3–7 above)" },
  { status: "awaiting_approval", color: "bg-yellow-100 text-yellow-700", label: "Awaiting Approval",  desc: "Pipeline done — waiting for you to review" },
  { status: "approved",          color: "bg-green-100 text-green-700",   label: "Approved",           desc: "You approved it — queued for implementation" },
  { status: "implementing",      color: "bg-purple-100 text-purple-700", label: "Implementing",       desc: "Agent is writing the code changes" },
  { status: "implemented",       color: "bg-emerald-100 text-emerald-700", label: "Implemented",      desc: "Code changes applied to the app" },
  { status: "rejected",          color: "bg-red-100 text-red-700",       label: "Rejected",           desc: "You rejected this article's changes" },
  { status: "failed",            color: "bg-gray-100 text-gray-600",     label: "Failed",             desc: "AI pipeline error — click Retry in Agent Handoff Queue" },
];

const CODE_REVIEW_STEPS = [
  { letter: "A",  label: "GPT-4o Architecture Review", key: "openaiCodeProposal" },
  { letter: "B",  label: "Claude Safety Review",        key: "claudeCodeReview"  },
  { letter: "B2", label: "Claude Slice Review",         key: "claudeSliceReview" },
  { letter: "C",  label: "GPT-4o Refiner & Finalise",  key: "openaiRefinedCode" },
];

function InlineInbox() {
  const [filter, setFilter] = useState("all");
  const articlesQ = useQuery<{ ok: boolean; articles: any[] }>({
    queryKey: ["/api/research/articles"],
  });
  const all: any[] = articlesQ.data?.articles ?? [];
  const counts: Record<string, number> = {
    all:        all.length,
    adopt:      all.filter(a => a.verdict === "adopt").length,
    test_only:  all.filter(a => a.verdict === "test_only").length,
    ignore:     all.filter(a => a.verdict === "ignore").length,
    unreviewed: all.filter(a => !a.verdict).length,
  };
  const FILTERS = [
    { value: "all",        label: "All" },
    { value: "adopt",      label: "Adopt" },
    { value: "test_only",  label: "Test Only" },
    { value: "ignore",     label: "Ignore" },
    { value: "unreviewed", label: "Unreviewed" },
  ];
  const filtered = filter === "all" ? all : all.filter(a =>
    a.verdict === filter || (!a.verdict && filter === "unreviewed")
  );
  const verdictStyle = (v: string) =>
    v === "adopt"     ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" :
    v === "test_only" ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" :
                        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";

  return (
    <div className="mt-3 rounded-xl border bg-white dark:bg-gray-900/60 p-4 space-y-3" data-testid="inline-inbox">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Research Inbox</span>
          <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{all.length} articles</span>
        </div>
        <Link href="/research-inbox" className="text-xs text-blue-500 hover:underline font-medium" data-testid="link-open-full-inbox">
          Open full inbox →
        </Link>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            data-testid={`inbox-filter-${f.value}`}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f.value
                ? "bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
            }`}
          >
            {f.label}{counts[f.value] > 0 ? ` (${counts[f.value]})` : ""}
          </button>
        ))}
      </div>

      {articlesQ.isLoading ? (
        <p className="text-sm text-gray-400 py-3 text-center">Loading articles…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-3 text-center">
          {all.length === 0 ? "No articles yet — run Scan Feeds or Full Run to populate." : "No articles in this category."}
        </p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
          {filtered.map((a: any) => (
            <Link key={a.id} href="/research-inbox" data-testid={`inline-article-${a.id}`}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer group transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug text-gray-800 dark:text-gray-100 truncate">{a.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{a.source}{a.author ? ` · ${a.author}` : ""}</p>
                </div>
                {a.verdict ? (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${verdictStyle(a.verdict)}`}>
                    {a.verdict.replace("_", " ").toUpperCase()}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 dark:text-gray-600 shrink-0">Not triaged</span>
                )}
                <span className="text-xs text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors font-medium">View →</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 border-t pt-2 dark:border-gray-700">
        Click any article to open its detail view — triage scores, AI summary, code proposal, and approve/reject actions are all in the full inbox.
      </p>
    </div>
  );
}

export default function OperationsCockpit() {
  const { toast } = useToast();
  const [data, setData] = useState<OpsSummary | null>(null);
  const [error, setError] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showPipelineGuide, setShowPipelineGuide] = useState(false);

  // Research pipeline state
  const [fullRunStatus,   setFullRunStatus]   = useState<PipelineStatus>("idle");
  const [mediumRunStatus, setMediumRunStatus] = useState<PipelineStatus>("idle");
  const [codeRevStatus,   setCodeRevStatus]   = useState<PipelineStatus>("idle");
  const [codeRevGroup,    setCodeRevGroup]    = useState<string>("Auto (today's rotation)");
  const [groupDropOpen,   setGroupDropOpen]   = useState(false);
  const [lastRunResult,   setLastRunResult]   = useState<{
    label: string; scanned: number; adopted: number; testOnly: number; ignored: number; ts: Date;
  } | null>(null);
  const [bgProcessing,    setBgProcessing]    = useState(false);

  // Research Inbox inline panel
  const [showInbox, setShowInbox] = useState(false);

  // Live code review tracking
  const [liveReviewId,   setLiveReviewId]   = useState<number | null>(null);
  const [liveReviewData, setLiveReviewData] = useState<any>(null);
  const liveReviewPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  function stopReviewPoll() {
    if (liveReviewPollRef.current) {
      clearInterval(liveReviewPollRef.current);
      liveReviewPollRef.current = null;
    }
  }

  function startReviewPoll(handoffId: number) {
    stopReviewPoll();
    async function pollOnce() {
      try {
        const res = await fetch(`/api/agent-handoffs/${handoffId}`);
        const d = await res.json();
        setLiveReviewData(d);
        if (d.pipelineStatus !== "running") {
          stopReviewPoll();
          setCodeRevStatus("done");
          setTimeout(() => setCodeRevStatus("idle"), 8000);
        }
      } catch {}
    }
    pollOnce();
    liveReviewPollRef.current = setInterval(pollOnce, 4000);
  }

  useEffect(() => () => stopReviewPoll(), []);

  async function triggerPipeline(
    endpoint: string,
    body: Record<string, unknown> | undefined,
    setStatus: (s: PipelineStatus) => void,
    label: string,
  ) {
    setStatus("running");
    try {
      const res = await apiRequest("POST", endpoint, body);
      const d = await res.json().catch(() => ({})) as any;
      setStatus("done");

      const scanned  = d?.scanned  ?? 0;
      const adopted  = d?.adopted  ?? 0;
      const testOnly = d?.testOnly ?? 0;
      const ignored  = d?.ignored  ?? 0;

      if (scanned > 0 || adopted > 0) {
        setLastRunResult({ label, scanned, adopted, testOnly, ignored, ts: new Date() });
        setBgProcessing(true);
        setTimeout(() => setBgProcessing(false), 75_000);
      }

      const desc = scanned > 0
        ? `${scanned} new articles scanned — ${adopted > 0 ? `${adopted} promoted to Handoff Queue` : "none met the adopt threshold (score ≥ 50)"}`
        : "No new articles found (feeds may be up to date)";

      toast({ title: `${label} complete`, description: desc });
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
    triggerPipeline("/api/research/medium-run", undefined, setMediumRunStatus, "Medium Only");
  }

  async function handleCodeReview() {
    const groupName = codeRevGroup === "Auto (today's rotation)" ? undefined : codeRevGroup;
    setCodeRevStatus("running");
    setGroupDropOpen(false);
    setLiveReviewData(null);
    setLiveReviewId(null);
    try {
      const res = await apiRequest("POST", "/api/research/app-code-review", groupName ? { groupName } : undefined);
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "Code review failed to start");
      setLiveReviewId(d.handoffId);
      startReviewPoll(d.handoffId);
      toast({
        title: "Code review started",
        description: `Reviewing "${d.groupName}" — watch the 4-step progress panel below.`,
      });
    } catch (e: any) {
      setCodeRevStatus("error");
      toast({ title: "Code Review failed", description: e?.message, variant: "destructive" });
      setTimeout(() => setCodeRevStatus("idle"), 6000);
    }
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

  // Code review live state helpers
  const crDone = (field: string) => liveReviewData?.[field] != null;
  const crStatus = liveReviewData?.pipelineStatus ?? (liveReviewId ? "running" : "idle");
  const crCompletedCount = CODE_REVIEW_STEPS.filter(s => crDone(s.key)).length;
  const crActiveIdx = crStatus === "running" ? crCompletedCount : 4;
  const crFailed  = crStatus === "failed";
  const crReady   = crStatus === "awaiting_approval";
  const crRunning = crStatus === "running";

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
              Medium articles → AI code proposal → Claude safety review → your approval → app implementation
            </p>
          </div>
          <button
            className="text-xs text-blue-500 hover:underline"
            onClick={() => setShowPipelineGuide(v => !v)}
            data-testid="btn-pipeline-guide"
          >
            {showPipelineGuide ? "Hide pipeline guide ↑" : "How does this work? ↓"}
          </button>
        </div>

        {/* Pipeline guide — collapsible */}
        {showPipelineGuide && (
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-900 p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                Article → Code Pipeline (9 stages)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PIPELINE_STAGES.map((stage, i) => (
                  <div key={i} className="flex items-start gap-2 bg-white dark:bg-gray-900 rounded-lg border border-blue-100 dark:border-blue-900 px-3 py-2">
                    <span className="text-base shrink-0 mt-0.5">{stage.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{i + 1}. {stage.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{stage.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Status labels you'll see in the Agent Handoff Queue
              </p>
              <div className="flex flex-wrap gap-2">
                {HANDOFF_STATUS_LEGEND.map(({ status, color, label, desc }) => (
                  <div key={status} className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong>Medium Only</strong> runs stages 1–7 for all articles. Articles scored "adopt" (≥50 pts) appear in the{" "}
              <Link href="/agent-handoff" className="text-blue-500 hover:underline">Agent Handoff Queue</Link> at stage 7, waiting for your approval.
              Click <strong>Code Review</strong> to run the 4-step AI code review on existing app files (no article needed).
            </p>
          </div>
        )}

        {/* Trigger buttons */}
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
            <div className="flex rounded-lg overflow-hidden border border-blue-400">
              <button
                data-testid="btn-code-review"
                disabled={codeRevStatus === "running"}
                onClick={handleCodeReview}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors${pipelineBtn(codeRevStatus)}`}
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
                className="px-2 py-2 text-sm bg-blue-500 hover:bg-blue-600 border-l border-blue-400 transition-colors text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1 pl-1">{codeRevGroup}</p>

            {groupDropOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[220px] py-1">
                <p className="px-4 pt-2 pb-1 text-xs text-gray-400">No article needed — reviews live app files</p>
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

          {/* Research Inbox toggle */}
          <button
            data-testid="btn-toggle-inbox"
            onClick={() => setShowInbox(v => !v)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold border transition-colors ${
              showInbox
                ? "bg-gray-800 text-white border-gray-700 hover:bg-gray-900 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-300"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Research Inbox
            <svg className={`h-3 w-3 transition-transform ${showInbox ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>

          <div className="ml-auto text-xs text-gray-400 hidden md:block">
            Results → <Link href="/agent-handoff" className="text-blue-500 hover:underline">Agent Handoff Queue</Link>
          </div>
        </div>

        {/* Live Code Review Progress Panel */}
        {liveReviewId !== null && (
          <div className={`mt-3 rounded-xl border p-4 space-y-3 ${
            crFailed ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" :
            crReady  ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800" :
                       "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800"
          }`} data-testid="code-review-progress-panel">

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {crFailed ? (
                  <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                ) : crReady ? (
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                ) : (
                  <svg className="animate-spin w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                )}
                <span className={`text-sm font-semibold ${crFailed ? "text-red-700" : crReady ? "text-emerald-800 dark:text-emerald-300" : "text-blue-800 dark:text-blue-300"}`}>
                  {crFailed
                    ? "Code Review Failed"
                    : crReady
                      ? `Review Complete — open Agent Handoff Queue to approve`
                      : `Code Review Running (${crCompletedCount}/4 steps complete)`}
                </span>
                {crRunning && (
                  <span className="text-xs text-blue-400 font-mono">handoff #{liveReviewId}</span>
                )}
              </div>
              {(crReady || crFailed) && (
                <button
                  className="text-gray-400 hover:text-gray-600 text-sm"
                  onClick={() => { setLiveReviewId(null); setLiveReviewData(null); }}
                  aria-label="Dismiss"
                >✕</button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CODE_REVIEW_STEPS.map((step, i) => {
                const complete = crDone(step.key);
                const active   = i === crActiveIdx && !crFailed;
                return (
                  <div
                    key={step.key}
                    className={`flex flex-col gap-1.5 p-2.5 rounded-lg border text-xs ${
                      complete ? "bg-white border-emerald-300 dark:bg-gray-900 dark:border-emerald-700" :
                      active   ? "bg-white border-blue-400 dark:bg-gray-900 dark:border-blue-600" :
                      crFailed && i === crCompletedCount ? "bg-white border-red-300 dark:bg-gray-900 dark:border-red-700" :
                                  "bg-white/50 border-gray-200 opacity-40 dark:bg-gray-900/40 dark:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {complete ? (
                        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      ) : active ? (
                        <svg className="animate-spin w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      ) : crFailed && i === crCompletedCount ? (
                        <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600 shrink-0" />
                      )}
                      <span className={`font-mono font-bold text-[10px] ${complete ? "text-emerald-600 dark:text-emerald-400" : active ? "text-blue-600 dark:text-blue-400" : "text-gray-400"}`}>
                        Step {step.letter}
                      </span>
                    </div>
                    <span className={`leading-tight ${complete || active ? "text-gray-700 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {liveReviewData?.articleSummary && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic leading-snug">{liveReviewData.articleSummary}</p>
            )}

            {crReady && (
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  All 4 steps complete —{" "}
                  <Link href="/agent-handoff" className="underline hover:no-underline">open Agent Handoff Queue</Link>{" "}
                  to review and approve the code changes.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Medium Run Last Result Strip */}
        {lastRunResult && (
          <div className="mt-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-testid="last-run-result">
            <span className="font-semibold text-blue-700 dark:text-blue-300">{lastRunResult.label}</span>
            <span className="text-gray-500 dark:text-gray-400 text-xs">{lastRunResult.ts.toLocaleTimeString()}</span>
            <span className="text-gray-700 dark:text-gray-200">
              <span className="font-semibold">{lastRunResult.scanned}</span> new articles scanned
            </span>
            {lastRunResult.adopted > 0 ? (
              <span className="text-green-700 dark:text-green-400 font-semibold">
                ✓ {lastRunResult.adopted} promoted to{" "}
                <Link href="/agent-handoff" className="underline hover:no-underline">Agent Handoff Queue</Link>
                {" "}— AI code proposal + reviews running in background (~60s)
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">0 met adopt threshold (score &lt; 50)</span>
            )}
            {lastRunResult.testOnly > 0 && (
              <span className="text-gray-500 dark:text-gray-400">
                {lastRunResult.testOnly} test-only in{" "}
                <Link href="/research-inbox" className="text-blue-500 hover:underline">Research Inbox</Link>
              </span>
            )}
            {bgProcessing && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Building AI summaries + code proposals…
              </span>
            )}
          </div>
        )}

        {/* Research Inbox inline panel */}
        {showInbox && <InlineInbox />}
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

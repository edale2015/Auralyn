import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import {
  MessageSquare,
  Bot,
  Flag,
  RefreshCw,
  TrendingUp,
  Clock,
  Star,
  ThumbsUp,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Monitor,
} from "lucide-react";

const MOOD_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  distressed: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  concerned: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  calm: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  unknown: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const DIRECTION_COLORS: Record<string, string> = {
  inbound: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  outbound: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  llm_call: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
};

const CHANNEL_ICONS: Record<string, any> = {
  telegram: Smartphone,
  whatsapp: MessageSquare,
  web: Monitor,
  api: Bot,
};

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-gray-800 dark:text-gray-100",
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card data-testid={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
            <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
            {sub && <div className="text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InteractionRow({ row, onFlag }: { row: any; onFlag: (id: number, reason: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [flagOpen, setFlagOpen] = useState(false);
  const ChannelIcon = CHANNEL_ICONS[row.channel] ?? MessageSquare;

  const ts = new Date(row.created_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const preview = (row.message_text ?? row.prompt_text ?? "").slice(0, 120);

  return (
    <div
      data-testid={`interaction-row-${row.id}`}
      className={`border-b dark:border-gray-800 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors ${row.flagged ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-1.5 rounded bg-gray-100 dark:bg-gray-800">
          <ChannelIcon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{ts}</span>
            <Badge className={`text-xs py-0 ${DIRECTION_COLORS[row.direction] ?? ""}`} variant="secondary">
              {row.direction}
            </Badge>
            {row.mood_label && row.mood_label !== "unknown" && (
              <Badge className={`text-xs py-0 ${MOOD_COLORS[row.mood_label] ?? ""}`} variant="secondary">
                {row.mood_label}
              </Badge>
            )}
            {row.skill_name && (
              <Badge variant="outline" className="text-xs py-0 text-gray-500 dark:text-gray-400">
                {row.skill_name}
              </Badge>
            )}
            {row.flagged && (
              <Badge variant="destructive" className="text-xs py-0">
                <Flag className="h-2.5 w-2.5 mr-0.5" /> flagged
              </Badge>
            )}
            {row.latency_ms && (
              <span className="text-xs text-gray-400 dark:text-gray-500">{row.latency_ms}ms</span>
            )}
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 truncate">{preview || <em className="text-gray-400">—</em>}</div>
          {expanded && (
            <div className="mt-3 space-y-2 text-xs">
              {row.message_text && (
                <div>
                  <div className="font-semibold text-gray-500 dark:text-gray-400 mb-0.5">Message</div>
                  <pre className="bg-gray-100 dark:bg-gray-800 rounded p-2 whitespace-pre-wrap text-gray-700 dark:text-gray-300">{row.message_text}</pre>
                </div>
              )}
              {row.prompt_text && (
                <div>
                  <div className="font-semibold text-gray-500 dark:text-gray-400 mb-0.5">Prompt sent to AI</div>
                  <pre className="bg-blue-50 dark:bg-blue-900/20 rounded p-2 whitespace-pre-wrap text-gray-700 dark:text-gray-300">{row.prompt_text}</pre>
                </div>
              )}
              {row.response_text && (
                <div>
                  <div className="font-semibold text-gray-500 dark:text-gray-400 mb-0.5">AI Response</div>
                  <pre className="bg-green-50 dark:bg-green-900/20 rounded p-2 whitespace-pre-wrap text-gray-700 dark:text-gray-300">{row.response_text}</pre>
                </div>
              )}
              <div className="flex gap-4 text-gray-400 dark:text-gray-500">
                {row.session_id && <span>Session: <code className="text-xs">{row.session_id}</code></span>}
                {row.case_id && <span>Case: <code className="text-xs">{row.case_id}</code></span>}
                {row.model_used && <span>Model: {row.model_used}</span>}
                {row.tone_label && <span>Tone: {row.tone_label}</span>}
                {row.mood_score != null && <span>Mood score: {(parseFloat(row.mood_score) * 100).toFixed(0)}%</span>}
              </div>
              {row.flag_reason && (
                <div className="text-red-600 dark:text-red-400">Flag reason: {row.flag_reason}</div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!row.flagged && (
            <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`flag-btn-${row.id}`}>
                  <Flag className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Flag interaction for review</DialogTitle>
                </DialogHeader>
                <Textarea
                  placeholder="Reason for flagging…"
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="min-h-20"
                  data-testid="flag-reason-input"
                />
                <Button
                  onClick={() => { onFlag(row.id, flagReason); setFlagOpen(false); setFlagReason(""); }}
                  disabled={!flagReason.trim()}
                  data-testid="flag-submit-btn"
                >
                  Submit flag
                </Button>
              </DialogContent>
            </Dialog>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setExpanded(!expanded)}
            data-testid={`expand-btn-${row.id}`}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SessionRow({ s }: { s: any }) {
  const aht = s.aht_seconds ? `${Math.floor(s.aht_seconds / 60)}m ${s.aht_seconds % 60}s` : "—";
  const started = s.started_at ? new Date(s.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const ChannelIcon = CHANNEL_ICONS[s.channel] ?? MessageSquare;

  return (
    <tr className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50" data-testid={`session-row-${s.id}`}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <ChannelIcon className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate max-w-32">{s.session_id?.slice(-12)}</span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{started}</td>
      <td className="px-4 py-2.5 text-xs">{aht}</td>
      <td className="px-4 py-2.5 text-xs text-center">
        {s.fcr ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" /> : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-xs text-center">{s.message_count ?? "—"}</td>
      <td className="px-4 py-2.5 text-xs text-center">
        {s.csat_score ? (
          <span className={`font-semibold ${s.csat_score >= 4 ? "text-green-600" : s.csat_score >= 3 ? "text-yellow-600" : "text-red-600"}`}>
            {s.csat_score}/5
          </span>
        ) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-xs text-center">
        {s.nps_score != null ? (
          <span className={`font-semibold ${s.nps_score >= 9 ? "text-green-600" : s.nps_score >= 7 ? "text-yellow-600" : "text-red-600"}`}>
            {s.nps_score}/10
          </span>
        ) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-xs">
        {s.disposition_reached ? (
          <Badge variant="outline" className="text-xs">{s.disposition_reached.replace(/_/g, " ")}</Badge>
        ) : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  );
}

export default function AIInteractionMonitorPage() {
  const qc = useQueryClient();
  const [channel, setChannel] = useState("all");
  const [direction, setDirection] = useState("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<"feed" | "sessions">("feed");

  const statsQuery = useQuery({
    queryKey: ["/api/audit/stats"],
    refetchInterval: 30000,
  });

  const feedQuery = useQuery({
    queryKey: ["/api/audit/interactions", channel, direction, flaggedOnly],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "80" });
      if (channel !== "all") params.set("channel", channel);
      if (direction !== "all") params.set("direction", direction);
      if (flaggedOnly) params.set("flagged", "true");
      return fetch(`/api/audit/interactions?${params}`).then((r) => r.json());
    },
    refetchInterval: 15000,
  });

  const sessionsQuery = useQuery({
    queryKey: ["/api/audit/sessions", channel],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });
      if (channel !== "all") params.set("channel", channel);
      return fetch(`/api/audit/sessions?${params}`).then((r) => r.json());
    },
    refetchInterval: 20000,
  });

  const flagMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `/api/audit/flag/${id}`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/audit/interactions"] });
    },
  });

  const stats = statsQuery.data ?? {};
  const interactions = feedQuery.data?.interactions ?? [];
  const sessions = sessionsQuery.data?.sessions ?? [];

  const avgCsat = stats.sessions?.avg_csat;
  const avgNps = stats.sessions?.avg_nps;
  const avgAht = stats.sessions?.avg_aht_seconds;
  const fcrRate = stats.sessions?.total_sessions > 0
    ? Math.round((stats.sessions.fcr_sessions / stats.sessions.total_sessions) * 100)
    : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Interaction Monitor</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Full transparency and audit of every patient ↔ AI exchange — mood, tone, CSAT, NPS, AHT, FCR
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { qc.invalidateQueries({ queryKey: ["/api/audit/stats"] }); qc.invalidateQueries({ queryKey: ["/api/audit/interactions"] }); }}
          data-testid="refresh-btn"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <MetricCard icon={MessageSquare} label="Interactions (7d)" value={stats.interactions?.total_interactions ?? "—"} />
        <MetricCard icon={TrendingUp} label="Avg CSAT" value={avgCsat != null ? `${avgCsat}/5` : "—"} color={avgCsat >= 4 ? "text-green-600" : avgCsat >= 3 ? "text-yellow-600" : "text-red-600"} />
        <MetricCard icon={ThumbsUp} label="Avg NPS" value={avgNps != null ? `${avgNps}/10` : "—"} color={avgNps >= 9 ? "text-green-600" : avgNps >= 7 ? "text-yellow-600" : "text-red-600"} />
        <MetricCard icon={Clock} label="Avg AHT" value={avgAht != null ? `${Math.floor(avgAht / 60)}m${avgAht % 60}s` : "—"} />
        <MetricCard icon={CheckCircle2} label="FCR Rate" value={fcrRate != null ? `${fcrRate}%` : "—"} color={fcrRate >= 80 ? "text-green-600" : fcrRate >= 60 ? "text-yellow-600" : "text-red-600"} />
        <MetricCard icon={AlertTriangle} label="Flagged" value={stats.interactions?.total_flagged ?? "—"} color={stats.interactions?.total_flagged > 0 ? "text-red-600" : "text-gray-800 dark:text-gray-100"} />
        <MetricCard icon={Bot} label="LLM Calls" value={stats.interactions?.total_llm_calls ?? "—"} sub={stats.interactions?.avg_llm_latency_ms ? `avg ${stats.interactions.avg_llm_latency_ms}ms` : undefined} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Urgent mood", count: stats.interactions?.mood_urgent, color: "text-red-600" },
          { label: "Distressed", count: stats.interactions?.mood_distressed, color: "text-orange-600" },
          { label: "Concerned", count: stats.interactions?.mood_concerned, color: "text-yellow-600" },
          { label: "Calm", count: stats.interactions?.mood_calm, color: "text-green-600" },
        ].map(({ label, count, color }) => (
          <Card key={label} data-testid={`mood-card-${label.toLowerCase()}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`text-xl font-bold ${color}`}>{count ?? "—"}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1">
              <Button
                variant={activeTab === "feed" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("feed")}
                data-testid="tab-feed"
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" /> Interaction Feed
              </Button>
              <Button
                variant={activeTab === "sessions" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("sessions")}
                data-testid="tab-sessions"
              >
                <Star className="h-3.5 w-3.5 mr-1.5" /> Session Quality
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="h-8 w-32 text-xs" data-testid="filter-channel">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>
              {activeTab === "feed" && (
                <Select value={direction} onValueChange={setDirection}>
                  <SelectTrigger className="h-8 w-36 text-xs" data-testid="filter-direction">
                    <SelectValue placeholder="Direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All directions</SelectItem>
                    <SelectItem value="inbound">Inbound (patient)</SelectItem>
                    <SelectItem value="outbound">Outbound (bot)</SelectItem>
                    <SelectItem value="llm_call">LLM calls</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {activeTab === "feed" && (
                <Button
                  variant={flaggedOnly ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setFlaggedOnly(!flaggedOnly)}
                  className="h-8 text-xs"
                  data-testid="filter-flagged"
                >
                  <Flag className="h-3 w-3 mr-1" />
                  {flaggedOnly ? "Flagged only" : "Show flagged"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {activeTab === "feed" && (
            <>
              {feedQuery.isLoading && (
                <div className="flex items-center justify-center py-16 text-gray-400">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading…
                </div>
              )}
              {!feedQuery.isLoading && interactions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
                  <div className="text-sm">No interactions yet — they'll appear here once patients begin chatting.</div>
                </div>
              )}
              <div className="max-h-[600px] overflow-y-auto" data-testid="interaction-feed">
                {interactions.map((row: any) => (
                  <InteractionRow
                    key={row.id}
                    row={row}
                    onFlag={(id, reason) => flagMutation.mutate({ id, reason })}
                  />
                ))}
              </div>
            </>
          )}
          {activeTab === "sessions" && (
            <>
              {sessionsQuery.isLoading && (
                <div className="flex items-center justify-center py-16 text-gray-400">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading…
                </div>
              )}
              {!sessionsQuery.isLoading && sessions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Star className="h-8 w-8 mb-2 opacity-40" />
                  <div className="text-sm">No session data yet — CSAT and NPS scores will appear here after patients complete surveys.</div>
                </div>
              )}
              {sessions.length > 0 && (
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto" data-testid="sessions-table">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-800">
                      <tr>
                        {["Session", "Started", "AHT", "FCR", "Msgs", "CSAT", "NPS", "Disposition"].map((h) => (
                          <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s: any) => <SessionRow key={s.id} s={s} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import { MessageSquare, Send, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Zap, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChannelMetrics {
  inboundCount: number;
  dedupeHits: number;
  avgProcessingMs: number;
  p95ProcessingMs: number;
  frictionEscalations: number;
  frictionStops: number;
  circuitBreakerActivations: number;
  llmBudgetHits: number;
  emergencyWarningsSent: number;
  llm: {
    callsUsed: number;
    tokensUsed: number;
    budgetExceededCount: number;
    circuitBreakerTrips: number;
    fallbackCount: number;
    cooldownActive: boolean;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
}

interface ChannelStatus {
  configured: boolean;
  enabled: boolean;
  from?: string;
  metrics: ChannelMetrics | null;
}

interface MessagingStatus {
  ok: boolean;
  resetAt: string;
  channels: {
    whatsapp: ChannelStatus;
    telegram: ChannelStatus;
  };
  summary: {
    totalInbound: number;
    totalFrictionEscalations: number;
    anyCircuitBreakerActive: boolean;
  };
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "destructive"} className="gap-1 text-xs" data-testid={`badge-status-${label}`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </Badge>
  );
}

function MetricRow({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1 border-b last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-mono font-semibold ${warn ? "text-amber-600" : ""}`}>{value}</span>
    </div>
  );
}

function ChannelCard({ name, status, icon }: { name: string; status: ChannelStatus; icon: React.ReactNode }) {
  const m = status.metrics;
  const healthy = status.configured && status.enabled && !m?.llm?.cooldownActive;

  return (
    <Card data-testid={`card-channel-${name}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <span className="capitalize">{name}</span>
          </div>
          <div className="flex gap-2">
            <StatusBadge ok={status.configured} label="configured" />
            <StatusBadge ok={status.enabled} label="enabled" />
            {m?.llm?.cooldownActive && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="w-3 h-3" /> circuit open
              </Badge>
            )}
            {healthy && <StatusBadge ok label="healthy" />}
          </div>
        </CardTitle>
        {status.from && <p className="text-xs text-muted-foreground font-mono">{status.from}</p>}
      </CardHeader>
      {m ? (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-muted/40 rounded-lg p-2">
              <div className="text-lg font-bold" data-testid={`inbound-${name}`}>{m.inboundCount}</div>
              <div className="text-xs text-muted-foreground">Inbound msgs</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-2">
              <div className="text-lg font-bold">{m.llm.callsUsed}</div>
              <div className="text-xs text-muted-foreground">LLM calls</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-2">
              <div className={`text-lg font-bold ${m.frictionEscalations > 0 ? "text-amber-600" : ""}`}>{m.frictionEscalations}</div>
              <div className="text-xs text-muted-foreground">Friction escalations</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-2">
              <div className="text-lg font-bold">{m.emergencyWarningsSent}</div>
              <div className="text-xs text-muted-foreground">Emergency warns</div>
            </div>
          </div>

          <div className="space-y-0.5 mt-2">
            <MetricRow label="Avg processing" value={`${m.avgProcessingMs}ms`} />
            <MetricRow label="P95 processing" value={`${m.p95ProcessingMs}ms`} />
            <MetricRow label="Dedupe hits" value={m.dedupeHits} />
            <MetricRow label="Friction stops" value={m.frictionStops} warn={m.frictionStops > 0} />
            <MetricRow label="CB activations" value={m.circuitBreakerActivations} warn={m.circuitBreakerActivations > 0} />
            <MetricRow label="LLM tokens used" value={m.llm.tokensUsed.toLocaleString()} />
            <MetricRow label="LLM avg latency" value={`${m.llm.avgLatencyMs}ms`} />
            <MetricRow label="LLM P95 latency" value={`${m.llm.p95LatencyMs}ms`} />
            <MetricRow label="LLM budget hits" value={m.llm.budgetExceededCount} warn={m.llm.budgetExceededCount > 0} />
            <MetricRow label="LLM fallbacks" value={m.llm.fallbackCount} />
          </div>
        </CardContent>
      ) : (
        <CardContent>
          <p className="text-sm text-muted-foreground italic">No traffic recorded yet.</p>
        </CardContent>
      )}
    </Card>
  );
}

export default function MessagingStatusPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<MessagingStatus>({
    queryKey: ["/api/messaging/status"],
    refetchInterval: 30_000,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/messaging/reset-metrics");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Metrics reset" });
      qc.invalidateQueries({ queryKey: ["/api/messaging/status"] });
    },
  });

  const barData = data
    ? [
        { name: "WhatsApp", inbound: data.channels.whatsapp.metrics?.inboundCount ?? 0, llm: data.channels.whatsapp.metrics?.llm?.callsUsed ?? 0 },
        { name: "Telegram", inbound: data.channels.telegram.metrics?.inboundCount ?? 0, llm: data.channels.telegram.metrics?.llm?.callsUsed ?? 0 },
      ]
    : [];

  return (
    <div className="p-6 space-y-6" data-testid="page-messaging-status">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Messaging Channel Status</h2>
          {data?.summary.anyCircuitBreakerActive && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" /> Circuit breaker active
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh metrics (auto-refreshes every 30s)</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending} data-testid="button-reset-metrics">
            <RotateCcw className="w-4 h-4 mr-1" /> Reset Metrics
          </Button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="text-center p-3">
            <div className="text-2xl font-bold text-primary" data-testid="stat-total-inbound">{data.summary.totalInbound}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Inbound</div>
          </Card>
          <Card className="text-center p-3">
            <div className={`text-2xl font-bold ${data.summary.totalFrictionEscalations > 0 ? "text-amber-600" : "text-primary"}`}>
              {data.summary.totalFrictionEscalations}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Friction Escalations</div>
          </Card>
          <Card className="text-center p-3">
            <div className={`text-2xl font-bold ${data.summary.anyCircuitBreakerActive ? "text-destructive" : "text-green-600"}`}>
              {data.summary.anyCircuitBreakerActive ? "OPEN" : "CLOSED"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Circuit Breaker</div>
          </Card>
          <Card className="text-center p-3">
            <div className="text-2xl font-bold text-primary">{Object.values(data.channels).filter((c) => c.configured && c.enabled).length}</div>
            <div className="text-xs text-muted-foreground mt-1">Active Channels</div>
          </Card>
        </div>
      )}

      {barData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Message Volume by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData} barCategoryGap="30%">
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Bar dataKey="inbound" name="Inbound" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="llm" name="LLM Calls" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChannelCard
            name="whatsapp"
            status={data.channels.whatsapp}
            icon={<Send className="w-4 h-4 text-green-600" />}
          />
          <ChannelCard
            name="telegram"
            status={data.channels.telegram}
            icon={<Zap className="w-4 h-4 text-blue-500" />}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="text-error">Failed to load messaging status.</p>
      )}

      {data && (
        <p className="text-xs text-muted-foreground">
          Metrics collected since: {data.resetAt ? new Date(data.resetAt).toLocaleString() : "startup"}
        </p>
      )}
    </div>
  );
}

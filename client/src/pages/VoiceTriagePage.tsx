import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Phone, PhoneOff, PhoneMissed, AlertTriangle } from "lucide-react";

const STATUS_ICON: Record<string, any> = {
  active:       Phone,
  completed:    PhoneOff,
  emergency:    AlertTriangle,
  error:        PhoneMissed,
  "no-response": PhoneMissed,
};

const STATUS_COLOR: Record<string, string> = {
  active:       "border-green-800/40 bg-green-950/20 text-green-400",
  completed:    "border-border/40 bg-muted/10 text-muted-foreground",
  emergency:    "border-red-800/40 bg-red-950/20 text-red-400",
  error:        "border-red-800/40 bg-red-950/10 text-red-400",
  "no-response":"border-amber-800/40 bg-amber-950/10 text-amber-400",
};

function SessionCard({ s }: { s: any }) {
  const Icon = STATUS_ICON[s.status] ?? Phone;
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-xs ${STATUS_COLOR[s.status] ?? "border-border/40"}`} data-testid={`card-voice-${s.callSid}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono font-semibold text-[11px]">{s.callSid}</span>
            <Badge variant="outline" className="text-[9px] h-3.5 px-1">{s.status}</Badge>
            {s.turnCount > 0 && <span className="text-muted-foreground">{s.turnCount} turns</span>}
            {s.durationSecs && <span className="text-muted-foreground">{s.durationSecs}s</span>}
          </div>
          {s.complaint && <p className="mt-1 text-muted-foreground truncate"><span className="text-foreground">Complaint:</span> {s.complaint}</p>}
          {s.disposition && <p className="mt-0.5 font-medium">{s.disposition}</p>}
          {s.transcript?.length > 0 && (
            <div className="mt-1.5 space-y-0.5 max-h-20 overflow-y-auto">
              {s.transcript.map((line: string, i: number) => (
                <p key={i} className={`text-[10px] ${line.startsWith("[AI]") ? "text-blue-400" : "text-muted-foreground"}`}>{line}</p>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">{new Date(s.startedAt).toLocaleString()}</p>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{s.from}</span>
      </div>
    </div>
  );
}

export default function VoiceTriagePage() {
  const [active,    setActive]    = useState<any[]>([]);
  const [completed, setCompleted] = useState<any[]>([]);
  const [stats,     setStats]     = useState<any>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [ra, rc, rs] = await Promise.allSettled([
        fetch("/api/voice-monitor/sessions/active").then(r => r.json()),
        fetch("/api/voice-monitor/sessions/completed?limit=20").then(r => r.json()),
        fetch("/api/voice-monitor/stats").then(r => r.json()),
      ]);
      if (ra.status === "fulfilled") setActive(ra.value.sessions ?? []);
      if (rc.status === "fulfilled") setCompleted(rc.value.sessions ?? []);
      if (rs.status === "fulfilled") setStats(rs.value.stats);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 3000);
    return () => clearInterval(t);
  }, [fetchAll]);

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Voice Triage Monitor</h1>
          {active.length > 0 && <Badge variant="default" className="text-[10px]">{active.length} live</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={fetchAll} data-testid="btn-refresh-voice">
          <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Sessions",   value: stats.totalSessions },
            { label: "Active Now",       value: stats.active,    color: "text-green-400" },
            { label: "Completed",        value: stats.completed  },
            { label: "Avg Duration",     value: `${stats.avgDurationSecs}s`, color: "text-blue-400" },
          ].map(s => (
            <Card key={s.label} className="border-border/60">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color ?? ""}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Twilio webhook instructions */}
      <Card className="border-amber-800/40 bg-amber-950/10">
        <CardContent className="px-4 py-3 text-xs text-amber-300 space-y-1">
          <p className="font-semibold">📞 Twilio Voice Webhook Configuration</p>
          <p>Point your Twilio phone number's <strong>Voice URL</strong> to:</p>
          <code className="block bg-black/40 rounded px-2 py-1 text-green-400 text-[11px]">POST https://your-domain/api/voice/incoming</code>
          <p className="text-amber-400/70">The webhook receives calls, runs the clinical triage pipeline, and responds with TwiML. Sessions appear below in real-time.</p>
        </CardContent>
      </Card>

      {/* Active calls */}
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
          <Phone className="h-4 w-4 text-green-400" />
          <CardTitle className="text-sm font-semibold">Active Calls ({active.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {active.length === 0
            ? <p className="text-xs text-muted-foreground italic">No active calls. Waiting for inbound Twilio voice calls.</p>
            : active.map(s => <SessionCard key={s.callSid} s={s} />)}
        </CardContent>
      </Card>

      {/* Completed sessions */}
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold">Recent Sessions ({completed.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2 max-h-[420px] overflow-y-auto">
          {completed.length === 0
            ? <p className="text-xs text-muted-foreground italic">No completed sessions yet.</p>
            : completed.map(s => <SessionCard key={s.callSid} s={s} />)}
        </CardContent>
      </Card>
    </div>
  );
}

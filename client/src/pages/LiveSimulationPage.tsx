import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SimSnapshot {
  timestamp:   number;
  tick:        number;
  patients:    number;
  er:          number;
  critical:    number;
  telemed:     number;
  waitMinutes: number;
  load:        "low" | "normal" | "high" | "critical";
  erRate:      number;
}

const LOAD_COLORS: Record<string, string> = {
  low:      "bg-green-500/20 text-green-400 border-green-500/30",
  normal:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  high:     "bg-amber-500/20 text-amber-400 border-amber-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

const MAX_HISTORY = 30;

function Sparkline({ values, color = "#3b82f6" }: { values: number[]; color?: string }) {
  if (values.length < 2) return <div className="h-12 flex items-center text-xs text-muted-foreground">Collecting…</div>;

  const max = Math.max(...values, 1);
  const w = 300;
  const h = 48;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function LiveSimulationPage() {
  const [history, setHistory] = useState<SimSnapshot[]>([]);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string>("Connecting…");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl    = `${protocol}://${window.location.host}/ws/live-simulation`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setStatus("Live");
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "sim_tick") {
            setHistory(prev => [...prev.slice(-(MAX_HISTORY - 1)), msg as SimSnapshot]);
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        setStatus("Reconnecting…");
        setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  const latest = history[history.length - 1] ?? null;
  const patientHistory  = history.map(h => h.patients);
  const erHistory       = history.map(h => h.er);
  const criticalHistory = history.map(h => h.critical);
  const waitHistory     = history.map(h => h.waitMinutes);

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Hospital Simulation</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time patient load — 1-second ticks</p>
        </div>
        <div className="flex items-center gap-3">
          <span data-testid="status-connection" className={`text-sm font-medium ${connected ? "text-green-400" : "text-amber-400"}`}>
            {connected ? "● Live" : "○ " + status}
          </span>
          {latest && (
            <Badge data-testid="badge-load" className={LOAD_COLORS[latest.load]}>
              {latest.load.toUpperCase()} LOAD
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Patients",      value: latest?.patients    ?? "—", unit: "/tick",  testid: "text-patients"  },
          { label: "ER Cases",      value: latest?.er          ?? "—", unit: "/tick",  testid: "text-er"        },
          { label: "Critical",      value: latest?.critical    ?? "—", unit: "/tick",  testid: "text-critical"  },
          { label: "Wait Time",     value: latest?.waitMinutes ?? "—", unit: "min",    testid: "text-wait"      },
        ].map(({ label, value, unit, testid }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold" data-testid={testid}>{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label} <span className="opacity-60">{unit}</span></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Patients / Tick</CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline values={patientHistory} color="#3b82f6" />
            <div className="text-xs text-muted-foreground mt-1">Last {patientHistory.length} ticks</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ER Cases / Tick</CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline values={erHistory} color="#f59e0b" />
            <div className="text-xs text-muted-foreground mt-1">Last {erHistory.length} ticks</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Critical Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline values={criticalHistory} color="#ef4444" />
            <div className="text-xs text-muted-foreground mt-1">Last {criticalHistory.length} ticks</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Wait Time (min)</CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline values={waitHistory} color="#8b5cf6" />
            <div className="text-xs text-muted-foreground mt-1">Last {waitHistory.length} ticks</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Ticks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-60 overflow-y-auto font-mono text-xs">
            {[...history].reverse().slice(0, 15).map((snap, i) => (
              <div
                key={snap.tick ?? i}
                data-testid={`row-tick-${snap.tick}`}
                className={`flex gap-4 py-0.5 px-2 rounded ${
                  snap.load === "critical" ? "bg-red-500/10" :
                  snap.load === "high"     ? "bg-amber-500/10" : ""
                }`}
              >
                <span className="text-muted-foreground w-16">#{snap.tick}</span>
                <span className="w-24">pts:{snap.patients}</span>
                <span className="w-20">er:{snap.er}</span>
                <span className="w-20">crit:{snap.critical}</span>
                <span className="w-20">wait:{snap.waitMinutes}m</span>
                <span className={snap.load === "critical" ? "text-red-400" : snap.load === "high" ? "text-amber-400" : "text-muted-foreground"}>
                  {snap.load}
                </span>
              </div>
            ))}
            {history.length === 0 && (
              <div className="text-muted-foreground py-4 text-center">Waiting for first tick…</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

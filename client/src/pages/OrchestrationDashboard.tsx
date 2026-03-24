import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
  Wifi,
  WifiOff,
  Users,
  TrendingUp,
  RefreshCw,
} from "lucide-react";

type RoomStatus = "waiting" | "active" | "pending_review" | "escalated" | "complete";

interface Room {
  caseId: string;
  patientId?: string;
  complaint: string;
  status: RoomStatus;
  riskScore: number;
  protocolId?: string;
  currentStep?: string;
  lastUpdate: number;
  createdAt: number;
  channel?: string;
  flags?: string[];
}

interface RoomSummary {
  total: number;
  byStatus: Record<RoomStatus, number>;
  highRisk: number;
  escalated: number;
}

const STATUS_CONFIG: Record<RoomStatus, { label: string; color: string; bg: string; border: string; badge: "default" | "secondary" | "destructive" | "outline" }> = {
  waiting:        { label: "Waiting",        color: "text-slate-600",  bg: "bg-slate-50",   border: "border-slate-200", badge: "outline" },
  active:         { label: "Active",         color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200",  badge: "default" },
  pending_review: { label: "Pending Review", color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200", badge: "secondary" },
  escalated:      { label: "Escalated",      color: "text-red-700",    bg: "bg-red-50",     border: "border-red-200",   badge: "destructive" },
  complete:       { label: "Complete",       color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200", badge: "outline" },
};

function riskColor(score: number): string {
  if (score >= 0.7) return "text-red-600";
  if (score >= 0.4) return "text-amber-600";
  return "text-green-600";
}

function riskBarColor(score: number): string {
  if (score >= 0.7) return "bg-red-500";
  if (score >= 0.4) return "bg-amber-400";
  return "bg-green-500";
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function RoomCard({ room, onAction }: { room: Room; onAction: (caseId: string, action: string) => void }) {
  const cfg = STATUS_CONFIG[room.status] ?? STATUS_CONFIG.waiting;

  return (
    <div
      data-testid={`room-card-${room.caseId}`}
      className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-3 transition-all hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-mono text-slate-400">{room.caseId}</p>
          <h3 className="font-semibold text-sm capitalize">{room.complaint.replace(/_/g, " ")}</h3>
          {room.channel && (
            <p className="text-xs text-slate-500 mt-0.5 capitalize">{room.channel}</p>
          )}
        </div>
        <Badge variant={cfg.badge} className="shrink-0 text-xs">
          {cfg.label}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Risk</span>
          <span className={`font-bold ${riskColor(room.riskScore)}`}>
            {(room.riskScore * 100).toFixed(0)}%
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${riskBarColor(room.riskScore)}`}
            style={{ width: `${room.riskScore * 100}%` }}
          />
        </div>
      </div>

      {room.flags && room.flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {room.flags.map((f) => (
            <span key={f} className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
              {f.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      {room.protocolId && (
        <p className="text-xs text-slate-400 font-mono truncate">
          Protocol: {room.protocolId}
          {room.currentStep && ` › ${room.currentStep}`}
        </p>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-slate-200">
        <span className="text-xs text-slate-400">{timeAgo(room.lastUpdate)}</span>
        <div className="flex gap-1">
          {room.status !== "complete" && (
            <Button
              data-testid={`btn-escalate-${room.caseId}`}
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onAction(room.caseId, "escalated")}
            >
              Escalate
            </Button>
          )}
          {room.status !== "complete" && (
            <Button
              data-testid={`btn-complete-${room.caseId}`}
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => onAction(room.caseId, "complete")}
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryBar({ summary, wsConnected }: { summary?: RoomSummary; wsConnected: boolean }) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div data-testid="stat-total" className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-3 py-1.5">
        <Users className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold">{summary?.total ?? 0} rooms</span>
      </div>
      <div data-testid="stat-escalated" className="flex items-center gap-1.5 bg-red-50 rounded-lg px-3 py-1.5">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <span className="text-sm font-semibold text-red-700">{summary?.escalated ?? 0} escalated</span>
      </div>
      <div data-testid="stat-high-risk" className="flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-1.5">
        <TrendingUp className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-amber-700">{summary?.highRisk ?? 0} high risk</span>
      </div>
      <div data-testid="stat-active" className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-3 py-1.5">
        <Activity className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-blue-700">{summary?.byStatus?.active ?? 0} active</span>
      </div>
      <div data-testid="stat-ws" className="ml-auto flex items-center gap-1.5">
        {wsConnected ? (
          <><Wifi className="w-4 h-4 text-green-500" /><span className="text-xs text-green-600">Live</span></>
        ) : (
          <><WifiOff className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-500">Polling</span></>
        )}
      </div>
    </div>
  );
}

export default function OrchestrationDashboard() {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const { data: restData, refetch } = useQuery<{ ok: boolean; rooms: Room[]; summary: RoomSummary }>({
    queryKey: ["/api/orchestration/rooms"],
    refetchInterval: wsConnected ? false : 5000,
  });

  const summary: RoomSummary | undefined = restData?.summary;

  const updateStatusMutation = useMutation({
    mutationFn: ({ caseId, status }: { caseId: string; status: string }) =>
      apiRequest("POST", `/api/orchestration/rooms/${caseId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orchestration/rooms"] });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const handleAction = useCallback((caseId: string, action: string) => {
    updateStatusMutation.mutate({ caseId, status: action });
  }, [updateStatusMutation]);

  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}/ws/orchestration`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "snapshot" || msg.type === "rooms_update") {
          setRooms(msg.rooms ?? []);
          setLastUpdate(msg.ts ?? Date.now());
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      setWsConnected(false);
      reconnectTimer.current = setTimeout(connectWS, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connectWS();
    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectTimer.current);
    };
  }, [connectWS]);

  useEffect(() => {
    if (!wsConnected && restData?.rooms) {
      setRooms(restData.rooms);
    }
  }, [restData, wsConnected]);

  const statusGroups: RoomStatus[] = ["escalated", "pending_review", "active", "waiting", "complete"];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="orchestration-title">
            Multi-Room Control Tower
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Supervise all active patient exams — real-time, physician-in-the-loop
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Updated {timeAgo(lastUpdate)}</span>
          <Button
            data-testid="btn-refresh"
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <SummaryBar summary={summary} wsConnected={wsConnected} />

      <div className="space-y-6">
        {statusGroups.map((status) => {
          const group = rooms.filter((r) => r.status === status);
          if (group.length === 0) return null;
          const cfg = STATUS_CONFIG[status];

          return (
            <div key={status} data-testid={`group-${status}`}>
              <div className="flex items-center gap-2 mb-3">
                {status === "escalated" && <AlertTriangle className="w-4 h-4 text-red-500" />}
                {status === "active" && <Radio className="w-4 h-4 text-blue-500" />}
                {status === "pending_review" && <Clock className="w-4 h-4 text-amber-500" />}
                {status === "waiting" && <Activity className="w-4 h-4 text-slate-400" />}
                {status === "complete" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                <h2 className={`text-sm font-semibold ${cfg.color}`}>
                  {cfg.label} ({group.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {group.map((room) => (
                  <RoomCard key={room.caseId} room={room} onAction={handleAction} />
                ))}
              </div>
            </div>
          );
        })}

        {rooms.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <Activity className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No active rooms</p>
              <p className="text-sm text-slate-400">Rooms appear here as patients enter triage</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="bg-slate-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-600">Room Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            {summary && Object.entries(summary.byStatus).map(([s, count]) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${s === "escalated" ? "bg-red-500" : s === "active" ? "bg-blue-500" : s === "pending_review" ? "bg-amber-400" : s === "complete" ? "bg-green-500" : "bg-slate-300"}`} />
                <span className="text-slate-600 capitalize">{s.replace("_", " ")}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

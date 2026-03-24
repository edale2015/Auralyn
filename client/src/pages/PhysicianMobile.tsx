import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileContainer from "@/components/MobileContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, CheckCircle2, ChevronRight, Activity, BarChart3, Cpu, User, Clock, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Tab = "cases" | "metrics" | "robot";

const RISK_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  moderate: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
  immediate: "bg-red-100 text-red-800 border-red-200",
  urgent: "bg-orange-100 text-orange-800 border-orange-200",
  routine: "bg-blue-100 text-blue-800 border-blue-200",
};

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function CaseCard({ c, onApprove, onOverride }: { c: any; onApprove: () => void; onOverride: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swipeHint, setSwipeHint] = useState<"approve" | "override" | null>(null);
  const touchStartX = useRef<number | null>(null);
  const riskLevel = c.triage ?? c.urgency ?? "routine";

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    setSwipeX(Math.max(-80, Math.min(80, dx)));
    setSwipeHint(dx > 30 ? "approve" : dx < -30 ? "override" : null);
  }
  function onTouchEnd() {
    if (swipeX > 60) onApprove();
    else if (swipeX < -60) onOverride();
    setSwipeX(0);
    setSwipeHint(null);
    touchStartX.current = null;
  }

  const swipeStyle: React.CSSProperties = { transform: `translateX(${swipeX}px)`, transition: swipeX === 0 ? "transform 0.2s" : "none" };

  return (
    <div className="relative mb-3 overflow-hidden rounded-xl">
      {swipeHint === "approve" && (
        <div className="absolute inset-y-0 left-0 w-16 bg-teal-100 flex items-center justify-center rounded-l-xl">
          <CheckCircle2 className="w-6 h-6 text-teal-700" />
        </div>
      )}
      {swipeHint === "override" && (
        <div className="absolute inset-y-0 right-0 w-16 bg-red-100 flex items-center justify-center rounded-r-xl">
          <span className="text-red-700 text-xs font-bold">OVR</span>
        </div>
      )}
      <Card
        className="border shadow-sm"
        style={swipeStyle}
        data-testid={`card-case-${c.id}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-gray-900 text-sm" data-testid={`text-complaint-${c.id}`}>
                  {(c.complaint ?? c.complaints?.[0] ?? "Unknown").replace(/_/g, " ")}
                </span>
                <Badge className={`text-xs ${RISK_COLORS[riskLevel] ?? RISK_COLORS.routine}`}>
                  {riskLevel}
                </Badge>
              </div>
              <p className="text-xs text-gray-500">
                {c.aiRecommendation ?? c.recommendation ?? "Pending AI assessment"}
              </p>
            </div>
            <button onClick={() => setExpanded(v => !v)} className="ml-2 p-1" data-testid={`button-expand-${c.id}`}>
              <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
          </div>

          {expanded && (
            <div className="mt-2 space-y-1 text-xs text-gray-600 border-t pt-2">
              {c.riskScore !== undefined && (
                <div>Risk Score: <span className="font-medium">{(c.riskScore * 100).toFixed(0)}%</span></div>
              )}
              {c.patientAge && <div>Age: <span className="font-medium">{c.patientAge}</span></div>}
              {c.aiDiagnosis && <div>AI Dx: <span className="font-medium">{c.aiDiagnosis}</span></div>}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {c.createdAt ? timeAgo(c.createdAt) : "Just now"}
            </div>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-red-200 text-red-700 hover:bg-red-50"
              onClick={onOverride}
              data-testid={`button-override-${c.id}`}
            >
              Override
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-teal-600 hover:bg-teal-700"
              onClick={onApprove}
              data-testid={`button-approve-${c.id}`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/autonomous/metrics"],
    queryFn: async () => {
      const r = await fetch("/api/autonomous/metrics");
      return r.json();
    },
  });

  const perf = data?.performance;

  return (
    <div className="space-y-3 mt-4">
      {[
        { label: "Accuracy", value: perf ? `${(perf.accuracy * 100).toFixed(1)}%` : "—", color: "text-teal-700" },
        { label: "Override Rate", value: perf ? `${(perf.overrideRate * 100).toFixed(1)}%` : "—", color: "text-orange-600" },
        { label: "Total Cases", value: perf?.totalCases ?? "—", color: "text-gray-900" },
        { label: "Avg Latency", value: perf?.avgLatencyMs ? `${perf.avgLatencyMs}ms` : "—", color: "text-blue-700" },
        { label: "Recent Window", value: perf?.recentWindow ?? "—", color: "text-gray-900" },
      ].map(m => (
        <Card key={m.label}>
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm text-gray-600">{m.label}</span>
            <span className={`text-lg font-bold ${m.color}`} data-testid={`metric-${m.label.toLowerCase().replace(/ /g, "-")}`}>
              {isLoading ? "…" : m.value}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RobotTab() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/robotics/camera"],
    queryFn: async () => {
      const r = await fetch("/api/robotics/camera");
      return r.json();
    },
  });

  return (
    <div className="space-y-3 mt-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-sm">Vision Overlay</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refetch()} data-testid="button-robot-refresh">
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
          {isLoading ? (
            <div className="text-xs text-gray-400 text-center py-4">Loading...</div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Target</span>
                <span className="font-medium" data-testid="text-robot-target">{data?.overlay?.target ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Confidence</span>
                <span className="font-medium" data-testid="text-robot-confidence">
                  {data?.overlay ? `${Math.round(data.overlay.confidence * 100)}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Safe to Advance</span>
                <span className={`font-medium ${data?.overlay?.safeToAdvance ? "text-green-600" : "text-red-600"}`}>
                  {data?.overlay?.safeToAdvance ? "Yes" : "No"}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PhysicianMobile() {
  const [tab, setTab] = useState<Tab>("cases");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/physician/cases"],
    queryFn: async () => {
      const r = await fetch("/api/physician/cases");
      return r.json();
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ caseId, action }: { caseId: string; action: string }) =>
      apiRequest("POST", "/api/physician/review", { caseId, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physician/cases"] });
    },
  });

  const cases = data?.cases ?? [];

  const tabs = [
    { id: "cases" as Tab, label: "Cases", icon: User },
    { id: "metrics" as Tab, label: "Metrics", icon: BarChart3 },
    { id: "robot" as Tab, label: "Robot", icon: Cpu },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-teal-600" />
          <span className="font-bold text-gray-900 text-base">Physician</span>
          {cases.length > 0 && (
            <Badge className="bg-red-100 text-red-700 text-xs">{cases.length}</Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => refetch()}
          data-testid="button-mobile-refresh">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <MobileContainer>
        {tab === "cases" && (
          <div className="mt-2">
            {isLoading && (
              <div className="text-center text-gray-400 text-sm py-8">Loading cases...</div>
            )}
            {!isLoading && cases.length === 0 && (
              <div className="text-center py-10">
                <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No pending cases</p>
              </div>
            )}
            {cases.map((c: any) => (
              <CaseCard
                key={c.id}
                c={c}
                onApprove={() => {
                  reviewMutation.mutate({ caseId: c.id, action: "approve" });
                  toast({ title: "Case approved", description: c.id });
                }}
                onOverride={() => {
                  reviewMutation.mutate({ caseId: c.id, action: "override" });
                  toast({ title: "Override recorded", description: c.id });
                }}
              />
            ))}
          </div>
        )}

        {tab === "metrics" && <MetricsTab />}
        {tab === "robot" && <RobotTab />}
      </MobileContainer>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around items-center px-2 py-2 z-20"
        data-testid="nav-bottom-mobile">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-colors ${
              tab === id ? "text-teal-700 bg-teal-50" : "text-gray-500"
            }`}
            data-testid={`tab-mobile-${id}`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

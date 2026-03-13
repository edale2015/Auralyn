import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, TrendingDown, Minus, Play, RefreshCw, Award } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PolicyEntry {
  complaint: string;
  avgReward: number;
  totalReward: number;
  count: number;
  winRate: number;
  safetyMisses: number;
  lastTrained: string;
  trend: "improving" | "stable" | "degrading";
}

interface PolicySnapshot {
  trainedAt: string;
  totalCasesUsed: number;
  policy: PolicyEntry[];
  version: number;
}

function TrendIcon({ trend }: { trend: PolicyEntry["trend"] }) {
  if (trend === "improving") return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === "degrading") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

function RewardBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.max(0, Math.min(100, ((value - Math.min(0, max)) / (Math.abs(max) + Math.abs(Math.min(0, max)))) * 100));
  const color = value >= 1 ? "bg-green-500" : value >= 0 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function RLPolicyPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ policy: PolicySnapshot | null; summary: any }>({
    queryKey: ["/api/rl/policy"],
  });

  const { data: historyData } = useQuery<{ history: PolicySnapshot[] }>({
    queryKey: ["/api/rl/policy-history"],
  });

  const trainMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rl/train", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/rl/policy"] });
      qc.invalidateQueries({ queryKey: ["/api/rl/policy-history"] });
      toast({ title: "Training complete", description: "Policy updated from outcome data." });
    },
    onError: () => toast({ title: "Training failed", variant: "destructive" }),
  });

  const snapshot = data?.policy;
  const summary = data?.summary;
  const entries = snapshot?.policy ?? [];
  const maxReward = Math.max(...entries.map(e => Math.abs(e.avgReward)), 1);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-600" />
            Reinforcement Learning Policy
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Outcome-driven policy learning — reward function trained on real patient outcomes
          </p>
        </div>
        <Button onClick={() => trainMutation.mutate()} disabled={trainMutation.isPending} data-testid="button-train-policy">
          {trainMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          {trainMutation.isPending ? "Training…" : "Run Training"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Policy Version", value: snapshot ? `v${snapshot.version}` : "—", icon: "📋" },
          { label: "Cases Trained On", value: snapshot?.totalCasesUsed ?? 0, icon: "📊" },
          { label: "Avg System Reward", value: summary?.avgSystemReward !== undefined ? `${summary.avgSystemReward.toFixed(2)}` : "—", icon: "🏆" },
          { label: "Last Trained", value: snapshot ? new Date(snapshot.trainedAt).toLocaleDateString() : "Never", icon: "🕐" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{s.icon} {s.label}</p>
              <p className="text-xl font-bold mt-1" data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!snapshot && !isLoading && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No policy trained yet</p>
            <p className="text-sm text-muted-foreground mb-4">Click "Run Training" to train the policy from outcome data. The system will compute rewards per complaint based on disposition accuracy and follow-up results.</p>
            <Button onClick={() => trainMutation.mutate()} disabled={trainMutation.isPending} data-testid="button-train-empty">
              <Play className="h-4 w-4 mr-2" />
              Train Now
            </Button>
          </CardContent>
        </Card>
      )}

      {entries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4" />
              Per-Complaint Policy Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...entries].sort((a, b) => b.avgReward - a.avgReward).map(entry => (
                <div key={entry.complaint} className="grid grid-cols-12 gap-2 items-center py-2 border-b last:border-0" data-testid={`row-policy-${entry.complaint}`}>
                  <div className="col-span-3">
                    <p className="text-sm font-medium capitalize">{entry.complaint.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">{entry.count} cases</p>
                  </div>
                  <div className="col-span-4">
                    <RewardBar value={entry.avgReward} max={maxReward} />
                    <p className="text-xs text-muted-foreground mt-0.5">Avg reward: {entry.avgReward.toFixed(2)}</p>
                  </div>
                  <div className="col-span-2 text-center">
                    <p className="text-sm font-semibold">{(entry.winRate * 100).toFixed(0)}%</p>
                    <p className="text-xs text-muted-foreground">Win rate</p>
                  </div>
                  <div className="col-span-2 text-center">
                    <p className={`text-sm font-semibold ${entry.safetyMisses > 0 ? "text-red-600" : "text-green-600"}`}>{entry.safetyMisses}</p>
                    <p className="text-xs text-muted-foreground">Safety misses</p>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <TrendIcon trend={entry.trend} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(historyData?.history?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Training History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {historyData!.history.map((h, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm" data-testid={`row-history-${i}`}>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v{h.version}</Badge>
                    <span className="text-muted-foreground">{new Date(h.trainedAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>{h.totalCasesUsed} cases</span>
                    <span>{h.policy.length} complaints</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">REWARD FUNCTION</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {[
              { label: "Correct disposition", value: "+1.0" },
              { label: "Patient improved", value: "+1.0" },
              { label: "Patient worsened", value: "−1.0" },
              { label: "Safety miss (hospitalized without ED referral)", value: "−2.0" },
            ].map(r => (
              <div key={r.label} className="border rounded p-2 bg-background">
                <p className="font-mono font-bold text-base">{r.value}</p>
                <p className="text-muted-foreground mt-0.5">{r.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

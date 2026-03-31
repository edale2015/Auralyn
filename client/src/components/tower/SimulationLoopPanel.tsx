import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { Play, TrendingUp, TrendingDown, Minus, Lightbulb, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COMPLAINTS = [
  { value: "sore_throat", label: "Sore Throat (ENT)" },
  { value: "flu", label: "Influenza" },
  { value: "chest_pain", label: "Chest Pain" },
  { value: "headache", label: "Headache" },
  { value: "ear_pain", label: "Ear Pain" },
];
const DIFFICULTIES = ["easy", "moderate", "hard"] as const;
const COUNTS = [10, 20, 30, 50];

interface SimResult {
  ok: boolean;
  runId: string;
  complaint: string;
  count: number;
  difficulty: string;
  before: number;
  after: number;
  delta: number;
  failureClusters: any[];
  suggestionsGenerated: number;
  topSuggestion: any;
  summary: any;
}

export default function SimulationLoopPanel() {
  const { toast } = useToast();
  const [complaint, setComplaint] = useState("sore_throat");
  const [difficulty, setDifficulty] = useState<"easy" | "moderate" | "hard">("moderate");
  const [count, setCount] = useState(20);

  const run = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/control/simulate-loop", { complaint, difficulty, count })
        .then(r => r.json()) as Promise<SimResult>,
    onSuccess: (d) => {
      if (!d.ok) toast({ title: "Simulation error", description: "Server returned ok=false", variant: "destructive" });
    },
    onError: (e: Error) => toast({ title: "Simulation failed", description: e.message, variant: "destructive" }),
  });

  const r = run.data;

  function DeltaIcon({ delta }: { delta: number }) {
    if (delta > 0.01) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (delta < -0.01) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  }

  return (
    <div className="space-y-3" data-testid="simulation-loop-panel">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">Closed-Loop Simulation</p>
      </div>

      {/* Config */}
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Complaint</p>
          <Select value={complaint} onValueChange={setComplaint}>
            <SelectTrigger className="h-7 text-xs" data-testid="select-sim-complaint">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPLAINTS.map(c => (
                <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Difficulty</p>
          <Select value={difficulty} onValueChange={v => setDifficulty(v as any)}>
            <SelectTrigger className="h-7 text-xs" data-testid="select-sim-difficulty">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTIES.map(d => (
                <SelectItem key={d} value={d} className="text-xs capitalize">{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Cases</p>
          <Select value={String(count)} onValueChange={v => setCount(Number(v))}>
            <SelectTrigger className="h-7 text-xs" data-testid="select-sim-count">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTS.map(n => (
                <SelectItem key={n} value={String(n)} className="text-xs">{n} cases</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            className="h-7 w-full text-xs" size="sm"
            onClick={() => run.mutate()} disabled={run.isPending}
            data-testid="button-run-simulation"
          >
            {run.isPending
              ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running…</>
              : <><Play className="h-3 w-3 mr-1" />Run</>}
          </Button>
        </div>
      </div>

      {/* Results */}
      {r && (
        <div className="space-y-2" data-testid="sim-results">
          {/* Accuracy panel */}
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-2">Accuracy ({r.count} cases · {r.difficulty})</p>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-lg font-bold font-mono">{(r.before * 100).toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">before</p>
              </div>
              <DeltaIcon delta={r.delta} />
              <div className="text-center">
                <p className="text-lg font-bold font-mono">{(r.after * 100).toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">after</p>
              </div>
              <div className="ml-auto text-right">
                <Badge className={`text-xs ${r.delta > 0 ? "bg-green-100 text-green-800" : r.delta < 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"}`}>
                  {r.delta > 0 ? "+" : ""}{(r.delta * 100).toFixed(0)}%
                </Badge>
                <p className="text-xs text-muted-foreground mt-0.5">{r.suggestionsGenerated} suggestions</p>
              </div>
            </div>
          </div>

          {/* Failure clusters */}
          {r.failureClusters?.length > 0 && (
            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              <p className="text-xs font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-yellow-500" />Failure Clusters
              </p>
              {r.failureClusters.slice(0, 4).map((fc: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{fc.type ?? fc.name ?? `Cluster ${i + 1}`}</span>
                  <Badge variant="outline" className="text-xs py-0">{fc.count ?? fc.cases ?? 1}</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Top suggestion */}
          {r.topSuggestion && (
            <div className="rounded-lg border bg-blue-50/50 p-3 space-y-1">
              <p className="text-xs font-medium flex items-center gap-1">
                <Lightbulb className="h-3 w-3 text-blue-500" />Top Suggestion
              </p>
              <p className="text-xs font-semibold">{r.topSuggestion.title}</p>
              <p className="text-xs text-muted-foreground">{r.topSuggestion.description}</p>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs py-0">{r.topSuggestion.type}</Badge>
                <Badge variant="outline" className="text-xs py-0">{r.topSuggestion.riskLevel} risk</Badge>
                <Badge variant="outline" className="text-xs py-0">conf {(r.topSuggestion.confidence * 100).toFixed(0)}%</Badge>
              </div>
              <p className="text-xs italic text-muted-foreground">{r.topSuggestion.rationale}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-right">Run ID: {r.runId?.slice(0, 8)}…</p>
        </div>
      )}
    </div>
  );
}

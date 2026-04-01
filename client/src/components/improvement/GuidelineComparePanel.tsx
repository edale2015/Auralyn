import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, GitCompare, Loader2, Search, ShieldCheck,
} from "lucide-react";

type GapResult = {
  ok: boolean;
  complaint: string;
  kbRuleCount: number;
  guidelineRecommendations: number;
  gaps: any[];
  covered: any[];
  coveragePct: number;
};

const ruleTypeColors: Record<string, string> = {
  add_question:    "border-blue-500/30 text-blue-400",
  add_red_flag:    "border-red-500/30 text-red-400",
  add_treatment:   "border-green-500/30 text-green-400",
  safety_check:    "border-orange-500/30 text-orange-400",
  screening:       "border-purple-500/30 text-purple-400",
  general:         "border-muted-foreground/30 text-muted-foreground",
};

export default function GuidelineComparePanel() {
  const [complaint, setComplaint] = useState("");
  const [result, setResult] = useState<GapResult | null>(null);
  const { toast } = useToast();

  const compareMut = useMutation({
    mutationFn: () =>
      apiRequest("GET", `/api/improvement/compare?complaint=${encodeURIComponent(complaint)}`).then(r => r.json()),
    onSuccess: d => {
      if (!d.ok) throw new Error(d.error);
      setResult(d);
    },
    onError: (e: any) => toast({ title: "Compare failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <GitCompare size={13} className="text-cyan-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gold Standard Comparison</span>
        {result && (
          <Badge
            variant="outline"
            className={cn("ml-auto text-[10px] h-4", result.coveragePct >= 80 ? "border-green-500/30 text-green-400" : result.coveragePct >= 50 ? "border-yellow-500/30 text-yellow-400" : "border-red-500/30 text-red-400")}
          >
            {result.coveragePct}% covered
          </Badge>
        )}
      </div>

      {/* Search bar */}
      <div className="p-3 border-b flex gap-2">
        <Input
          value={complaint}
          onChange={e => setComplaint(e.target.value)}
          onKeyDown={e => e.key === "Enter" && complaint.trim() && compareMut.mutate()}
          placeholder="complaint_id e.g. sore_throat"
          className="h-7 text-xs font-mono flex-1"
          data-testid="input-compare-complaint"
        />
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5 bg-cyan-600 hover:bg-cyan-700 flex-shrink-0"
          disabled={compareMut.isPending || !complaint.trim()}
          onClick={() => compareMut.mutate()}
          data-testid="button-compare"
        >
          {compareMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
          Compare
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {!result ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <GitCompare size={32} className="opacity-20" />
            <div className="text-xs text-center">Enter a complaint ID to compare</div>
            <div className="text-[11px] opacity-60 text-center max-w-[180px]">
              Compares your KB rules against ingested guidelines to find gaps
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "KB Rules", value: result.kbRuleCount, color: "text-blue-400", testId: "stat-kb-rules" },
                { label: "Guideline Recommendations", value: result.guidelineRecommendations, color: "text-cyan-400", testId: "stat-guideline-recs" },
                { label: "Gaps Found", value: result.gaps.length, color: result.gaps.length > 0 ? "text-red-400" : "text-green-400", testId: "stat-gaps-found" },
              ].map(s => (
                <Card key={s.label} className="p-2 text-center border border-border/50" data-testid={s.testId}>
                  <div className={cn("text-xl font-black tabular-nums", s.color)}>{s.value}</div>
                  <div className="text-[10px] text-muted-foreground">{s.label}</div>
                </Card>
              ))}
            </div>

            {/* Coverage bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Coverage vs guidelines</span>
                <span>{result.coveragePct}%</span>
              </div>
              <div
                className="h-2 w-full rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={result.coveragePct}
                aria-valuemin={0}
                aria-valuemax={100}
                data-testid="coverage-progress"
              >
                <div
                  className={cn("h-full rounded-full transition-all", result.coveragePct >= 80 ? "bg-green-500" : result.coveragePct >= 50 ? "bg-yellow-500" : "bg-red-500")}
                  style={{ width: `${result.coveragePct}%` }}
                />
              </div>
            </div>

            {/* Gaps */}
            {result.gaps.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={12} className="text-red-400" />
                  <span className="text-xs font-semibold">Missing from KB</span>
                  <Badge variant="outline" className="text-[10px] h-4 border-red-500/30 text-red-400 bg-red-500/10">{result.gaps.length}</Badge>
                </div>
                <div className="space-y-1.5">
                  {result.gaps.map((g, i) => (
                    <Card key={i} className="p-2.5 border border-red-500/20 bg-red-500/5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={11} className="text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs leading-snug">{g.recommendation}</div>
                          {g.rationale && <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{g.rationale}</div>}
                          <div className="flex gap-1.5 mt-1">
                            <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", ruleTypeColors[g.rule_type] ?? ruleTypeColors.general)}>{g.rule_type?.replace(/_/g, " ")}</Badge>
                            <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-muted-foreground/20 text-muted-foreground">{Math.round((g.confidence ?? 0.75) * 100)}% conf</Badge>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Covered */}
            {result.covered.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck size={12} className="text-green-400" />
                  <span className="text-xs font-semibold">Already in KB</span>
                  <Badge variant="outline" className="text-[10px] h-4 border-green-500/30 text-green-400 bg-green-500/10">{result.covered.length}</Badge>
                </div>
                <div className="space-y-1">
                  {result.covered.map((g, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 px-2 rounded border border-green-500/15 bg-green-500/5">
                      <CheckCircle2 size={11} className="text-green-400 flex-shrink-0" />
                      <div className="text-[11px] truncate">{g.recommendation}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

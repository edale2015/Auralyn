import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Award, CheckCircle2, Loader2, TrendingUp } from "lucide-react";

const sourceTypeColors: Record<string, { cls: string; label: string; score: number }> = {
  meta_analysis:  { cls: "border-green-500/30 text-green-400 bg-green-500/10",  label: "Meta-Analysis", score: 5 },
  RCT:            { cls: "border-blue-500/30 text-blue-400 bg-blue-500/10",     label: "RCT",           score: 4 },
  cohort:         { cls: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10", label: "Cohort",       score: 3 },
  expert_opinion: { cls: "border-muted-foreground/30 text-muted-foreground",    label: "Expert Opinion",score: 1 },
};

export default function EvidenceRankingTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const q = useQuery<{ ok: boolean; items: any[]; rankings: any[] }>({
    queryKey: ["/api/analytics/evidence-ranking"],
    refetchInterval: 15_000,
  });

  const seedMut = useMutation({
    mutationFn: async () => {
      // Seed some evidence entries for demo recommendations
      const recs = await fetch("/api/improvement/recommendations").then(r => r.json());
      const list = recs.recommendations?.slice(0, 6) ?? [];
      for (const rec of list) {
        const types = ["RCT", "meta_analysis", "cohort", "expert_opinion"];
        await apiRequest("POST", "/api/analytics/evidence-score", {
          recommendation_id: rec.id,
          source_type: types[Math.floor(Math.random() * types.length)],
          sample_size: Math.floor(Math.random() * 5000) + 50,
          year: 2019 + Math.floor(Math.random() * 6),
          journal_impact: parseFloat((Math.random() * 12).toFixed(1)),
        }).then(r => r.json());
      }
      return { seeded: list.length };
    },
    onSuccess: d => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/evidence-ranking"] });
      toast({ title: "Evidence Scored", description: `${d.seeded} recommendations scored` });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const items = q.data?.items ?? [];

  const maxScore = Math.max(...items.map(i => parseFloat(i.score ?? 0)), 1);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <Award size={13} className="text-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence Quality Ranking</span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-6 text-[10px] gap-1"
          disabled={seedMut.isPending}
          onClick={() => seedMut.mutate()}
          data-testid="button-seed-evidence"
        >
          {seedMut.isPending ? <Loader2 size={9} className="animate-spin" /> : <TrendingUp size={9} />}
          Score Recs
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {q.isLoading ? (
          <div className="p-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <Award size={28} className="opacity-20" />
            <div className="text-xs text-center">No evidence scores yet</div>
            <div className="text-[11px] opacity-60 text-center max-w-[180px]">
              Click "Score Recs" to evaluate ingested guideline recommendations
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {/* Scoring legend */}
            <Card className="p-2.5 border border-border/40">
              <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase">Evidence Hierarchy</div>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(sourceTypeColors).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1 flex-shrink-0", v.cls)}>{v.label}</Badge>
                    <span className="text-[10px] text-muted-foreground">+{v.score} pts</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Ranked list */}
            {items.sort((a, b) => parseFloat(b.score ?? 0) - parseFloat(a.score ?? 0)).map((item, i) => {
              const pct = parseFloat(item.score ?? 0) / maxScore * 100;
              const cfg = sourceTypeColors[item.source_type] ?? sourceTypeColors.expert_opinion;
              return (
                <Card key={item.id} className="p-2.5 border border-border/50">
                  <div className="flex items-start gap-2">
                    <div className={cn("text-sm font-black tabular-nums w-6 text-center flex-shrink-0", i < 3 ? "text-amber-400" : "text-muted-foreground")}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.recommendation && (
                        <div className="text-[11px] line-clamp-2 leading-snug">{item.recommendation}</div>
                      )}
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", cfg.cls)}>{cfg.label}</Badge>
                        {item.sample_size > 0 && <span className="text-[10px] text-muted-foreground">N={item.sample_size.toLocaleString()}</span>}
                        {item.year && <span className="text-[10px] text-muted-foreground">{item.year}</span>}
                        {item.journal_impact > 0 && <span className="text-[10px] text-muted-foreground">IF {parseFloat(item.journal_impact).toFixed(1)}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-amber-400 tabular-nums">{parseFloat(item.score ?? 0).toFixed(2)}</span>
                      </div>
                    </div>
                    {i < 3 && <CheckCircle2 size={12} className="text-amber-400 flex-shrink-0" />}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

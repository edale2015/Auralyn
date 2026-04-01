import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BarChart2, TrendingUp } from "lucide-react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

type ScoreRow = {
  complaint: string; rule_type: string;
  avg_confidence: number; guideline_count: number;
  kb_base_prob: number | null; diagnosis: string | null;
};

const ruleTypeColors: Record<string, string> = {
  add_question:  "#60a5fa",
  add_red_flag:  "#f87171",
  add_treatment: "#4ade80",
  safety_check:  "#fb923c",
  screening:     "#c084fc",
  general:       "#94a3b8",
};

function ConfidenceDot({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full", pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-orange-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function EvidenceScorePanel() {
  const q = useQuery<{ ok: boolean; scores: ScoreRow[] }>({
    queryKey: ["/api/improvement/evidence-scores"],
  });

  const scores = q.data?.scores ?? [];

  // Prepare scatter data
  const scatterData = scores
    .filter(s => s.kb_base_prob != null && s.avg_confidence != null)
    .map(s => ({
      x: Math.round((s.avg_confidence ?? 0) * 100),
      y: Math.round((s.kb_base_prob ?? 0) * 100),
      type: s.rule_type,
      complaint: s.complaint,
      diagnosis: s.diagnosis,
    }));

  // Group by complaint for the table view
  const byComplaint: Record<string, ScoreRow[]> = {};
  for (const s of scores) {
    if (!byComplaint[s.complaint]) byComplaint[s.complaint] = [];
    byComplaint[s.complaint].push(s);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <BarChart2 size={13} className="text-violet-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confidence vs Evidence</span>
        {!q.isLoading && (
          <Badge variant="outline" className="ml-auto text-[10px] h-4 border-muted-foreground/30">{scores.length} data points</Badge>
        )}
      </div>

      <ScrollArea className="flex-1">
        {q.isLoading ? (
          <div className="p-3 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
        ) : scores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <TrendingUp size={28} className="opacity-20" />
            <div className="text-xs text-center">Ingest guidelines to see evidence scores</div>
            <div className="text-[11px] opacity-60 text-center max-w-[200px]">
              Charts GPT confidence vs KB base probability
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Scatter plot */}
            {scatterData.length > 0 && (
              <Card className="p-3 border border-border/50">
                <div className="text-xs font-semibold mb-3 flex items-center gap-2">
                  <BarChart2 size={12} className="text-violet-400" />
                  Guideline Confidence vs KB Base Probability
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis
                      type="number" dataKey="x" name="Guideline Confidence" unit="%"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      label={{ value: "Guideline Conf %", position: "insideBottom", offset: -2, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      type="number" dataKey="y" name="KB Base Prob" unit="%"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      width={35}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded p-2 text-[11px] shadow-lg">
                            <div className="font-semibold">{d.complaint}</div>
                            {d.diagnosis && <div className="text-muted-foreground">{d.diagnosis}</div>}
                            <div>Guideline: {d.x}%</div>
                            <div>KB Base: {d.y}%</div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={scatterData} fillOpacity={0.8}>
                      {scatterData.map((entry, i) => (
                        <Cell key={i} fill={ruleTypeColors[entry.type] ?? ruleTypeColors.general} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(ruleTypeColors).filter(([k]) => k !== "general").map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <div className="h-2 w-2 rounded-full" style={{ background: v }} />
                      {k.replace(/_/g, " ")}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Table by complaint */}
            {Object.entries(byComplaint).map(([complaint, rows]) => (
              <div key={complaint}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] font-mono border-muted-foreground/30">{complaint}</Badge>
                  <span className="text-[10px] text-muted-foreground">{rows.length} rules</span>
                </div>
                <div className="space-y-1.5 pl-3 border-l-2 border-muted-foreground/20">
                  {rows.map((r, i) => (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1 flex-shrink-0", ruleTypeColors[r.rule_type] ? "border-current/40" : "border-muted-foreground/30")}
                          style={{ borderColor: ruleTypeColors[r.rule_type] ? ruleTypeColors[r.rule_type] + "50" : undefined, color: ruleTypeColors[r.rule_type] }}>
                          {r.rule_type?.replace(/_/g, " ")}
                        </Badge>
                        {r.diagnosis && <span className="text-[10px] text-muted-foreground truncate">{r.diagnosis}</span>}
                        <span className="text-[10px] text-muted-foreground ml-auto">{r.guideline_count} guideline{r.guideline_count !== 1 ? "s" : ""}</span>
                      </div>
                      <ConfidenceDot value={parseFloat(String(r.avg_confidence ?? 0))} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

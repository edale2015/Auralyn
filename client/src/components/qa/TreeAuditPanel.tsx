import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, HelpCircle, Info, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type AuditIssue = { severity: "critical" | "warning" | "info"; type: string; complaint: string; message: string };
type Summary = { total_complaints: number; total_questions: number; total_red_flags: number; total_treatments: number };

interface Props {
  selectedSystem: string | null;
  selectedComplaint: string | null;
}

const severityConfig = {
  critical: { icon: AlertTriangle, color: "text-red-400", badge: "border-red-500/30 text-red-400 bg-red-500/10", bg: "border-red-500/20 bg-red-500/5" },
  warning:  { icon: AlertTriangle, color: "text-yellow-400", badge: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10", bg: "border-yellow-500/20 bg-yellow-500/5" },
  info:     { icon: Info, color: "text-blue-400", badge: "border-blue-500/30 text-blue-400 bg-blue-500/10", bg: "border-blue-500/20 bg-blue-500/5" },
};

const typeLabels: Record<string, string> = {
  missing_questions:  "No Questions",
  missing_red_flags:  "No Red Flags",
  missing_treatment:  "No Treatment",
  unlinked_question:  "Unlinked Question",
};

export default function TreeAuditPanel({ selectedSystem, selectedComplaint }: Props) {
  const auditQ = useQuery<{ ok: boolean; issues: AuditIssue[]; summary: Summary }>({
    queryKey: ["/api/qa/tree-audit", selectedSystem, selectedComplaint],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedSystem)    params.set("system", selectedSystem);
      if (selectedComplaint) params.set("complaint", selectedComplaint);
      return fetch(`/api/qa/tree-audit?${params}`).then(r => r.json());
    },
  });

  const issues  = auditQ.data?.issues ?? [];
  const summary = auditQ.data?.summary;
  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const warningCount  = issues.filter(i => i.severity === "warning").length;
  const infoCount     = issues.filter(i => i.severity === "info").length;

  const typeGroups = issues.reduce<Record<string, AuditIssue[]>>((acc, i) => {
    if (!acc[i.type]) acc[i.type] = [];
    acc[i.type].push(i);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <Search size={13} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision Tree / Gap Audit</span>
        {!auditQ.isLoading && (
          <div className="ml-auto flex gap-1.5">
            {criticalCount > 0 && <Badge variant="outline" className="text-[10px] h-4 border-red-500/30 text-red-400 bg-red-500/10">{criticalCount} critical</Badge>}
            {warningCount > 0  && <Badge variant="outline" className="text-[10px] h-4 border-yellow-500/30 text-yellow-400 bg-yellow-500/10">{warningCount} warn</Badge>}
            {infoCount > 0     && <Badge variant="outline" className="text-[10px] h-4 border-blue-500/30 text-blue-400 bg-blue-500/10">{infoCount} info</Badge>}
          </div>
        )}
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-px border-b bg-border">
          {[
            { label: "Complaints", value: summary.total_complaints },
            { label: "Questions",  value: summary.total_questions },
            { label: "Red Flags",  value: summary.total_red_flags },
            { label: "Treatments", value: summary.total_treatments },
          ].map(s => (
            <div key={s.label} className="bg-background px-3 py-2 text-center">
              <div className="text-lg font-black tabular-nums" data-testid={`stat-${s.label.toLowerCase()}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1">
        {auditQ.isLoading ? (
          <div className="p-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}</div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <CheckCircle2 size={28} className="text-green-400" />
            <div className="text-sm font-medium text-green-400">No gaps detected</div>
            <div className="text-xs">All rules and questions are properly defined</div>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {Object.entries(typeGroups).map(([type, items]) => {
              const cfg = severityConfig[items[0].severity];
              const Icon = cfg.icon;
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={12} className={cfg.color} />
                    <span className="text-xs font-semibold">{typeLabels[type] ?? type}</span>
                    <Badge variant="outline" className={cn("text-[10px] h-4", cfg.badge)}>{items.length}</Badge>
                  </div>
                  <div className="space-y-1.5 pl-3 border-l-2 border-muted-foreground/20">
                    {items.map((issue, idx) => (
                      <Card key={idx} className={cn("p-2.5 border", cfg.bg)}>
                        <div className="flex items-start gap-2">
                          <HelpCircle size={11} className={cn("mt-0.5 flex-shrink-0", cfg.color)} />
                          <div>
                            <div className="text-xs leading-snug">{issue.message}</div>
                            <Badge variant="outline" className="mt-1 text-[9px] h-3.5 px-1 font-mono border-muted-foreground/20 text-muted-foreground">
                              {issue.complaint}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

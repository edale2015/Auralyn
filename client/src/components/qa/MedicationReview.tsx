import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Pill, ShieldCheck, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";

type Medication = {
  id: number; complaint_id: string; diagnosis_id: string; medication_name: string;
  medication_group: string; is_first_line: boolean; adult_dose: string;
  pediatric_dose: string; contraindications: string; complaint_label: string; system: string;
};
type MedFlag = { severity: "critical" | "warning"; medication: string; complaint: string; issue: string };

export default function MedicationReview() {
  const q = useQuery<{ ok: boolean; medications: Medication[]; flags: MedFlag[]; byGroup: Record<string, Medication[]>; total: number }>({
    queryKey: ["/api/qa/medications"],
  });

  const flags    = q.data?.flags ?? [];
  const byGroup  = q.data?.byGroup ?? {};
  const total    = q.data?.total ?? 0;
  const critical = flags.filter(f => f.severity === "critical").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <Pill size={13} className="text-green-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Global Medication Review</span>
        {!q.isLoading && (
          <div className="ml-auto flex gap-1.5">
            <Badge variant="outline" className="text-[10px] h-4 border-muted-foreground/30">{total} meds</Badge>
            {critical > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 border-red-500/30 text-red-400 bg-red-500/10">
                {critical} critical
              </Badge>
            )}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {q.isLoading ? (
          <div className="p-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Safety Flags */}
            {flags.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={13} className="text-red-400" />
                  <span className="text-xs font-semibold">Safety Flags</span>
                  <Badge variant="outline" className="text-[10px] h-4 border-red-500/30 text-red-400 bg-red-500/10">{flags.length}</Badge>
                </div>
                <div className="space-y-1.5">
                  {flags.map((f, i) => (
                    <Card key={i} className={cn(
                      "p-2.5 border",
                      f.severity === "critical" ? "border-red-500/20 bg-red-500/5" : "border-yellow-500/20 bg-yellow-500/5"
                    )}>
                      <div className="flex items-start gap-2">
                        {f.severity === "critical"
                          ? <ShieldX size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                          : <AlertTriangle size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold">{f.medication}</div>
                          <div className={cn("text-[11px] mt-0.5", f.severity === "critical" ? "text-red-300" : "text-yellow-300")}>{f.issue}</div>
                          <Badge variant="outline" className="mt-1 text-[9px] h-3.5 px-1 font-mono border-muted-foreground/20 text-muted-foreground">{f.complaint}</Badge>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Medications by group */}
            {Object.entries(byGroup).map(([group, meds]) => (
              <div key={group}>
                <div className="flex items-center gap-2 mb-2">
                  <Pill size={12} className="text-green-400" />
                  <span className="text-xs font-semibold">{group}</span>
                  <Badge variant="outline" className="text-[10px] h-4 border-green-500/30 text-green-400">{meds.length}</Badge>
                </div>
                <div className="space-y-1.5 pl-3 border-l-2 border-muted-foreground/20">
                  {meds.map((m, i) => (
                    <Card key={i} className="p-2.5 border border-border/50">
                      <div className="flex items-start gap-2">
                        {m.is_first_line
                          ? <ShieldCheck size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
                          : <ShieldX size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold">{m.medication_name}</span>
                            {m.is_first_line && (
                              <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-green-500/30 text-green-400">1st line</Badge>
                            )}
                          </div>
                          {m.adult_dose && <div className="text-[11px] text-muted-foreground mt-0.5">💊 {m.adult_dose}</div>}
                          {m.pediatric_dose && <div className="text-[11px] text-muted-foreground">🧒 Peds: {m.pediatric_dose}</div>}
                          {m.contraindications && (
                            <div className="text-[11px] text-red-400/80 mt-0.5">⚠ {m.contraindications}</div>
                          )}
                          <div className="flex gap-1.5 mt-1">
                            <Badge variant="outline" className="text-[9px] h-3.5 px-1 font-mono border-muted-foreground/20 text-muted-foreground">{m.complaint_id}</Badge>
                            {m.system && <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-muted-foreground/20 text-muted-foreground">{m.system}</Badge>}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}

            {Object.keys(byGroup).length === 0 && !q.isLoading && (
              <div className="text-center py-8 text-xs text-muted-foreground">No treatment rules found</div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

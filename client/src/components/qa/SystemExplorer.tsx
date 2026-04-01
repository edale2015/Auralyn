import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Activity, CheckCircle, ChevronRight, Layers } from "lucide-react";

type System = { system: string; complaint_count: number; active_count: number };
type Complaint = { complaint_id: string; label: string; system: string; enabled: boolean; question_count: number; red_flag_count: number; treatment_count: number };

interface Props {
  selectedSystem: string | null;
  selectedComplaint: string | null;
  onSelectSystem: (s: string | null) => void;
  onSelectComplaint: (c: string | null) => void;
}

const SYSTEM_COLORS: Record<string, string> = {
  ENT: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  PULM: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  NEURO: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  CARDIO: "border-red-500/40 bg-red-500/10 text-red-300",
  GI: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  GU: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  PSYCH: "border-pink-500/40 bg-pink-500/10 text-pink-300",
  DERM: "border-green-500/40 bg-green-500/10 text-green-300",
  MSK: "border-teal-500/40 bg-teal-500/10 text-teal-300",
};

function sysColor(s: string) {
  return SYSTEM_COLORS[s] ?? "border-muted-foreground/30 bg-muted/20 text-muted-foreground";
}

export default function SystemExplorer({ selectedSystem, selectedComplaint, onSelectSystem, onSelectComplaint }: Props) {
  const systemsQ = useQuery<{ ok: boolean; systems: System[] }>({
    queryKey: ["/api/qa/systems"],
  });

  const complaintsQ = useQuery<{ ok: boolean; complaints: Complaint[] }>({
    queryKey: ["/api/qa/complaints", selectedSystem],
    queryFn: () =>
      fetch(`/api/qa/complaints${selectedSystem ? `?system=${selectedSystem}` : ""}`)
        .then(r => r.json()),
    enabled: true,
  });

  const systems = systemsQ.data?.systems ?? [];
  const complaints = complaintsQ.data?.complaints ?? [];

  function coverageColor(c: Complaint) {
    const score = (c.question_count > 0 ? 1 : 0) + (c.red_flag_count > 0 ? 1 : 0) + (c.treatment_count > 0 ? 1 : 0);
    if (score === 3) return "text-green-400";
    if (score === 2) return "text-yellow-400";
    if (score === 1) return "text-orange-400";
    return "text-red-400";
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <Layers size={13} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clinical Systems</span>
      </div>

      {/* System grid */}
      <div className="px-3 py-2 border-b">
        {systemsQ.isLoading ? (
          <div className="grid grid-cols-3 gap-1.5">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            <button
              data-testid="system-all"
              onClick={() => { onSelectSystem(null); onSelectComplaint(null); }}
              className={cn(
                "text-[11px] font-semibold px-2 py-1.5 rounded border transition-colors",
                !selectedSystem ? "border-primary bg-primary/10 text-primary" : "border-muted-foreground/20 text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
              )}
            >
              All ({systems.reduce((a, s) => a + s.complaint_count, 0)})
            </button>
            {systems.map(s => (
              <button
                key={s.system}
                data-testid={`system-${s.system}`}
                onClick={() => { onSelectSystem(s.system); onSelectComplaint(null); }}
                className={cn(
                  "text-[11px] font-semibold px-2 py-1.5 rounded border transition-colors",
                  selectedSystem === s.system
                    ? sysColor(s.system)
                    : "border-muted-foreground/20 text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                )}
              >
                {s.system} ({s.complaint_count})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Complaint list */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b">
        <Activity size={12} className="text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
          {selectedSystem ? `${selectedSystem} Complaints` : "All Complaints"}
        </span>
        <Badge variant="outline" className="ml-auto text-[10px] h-4">{complaints.length}</Badge>
      </div>

      <ScrollArea className="flex-1">
        {complaintsQ.isLoading ? (
          <div className="p-3 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}</div>
        ) : complaints.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">No complaints found</div>
        ) : (
          <div className="p-2 space-y-1">
            {complaints.map(c => (
              <button
                key={c.complaint_id}
                data-testid={`complaint-${c.complaint_id}`}
                onClick={() => onSelectComplaint(c.complaint_id === selectedComplaint ? null : c.complaint_id)}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-md border transition-colors group",
                  selectedComplaint === c.complaint_id
                    ? "border-primary/40 bg-primary/10"
                    : "border-transparent hover:border-border hover:bg-muted/30"
                )}
              >
                <div className="flex items-start gap-2">
                  <ChevronRight size={12} className={cn("mt-0.5 flex-shrink-0 transition-transform", selectedComplaint === c.complaint_id && "rotate-90")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{c.label}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", sysColor(c.system))}>{c.system}</Badge>
                      <span className={cn("text-[10px] flex items-center gap-1", coverageColor(c))}>
                        <CheckCircle size={9} />
                        Qs:{c.question_count} RF:{c.red_flag_count} Tx:{c.treatment_count}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

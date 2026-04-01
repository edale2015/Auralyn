import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Grid3X3, XCircle } from "lucide-react";

type MatrixRow = { rule: string; [key: string]: boolean | string };

export default function ConsistencyMatrix() {
  const q = useQuery<{ ok: boolean; matrix: MatrixRow[]; systems: string[] }>({
    queryKey: ["/api/qa/consistency"],
  });

  const systems = q.data?.systems ?? [];
  const matrix  = q.data?.matrix ?? [];

  const totalCells = systems.length * matrix.length;
  const coveredCells = matrix.reduce(
    (acc, row) => acc + systems.filter(s => row[s.toLowerCase()]).length,
    0
  );
  const coveragePct = totalCells > 0 ? Math.round((coveredCells / totalCells) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <Grid3X3 size={13} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cross-System Consistency</span>
        {!q.isLoading && (
          <Badge
            variant="outline"
            className={`ml-auto text-[10px] h-4 ${coveragePct >= 70 ? "border-green-500/30 text-green-400" : coveragePct >= 40 ? "border-yellow-500/30 text-yellow-400" : "border-red-500/30 text-red-400"}`}
          >
            {coveragePct}% coverage
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1">
        {q.isLoading ? (
          <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
        ) : (
          <div className="p-2 overflow-x-auto">
            <table className="w-full text-xs border-collapse" data-testid="table-consistency">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1.5 text-muted-foreground text-[11px] font-semibold min-w-[160px]">Universal Rule</th>
                  {systems.map(s => (
                    <th key={s} className="px-2 py-1.5 text-center text-[11px] font-semibold text-muted-foreground">{s}</th>
                  ))}
                  <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-muted-foreground">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, idx) => {
                  const covered = systems.filter(s => row[s.toLowerCase()]).length;
                  const pct = Math.round((covered / systems.length) * 100);
                  return (
                    <tr key={idx} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-2 py-1.5 font-medium text-[11px]">{row.rule}</td>
                      {systems.map(s => {
                        const has = Boolean(row[s.toLowerCase()]);
                        return (
                          <td key={s} className="px-2 py-1.5 text-center">
                            {has
                              ? <CheckCircle2 size={14} className="mx-auto text-green-400" />
                              : <XCircle size={14} className="mx-auto text-red-400/50" />}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Legend */}
            <div className="mt-4 flex items-center gap-4 px-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-green-400" /> Rule present</span>
              <span className="flex items-center gap-1"><XCircle size={11} className="text-red-400/60" /> Gap detected</span>
              <span className="ml-auto">Coverage: {coveredCells}/{totalCells} cells</span>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

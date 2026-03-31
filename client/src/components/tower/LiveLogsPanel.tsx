import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Terminal } from "lucide-react";

interface LogEntry { ts: number; level: string; msg: string; }

const LEVEL_COLOR: Record<string, string> = {
  info:  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  warn:  "bg-yellow-100 text-yellow-800",
  error: "bg-red-100 text-red-800",
  debug: "bg-gray-100 text-gray-600",
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function LiveLogsPanel() {
  const { data: logs = [] } = useQuery<LogEntry[]>({
    queryKey: ["/api/sysctrl/logs"],
    refetchInterval: 3000,
  });

  return (
    <div data-testid="live-logs-panel">
      <ScrollArea className="h-48 rounded-lg border bg-black/95">
        <div className="p-2 space-y-0.5 font-mono">
          {logs.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 px-1">
              <Terminal className="h-3 w-3" />
              <span>Waiting for system events…</span>
            </div>
          )}
          {logs.map((l, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-green-300 border-b border-white/5 pb-0.5" data-testid={`log-row-${i}`}>
              <span className="text-gray-500 shrink-0">{fmtTime(l.ts)}</span>
              <Badge className={`text-xs py-0 shrink-0 ${LEVEL_COLOR[l.level] ?? LEVEL_COLOR.info}`}>
                {l.level}
              </Badge>
              <span className="break-all">{l.msg}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

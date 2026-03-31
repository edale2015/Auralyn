import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Circle } from "lucide-react";

interface EngineHealth {
  name: string;
  status: "green" | "yellow" | "red" | "gray";
  latencyMs?: number;
  errorCount: number;
  notes?: string;
}

const STATUS_ICON: Record<string, any> = {
  green:  <CheckCircle2 className="h-4 w-4 text-green-500" />,
  yellow: <AlertCircle  className="h-4 w-4 text-yellow-500" />,
  red:    <XCircle      className="h-4 w-4 text-red-500" />,
  gray:   <Circle       className="h-4 w-4 text-gray-400" />,
};

export default function EnginesPanel() {
  const { data: engines = [] } = useQuery<EngineHealth[]>({
    queryKey: ["/api/sysctrl/engines"],
    refetchInterval: 8000,
  });

  return (
    <div className="space-y-1.5" data-testid="engines-panel">
      {engines.map((e, i) => (
        <div key={i} className="flex items-center justify-between p-2 rounded-lg border bg-card text-xs" data-testid={`engine-row-${i}`}>
          <div className="flex items-center gap-2">
            {STATUS_ICON[e.status] ?? STATUS_ICON.gray}
            <span className="font-medium truncate">{e.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {e.latencyMs != null && (
              <Badge variant="secondary" className="text-xs py-0">{e.latencyMs}ms</Badge>
            )}
            {e.errorCount > 0 && (
              <Badge variant="destructive" className="text-xs py-0">{e.errorCount} err</Badge>
            )}
          </div>
        </div>
      ))}
      {engines.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No engines registered yet</p>
      )}
    </div>
  );
}

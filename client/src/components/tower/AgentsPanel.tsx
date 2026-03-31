import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stethoscope, Mic, Brain, FlaskConical, Cpu, DollarSign, Shield, Pause, Play } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const ICON_MAP: Record<string, any> = {
  stethoscope: Stethoscope, mic: Mic, brain: Brain, flask: FlaskConical,
  cpu: Cpu, dollar: DollarSign, shield: Shield,
};

interface Agent { id: string; label: string; icon: string; enabled: boolean; status: string; uptime: number; }

export default function AgentsPanel() {
  const qc = useQueryClient();
  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/sysctrl/agents"],
    refetchInterval: 5000,
  });
  const toggle = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sysctrl/agents/${id}/toggle`, {}).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/sysctrl/agents"] }),
  });

  return (
    <div className="space-y-2" data-testid="agents-panel">
      {agents.map((a) => {
        const Icon = ICON_MAP[a.icon] ?? Cpu;
        return (
          <div key={a.id} className="flex items-center justify-between p-2 rounded-lg border bg-card" data-testid={`agent-row-${a.id}`}>
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs font-medium">{a.label}</p>
                <p className="text-xs text-muted-foreground">up {Math.floor(a.uptime / 60)}m</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`text-xs py-0 ${a.status === "running" ? "bg-green-600" : "bg-gray-400"}`}>
                {a.status}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => toggle.mutate(a.id)}
                data-testid={`toggle-agent-${a.id}`}
              >
                {a.enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

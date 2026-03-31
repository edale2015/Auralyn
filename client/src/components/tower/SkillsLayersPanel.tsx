import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Database, Layers, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SkillEntry { name: string; count: number; status: string; }
interface LayerEntry { name: string; enabled: boolean; }

export function SkillsPanel() {
  const { data: skills = [] } = useQuery<SkillEntry[]>({
    queryKey: ["/api/sysctrl/skills"],
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-1.5" data-testid="skills-panel">
      {skills.map((s, i) => (
        <div key={i} className="flex items-center justify-between p-2 rounded-lg border bg-card text-xs" data-testid={`skill-row-${i}`}>
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium">{s.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-xs py-0">{s.count}</Badge>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LayersPanel() {
  const qc = useQueryClient();
  const { data: layers = [] } = useQuery<LayerEntry[]>({
    queryKey: ["/api/sysctrl/layers"],
    refetchInterval: 10000,
  });
  const toggle = useMutation({
    mutationFn: (name: string) => apiRequest("POST", `/api/sysctrl/layers/${encodeURIComponent(name)}/toggle`, {}).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/sysctrl/layers"] }),
  });

  return (
    <div className="space-y-1.5" data-testid="layers-panel">
      {layers.map((l, i) => (
        <div key={i} className="flex items-center justify-between p-2 rounded-lg border bg-card text-xs" data-testid={`layer-row-${i}`}>
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className={`font-medium ${!l.enabled ? "opacity-50 line-through" : ""}`}>{l.name}</span>
          </div>
          <Switch
            checked={l.enabled}
            onCheckedChange={() => toggle.mutate(l.name)}
            data-testid={`toggle-layer-${i}`}
          />
        </div>
      ))}
    </div>
  );
}

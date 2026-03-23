import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, User, CheckCircle2, AlertCircle, Cpu, XCircle } from "lucide-react";

const TYPE_CONFIG: Record<string, { icon: typeof Brain; color: string; badge: string }> = {
  patient: { icon: User, color: "text-blue-600 bg-blue-50", badge: "bg-blue-100 text-blue-700" },
  decision: { icon: Brain, color: "text-purple-600 bg-purple-50", badge: "bg-purple-100 text-purple-700" },
  outcome: { icon: CheckCircle2, color: "text-green-600 bg-green-50", badge: "bg-green-100 text-green-700" },
  robot_action: { icon: Cpu, color: "text-indigo-600 bg-indigo-50", badge: "bg-indigo-100 text-indigo-700" },
  event: { icon: AlertCircle, color: "text-yellow-600 bg-yellow-50", badge: "bg-yellow-100 text-yellow-700" },
  error: { icon: XCircle, color: "text-red-600 bg-red-50", badge: "bg-red-100 text-red-700" },
};

export default function MemoryGraphView({ maxNodes = 30 }: { maxNodes?: number }) {
  const { data: nodesData, isLoading: nodesLoading } = useQuery({
    queryKey: ["/api/memory/nodes"],
  });

  const { data: statsData } = useQuery({
    queryKey: ["/api/memory/stats"],
  });

  const nodes = ((nodesData as any)?.nodes ?? []).slice(0, maxNodes);
  const stats = (statsData as any)?.stats;

  return (
    <div className="space-y-4" data-testid="memory-graph-view">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(stats.nodesByType ?? {}).map(([type, count]) => {
            const cfg = TYPE_CONFIG[type];
            if (!cfg) return null;
            const Icon = cfg.icon;
            return (
              <div key={type} className={`flex items-center gap-2 rounded-xl p-2 ${cfg.color}`}
                data-testid={`stat-node-type-${type}`}>
                <Icon className="w-4 h-4 shrink-0" />
                <div>
                  <div className="text-xs font-medium capitalize">{type.replace("_", " ")}</div>
                  <div className="text-lg font-bold leading-none">{String(count)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {nodesLoading && <div className="text-sm text-gray-400 py-4">Loading graph nodes…</div>}

      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {nodes.map((node: any) => {
          const cfg = TYPE_CONFIG[node.type] ?? TYPE_CONFIG.event;
          const Icon = cfg.icon;
          return (
            <div key={node.id}
              className="flex items-start gap-3 p-2.5 rounded-lg border bg-white hover:bg-gray-50 transition-colors"
              data-testid={`memory-node-${node.id}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 truncate">{node.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                    {node.type.replace("_", " ")}
                  </span>
                </div>
                {node.tags?.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {node.tags.map((t: string) => (
                      <span key={t} className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded">{t}</span>
                    ))}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(node.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}
        {nodes.length === 0 && !nodesLoading && (
          <div className="text-sm text-gray-400 text-center py-6">
            No memory nodes yet. Run a simulation to populate the graph.
          </div>
        )}
      </div>
    </div>
  );
}

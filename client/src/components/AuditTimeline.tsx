import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, User, Bot, Cpu, Server } from "lucide-react";

const ACTOR_CONFIG: Record<string, { icon: typeof User; label: string; color: string }> = {
  physician: { icon: User, label: "Physician", color: "text-blue-600 bg-blue-50" },
  agent: { icon: Bot, label: "Agent", color: "text-purple-600 bg-purple-50" },
  robot: { icon: Cpu, label: "Robot", color: "text-indigo-600 bg-indigo-50" },
  system: { icon: Server, label: "System", color: "text-gray-600 bg-gray-100" },
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AuditTimeline({ limit = 20, entityType }: { limit?: number; entityType?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/physician/audit", { entityType, limit }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityType) params.set("entityType", entityType);
      params.set("limit", String(limit));
      const res = await fetch(`/api/physician/audit?${params}`);
      return res.json();
    },
  });

  const log: any[] = (data as any)?.log ?? [];

  if (isLoading) return <div className="text-sm text-gray-400 py-4">Loading audit trail…</div>;

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1" data-testid="audit-timeline">
      {log.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-6">No audit entries yet.</div>
      )}
      {log.map((entry: any) => {
        const cfg = ACTOR_CONFIG[entry.actor] ?? ACTOR_CONFIG.system;
        const Icon = cfg.icon;
        return (
          <div key={entry.traceId}
            className="flex gap-3 p-2.5 rounded-lg border bg-white hover:bg-gray-50"
            data-testid={`audit-entry-${entry.traceId}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-900 capitalize">
                  {entry.action.replace(/_/g, " ")}
                </span>
                {entry.approved === true && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                )}
                {entry.approved === false && (
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                )}
                <Badge variant="outline" className="text-xs">{entry.entityType}</Badge>
              </div>
              {entry.notes && (
                <div className="text-xs text-gray-500 mt-0.5 truncate">{entry.notes}</div>
              )}
              {entry.riskScore !== undefined && (
                <div className="text-xs text-gray-400 mt-0.5">Risk: {(entry.riskScore * 100).toFixed(0)}%</div>
              )}
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-xs ${cfg.color}`}>{cfg.label}</span>
                <span>{timeAgo(entry.timestamp)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

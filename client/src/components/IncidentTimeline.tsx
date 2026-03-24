import { Badge } from "@/components/ui/badge";

interface TimelineEvent {
  type: string;
  incidentId?: string;
  action?: string;
  detail?: string;
  severity?: string;
  region?: string;
  timestamp: number;
}

interface Props {
  events: TimelineEvent[];
}

function severityColor(severity?: string): string {
  switch (severity) {
    case "CRITICAL": return "bg-red-900/30 border-red-600";
    case "HIGH":     return "bg-orange-900/20 border-orange-500";
    case "MEDIUM":   return "bg-yellow-900/20 border-yellow-500";
    default:         return "bg-green-900/20 border-green-600";
  }
}

function typeIcon(type: string): string {
  switch (type) {
    case "INCIDENT":  return "🚨";
    case "PLAYBOOK":  return "▶";
    case "OUTAGE":    return "💥";
    case "RECOVERY":  return "✅";
    default:          return "•";
  }
}

export default function IncidentTimeline({ events }: Props) {
  if (!events.length) {
    return (
      <div className="text-sm text-green-400/60 font-mono py-4 text-center" data-testid="timeline-empty">
        No events recorded — system nominal
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-72 overflow-y-auto font-mono text-xs" data-testid="timeline-list">
      {[...events].reverse().map((e, i) => (
        <div
          key={i}
          className={`flex gap-3 items-start p-2 rounded border ${severityColor(e.severity)}`}
          data-testid={`timeline-event-${i}`}
        >
          <span className="text-base leading-none mt-0.5">{typeIcon(e.type)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-green-300 shrink-0">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] px-1 py-0 border-current"
                data-testid={`timeline-type-${i}`}
              >
                {e.type}
              </Badge>
              {e.severity && (
                <Badge
                  variant={e.severity === "CRITICAL" ? "destructive" : "secondary"}
                  className="text-[10px] px-1 py-0"
                  data-testid={`timeline-severity-${i}`}
                >
                  {e.severity}
                </Badge>
              )}
              {e.region && (
                <span className="text-blue-400">region:{e.region}</span>
              )}
            </div>
            {(e.action || e.detail) && (
              <div className="text-green-400/80 truncate mt-0.5" data-testid={`timeline-detail-${i}`}>
                {e.action && <span className="text-green-300">{e.action}</span>}
                {e.action && e.detail && <span className="text-green-400/50"> — </span>}
                {e.detail}
              </div>
            )}
            {e.incidentId && (
              <div className="text-green-400/40 text-[10px]" data-testid={`timeline-id-${i}`}>
                {e.incidentId}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

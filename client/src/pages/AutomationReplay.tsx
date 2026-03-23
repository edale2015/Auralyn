import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";

const EVENT_COLORS: Record<string, string> = {
  "action.started": "border-l-blue-400",
  "action.completed": "border-l-green-400",
  "action.screenshot": "border-l-purple-400",
  "action.extracted_text": "border-l-yellow-400",
  "visual_fallback.captured": "border-l-orange-400",
};

function eventColor(label: string) {
  for (const [key, cls] of Object.entries(EVENT_COLORS)) {
    if (label.includes(key)) return cls;
  }
  return "border-l-gray-300";
}

export default function AutomationReplay() {
  const { runId } = useParams<{ runId: string }>();

  const { data, isLoading, error } = useQuery<{ run: any; timeline: any[] }>({
    queryKey: ["/api/automation-replay", runId, "timeline"],
    queryFn: () =>
      fetch(`/api/automation-replay/${runId}/timeline`).then((r) => r.json()),
    enabled: !!runId,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading replay...</div>;
  if (error || !data) return <div className="p-6 text-destructive">Failed to load timeline.</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-replay-title">Automation Replay</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Run <span className="font-mono">{data.run?.id}</span>
          {" · "}{data.run?.template_key}
          {" · "}<span className="capitalize">{data.run?.status}</span>
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <pre className="text-xs overflow-auto max-h-40">
          {JSON.stringify(data.run, null, 2)}
        </pre>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">Event Timeline ({data.timeline.length} events)</h2>

        <div className="relative space-y-3">
          {data.timeline.map((item: any, idx: number) => (
            <div
              key={item.id}
              data-testid={`card-event-${idx}`}
              className={`rounded-2xl border-l-4 ${eventColor(item.label)} bg-card border border-border p-4`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{item.label}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.ts).toLocaleTimeString()}
                </span>
              </div>

              <div className="text-xs text-muted-foreground mt-1">
                Step {item.stepIndex ?? "–"} · {item.actionName || "–"}
              </div>

              {item.screenshotKey && (
                <div className="mt-2 text-xs text-purple-600 dark:text-purple-400 font-mono">
                  📸 {item.screenshotKey}
                </div>
              )}

              {item.payload && (
                <pre className="mt-3 rounded-xl bg-muted p-3 text-xs overflow-auto max-h-32">
                  {JSON.stringify(item.payload, null, 2)}
                </pre>
              )}
            </div>
          ))}

          {data.timeline.length === 0 && (
            <div className="text-muted-foreground text-sm">No events recorded for this run.</div>
          )}
        </div>
      </section>
    </div>
  );
}

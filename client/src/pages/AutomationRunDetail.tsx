import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";

const EVENT_COLORS: Record<string, string> = {
  "action.started": "border-blue-200",
  "action.completed": "border-green-200",
  "action.screenshot": "border-purple-200",
  "action.extracted_text": "border-yellow-200",
};

export default function AutomationRunDetail() {
  const { runId } = useParams<{ runId: string }>();

  const { data, isLoading } = useQuery<{ run: any; events: any[] }>({
    queryKey: ["/api/automation/runs", runId],
    enabled: !!runId,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6" data-testid="run-detail-loading">
        Loading run detail...
      </div>
    );
  }

  const { run, events } = data;

  if (!run) {
    return (
      <div className="p-6 text-red-600" data-testid="run-detail-not-found">
        Run not found.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="automation-run-detail">
      <h1 className="text-3xl font-semibold">Automation Run</h1>

      <section className="rounded-2xl border p-4 bg-white dark:bg-gray-900 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-medium text-lg">{run.template_key}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              run.status === "completed"
                ? "bg-green-100 text-green-700"
                : run.status === "failed"
                ? "bg-red-100 text-red-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {run.status}
          </span>
        </div>
        <div className="text-xs text-gray-400">ID: {run.id}</div>
        {run.started_by && (
          <div className="text-sm text-gray-500">Started by: {run.started_by}</div>
        )}
        <div className="text-sm text-gray-500">
          Started: {new Date(run.started_at).toLocaleString()}
          {run.finished_at && ` · Finished: ${new Date(run.finished_at).toLocaleString()}`}
        </div>
        {run.error && (
          <div className="text-sm text-red-600 bg-red-50 rounded p-2 mt-2">{run.error}</div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Run Payload</h2>
        <pre className="rounded-2xl border p-4 bg-gray-50 dark:bg-gray-800 text-sm overflow-auto max-h-64">
          {JSON.stringify(run.payload, null, 2)}
        </pre>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">
          Events ({events.length})
        </h2>
        <div className="space-y-2" data-testid="run-events-list">
          {events.map((event: any) => (
            <div
              key={event.id}
              className={`rounded-xl border-l-4 pl-4 pr-4 py-3 bg-white dark:bg-gray-900 ${
                EVENT_COLORS[event.event_type] ?? "border-gray-200"
              }`}
              data-testid={`event-${event.id}`}
            >
              <div className="font-medium text-sm">{event.event_type}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Step {event.step_index ?? "—"} · {event.action_name || "—"}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {new Date(event.created_at).toLocaleString()}
              </div>
              {event.screenshot_key && (
                <div className="text-xs text-purple-600 mt-1">
                  Screenshot: {event.screenshot_key}
                </div>
              )}
              {event.payload?.text && (
                <div className="text-xs text-yellow-700 bg-yellow-50 rounded mt-1 p-1">
                  Extracted: {event.payload.text}
                </div>
              )}
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-gray-500 text-sm">No events recorded yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

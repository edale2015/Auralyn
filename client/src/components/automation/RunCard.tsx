import { Link } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
};

export default function RunCard({ run }: { run: any }) {
  const statusClass = STATUS_COLORS[run.status] ?? "bg-gray-100 text-gray-600";

  return (
    <div
      className="rounded-2xl border p-4 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow"
      data-testid={`run-card-${run.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-medium" data-testid={`run-template-${run.id}`}>
            {run.template_key}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">ID: {run.id}</div>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusClass}`}
          data-testid={`run-status-${run.id}`}
        >
          {run.status}
        </span>
      </div>

      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Step: {run.current_step}
        {run.started_by && ` · Started by: ${run.started_by}`}
      </div>

      <div className="text-xs text-gray-400 mt-1">
        {new Date(run.started_at).toLocaleString()}
        {run.finished_at && ` → ${new Date(run.finished_at).toLocaleString()}`}
      </div>

      {run.error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2" data-testid={`run-error-${run.id}`}>
          {run.error}
        </div>
      )}

      <div className="mt-3">
        <Link
          to={`/automation/runs/${run.id}`}
          className="text-xs text-blue-600 hover:underline"
          data-testid={`run-detail-link-${run.id}`}
        >
          View events →
        </Link>
      </div>
    </div>
  );
}

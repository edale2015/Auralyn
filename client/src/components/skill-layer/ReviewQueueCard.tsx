const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-700",
};

type Props = {
  queue: any[];
};

export default function ReviewQueueCard({ queue }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Unified Review Queue</h2>
        <span className="text-sm text-slate-500">{queue.length} items</span>
      </div>

      {queue.length === 0 ? (
        <div className="text-sm text-slate-500">
          No items in review queue.
        </div>
      ) : (
        <div className="max-h-80 space-y-2 overflow-auto">
          {queue.map((item, idx) => (
            <div
              key={idx}
              data-testid={`queue-item-${idx}`}
              className="rounded-xl border bg-slate-50 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-900">
                    {item.complaint ?? item.caseId ?? item.id}
                  </div>
                  <div className="text-xs text-slate-500">{item.type}</div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    PRIORITY_COLORS[item.priority] ?? "bg-slate-100 text-slate-700"
                  }`}
                >
                  {item.priority}
                </span>
              </div>

              {item.payload?.reason && (
                <div className="mt-1 text-xs text-slate-600">
                  {item.payload.reason}
                </div>
              )}
              {item.payload?.failureCount != null && (
                <div className="mt-1 text-xs text-slate-500">
                  Failures: {item.payload.failureCount} | Safety misses:{" "}
                  {item.payload.safetyMissCount}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

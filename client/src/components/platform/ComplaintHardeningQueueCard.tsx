import { useQuery } from "@tanstack/react-query";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-amber-100 text-amber-800 border-amber-200",
  medium: "bg-blue-100 text-blue-800 border-blue-200",
  low: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function ComplaintHardeningQueueCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/platform/hardening-queue"],
    queryFn: async () => {
      const res = await fetch("/api/platform/hardening-queue");
      return res.json();
    },
  });

  const queue: any[] = data?.queue ?? [];

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Complaint Hardening Queue</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {queue.length} items
        </span>
      </div>

      {isLoading && <div className="text-sm text-slate-400">Loading…</div>}
      {error && <div className="text-sm text-red-600">Failed to load</div>}

      {!isLoading && queue.length === 0 && (
        <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">
          No complaints need hardening — all clear.
        </div>
      )}

      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((item: any, idx: number) => (
            <div
              key={idx}
              data-testid={`text-hardening-item-${item.complaint}`}
              className="rounded-xl bg-slate-50 p-3"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="font-medium text-slate-900">
                  {item.complaint.replace(/_/g, " ")}
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.low
                  }`}
                >
                  {item.priority}
                </span>
              </div>
              <div className="text-sm text-slate-600">{item.reason}</div>
              <div className="mt-1 flex gap-3 text-xs text-slate-500">
                <span>Failures: {item.failureCount}</span>
                <span>Safety misses: {item.safetyMissCount}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

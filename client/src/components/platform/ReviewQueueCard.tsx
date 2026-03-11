type Props = {
  queue: any[];
};

function badgeTone(priority: string) {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "high":
      return "bg-amber-100 text-amber-800";
    case "medium":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function ReviewQueueCard({ queue }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Unified Review Queue</h2>

      {queue.length === 0 ? (
        <div className="text-sm text-slate-500">Queue is empty.</div>
      ) : (
        <div className="space-y-3">
          {queue.map((item, idx) => (
            <div key={idx} className="rounded-xl bg-slate-50 p-3">
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="font-medium text-slate-900">{item.type}</div>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeTone(item.priority)}`}>
                  {item.priority}
                </span>
              </div>
              <div className="text-sm text-slate-700">
                {item.complaint
                  ? `Complaint: ${item.complaint}`
                  : item.caseId
                  ? `Case: ${item.caseId}`
                  : "—"}
              </div>
              <div className="text-xs text-slate-500">{item.createdAt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

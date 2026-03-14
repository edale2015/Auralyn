export default function SlaSummaryCards({
  summary,
  queueStatus,
}: {
  summary: {
    avg_inbound_to_draft_min?: number
    avg_draft_to_approve_min?: number
    avg_approve_to_send_min?: number
    avg_inbound_to_send_min?: number
    avg_blocked_to_resolved_min?: number
  }
  queueStatus: {
    onTime: number
    dueSoon: number
    overdue: number
    blockedUrgent: number
  }
}) {
  const cards: [string, string | number][] = [
    ["Inbound → Draft", `${Number(summary.avg_inbound_to_draft_min || 0).toFixed(1)}m`],
    ["Draft → Approve", `${Number(summary.avg_draft_to_approve_min || 0).toFixed(1)}m`],
    ["Approve → Send", `${Number(summary.avg_approve_to_send_min || 0).toFixed(1)}m`],
    ["Inbound → Send", `${Number(summary.avg_inbound_to_send_min || 0).toFixed(1)}m`],
    ["Blocked → Resolved", `${Number(summary.avg_blocked_to_resolved_min || 0).toFixed(1)}m`],
    ["On Time", queueStatus.onTime],
    ["Due Soon", queueStatus.dueSoon],
    ["Overdue", queueStatus.overdue],
    ["Blocked Urgent", queueStatus.blockedUrgent],
  ]

  const statusColor = (label: string, val: number) => {
    if (label === "Overdue" && val > 0) return "text-red-600"
    if (label === "Blocked Urgent" && val > 0) return "text-red-600"
    if (label === "Due Soon" && val > 0) return "text-amber-600"
    if (label === "On Time") return "text-green-600"
    return ""
  }

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
      {cards.map(([label, value]) => (
        <div key={String(label)} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground mb-1">{label}</div>
          <div className={`text-2xl font-semibold ${statusColor(String(label), Number(value) || 0)}`}>
            {String(value)}
          </div>
        </div>
      ))}
    </div>
  )
}

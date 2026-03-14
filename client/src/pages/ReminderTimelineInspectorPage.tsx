import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import PageShell from "@/components/PageShell"
import StatusChip from "@/components/StatusChip"
import EmptyState from "@/components/EmptyState"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type Reminder = {
  id: string
  caseId: string
  type: string
  scheduledAt: string
  sentAt?: string
  status: "pending" | "sent" | "suppressed" | "cancelled"
  suppressReason?: string
  channel: string
}

export default function ReminderTimelineInspectorPage() {
  const [filterCaseId, setFilterCaseId] = useState("")
  const qc = useQueryClient()
  const { toast } = useToast()

  const { data: allData, isLoading } = useQuery({
    queryKey: ["/api/reminders"],
    queryFn: () => fetch("/api/reminders").then((r) => r.json()),
    refetchInterval: 10000,
  })

  const { data: caseData } = useQuery({
    queryKey: ["/api/reminders/case", filterCaseId],
    queryFn: () => fetch(`/api/reminders/${encodeURIComponent(filterCaseId)}`).then((r) => r.json()),
    enabled: !!filterCaseId,
  })

  const suppressMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/reminders/${id}/suppress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual suppression" }),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Reminder suppressed" })
      qc.invalidateQueries({ queryKey: ["/api/reminders"] })
    },
  })

  const autoSuppressMutation = useMutation({
    mutationFn: () =>
      fetch("/api/reminder-suppression/auto-suppress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Auto-suppressed: overdue >24h" }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      toast({ title: `Auto-suppressed ${data.suppressed} overdue reminders` })
      qc.invalidateQueries({ queryKey: ["/api/reminders"] })
    },
  })

  const reminders: Reminder[] = filterCaseId ? (caseData?.timeline ?? []) : (allData?.reminders ?? [])
  const stats = allData?.stats

  function statusLevel(s: string) {
    if (s === "sent") return "success"
    if (s === "suppressed") return "warning"
    if (s === "cancelled") return "neutral"
    return "info"
  }

  return (
    <PageShell
      title="Reminder Timeline Inspector"
      description="Track all scheduled, sent, and suppressed patient reminders"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => autoSuppressMutation.mutate()} disabled={autoSuppressMutation.isPending}>
            {autoSuppressMutation.isPending ? "Suppressing…" : "Auto-Suppress Overdue"}
          </Button>
        </>
      }
    >
      {stats && (
        <div className="flex gap-6 text-sm flex-wrap">
          {Object.entries(stats).map(([k, v]) => (
            <span key={k}><span className="text-muted-foreground">{k}:</span> <strong>{String(v)}</strong></span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Filter by case ID…"
          className="h-8 text-xs max-w-xs"
          value={filterCaseId}
          onChange={(e) => setFilterCaseId(e.target.value)}
        />
        {filterCaseId && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setFilterCaseId("")}>Clear</Button>
        )}
      </div>

      {isLoading ? (
        <div className="animate-pulse h-24 bg-muted rounded-xl" />
      ) : reminders.length === 0 ? (
        <EmptyState title="No reminders" description="Schedule reminders from the telemed console or via the API." />
      ) : (
        <div className="space-y-2">
          {reminders.map((r) => (
            <div key={r.id} className="border rounded-xl px-4 py-3 bg-card flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-xs font-medium">{r.caseId}</span>
                  <StatusChip label={r.status} level={statusLevel(r.status) as any} />
                  <span className="text-xs bg-muted rounded px-1.5 py-0.5">{r.type}</span>
                  <span className="text-xs bg-muted rounded px-1.5 py-0.5">{r.channel}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Scheduled: {new Date(r.scheduledAt).toLocaleString()}
                  {r.sentAt && ` · Sent: ${new Date(r.sentAt).toLocaleString()}`}
                </p>
                {r.suppressReason && <p className="text-xs text-amber-600 mt-0.5">Suppressed: {r.suppressReason}</p>}
              </div>
              {r.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  onClick={() => suppressMutation.mutate(r.id)}
                  disabled={suppressMutation.isPending}
                >
                  Suppress
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}

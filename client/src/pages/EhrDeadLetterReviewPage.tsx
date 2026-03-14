import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import PageShell from "@/components/PageShell"
import EmptyState from "@/components/EmptyState"
import StatusChip from "@/components/StatusChip"
import { useToast } from "@/hooks/use-toast"

type DeadLetterEntry = {
  id: string
  caseId: string
  error: string
  createdAt: string
  resolvedAt?: string
  resolved: boolean
  retryCount: number
}

export default function EhrDeadLetterReviewPage() {
  const [showResolved, setShowResolved] = useState(false)
  const qc = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ["/api/ehr-dead-letter", showResolved],
    queryFn: () => fetch(`/api/ehr-dead-letter?resolved=${showResolved}`).then((r) => r.json()),
    refetchInterval: 10000,
  })

  const retryMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/ehr-retry/${id}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (data) => {
      toast({ title: data.ok ? "Retry succeeded" : "Retry failed", description: data.result?.error })
      qc.invalidateQueries({ queryKey: ["/api/ehr-dead-letter"] })
    },
  })

  const retryAllMutation = useMutation({
    mutationFn: () =>
      fetch("/api/ehr-retry/all", { method: "POST" }).then((r) => r.json()),
    onSuccess: (data) => {
      toast({ title: `Retry all: ${data.succeeded} succeeded, ${data.failed} failed` })
      qc.invalidateQueries({ queryKey: ["/api/ehr-dead-letter"] })
    },
  })

  const resolveMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/ehr-dead-letter/${id}/resolve`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Marked as resolved" })
      qc.invalidateQueries({ queryKey: ["/api/ehr-dead-letter"] })
    },
  })

  const entries: DeadLetterEntry[] = data?.entries ?? []
  const stats = data?.stats ?? { total: 0, unresolved: 0, resolved: 0 }

  return (
    <PageShell
      title="EHR Dead Letter Review"
      description="Failed EHR exports — retry or resolve manually"
      actions={
        <>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Show resolved
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => retryAllMutation.mutate()}
            disabled={retryAllMutation.isPending || entries.length === 0}
          >
            {retryAllMutation.isPending ? "Retrying…" : "Retry All"}
          </Button>
        </>
      }
    >
      <div className="flex gap-6 text-sm">
        <span>Total: <strong>{stats.total}</strong></span>
        <span className={stats.unresolved > 0 ? "text-red-600" : "text-green-600"}>Unresolved: <strong>{stats.unresolved}</strong></span>
        <span className="text-muted-foreground">Resolved: <strong>{stats.resolved}</strong></span>
      </div>

      {isLoading ? (
        <div className="animate-pulse h-24 bg-muted rounded-xl" />
      ) : entries.length === 0 ? (
        <EmptyState icon="✅" title="No dead letters" description="All EHR exports have been processed successfully." />
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <div key={e.id} className="border rounded-xl p-4 bg-card space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-sm font-medium">{e.caseId}</span>
                <StatusChip label={e.resolved ? "Resolved" : "Unresolved"} level={e.resolved ? "success" : "error"} />
                <Badge variant="outline" className="text-[10px]">Retries: {e.retryCount}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">{e.error}</p>
              {!e.resolved && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => retryMutation.mutate(e.id)}
                    disabled={retryMutation.isPending}
                  >
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => resolveMutation.mutate(e.id)}
                  >
                    Mark resolved
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}

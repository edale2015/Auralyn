import { useQuery } from "@tanstack/react-query"
import {
  BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts"
import AcceptanceSummaryCards from "@/components/AcceptanceSummaryCards"
import SlaSummaryCards from "@/components/SlaSummaryCards"

export default function AcceptanceSlaDashboardPage() {
  const { data: aSummaryData, isLoading: aLoading } = useQuery({
    queryKey: ["/api/acceptance-analytics/summary"],
    queryFn: () => fetch("/api/acceptance-analytics/summary").then((r) => r.json()),
    refetchInterval: 10000,
  })

  const { data: slaSummaryData } = useQuery({
    queryKey: ["/api/sla-analytics/summary"],
    queryFn: () => fetch("/api/sla-analytics/summary").then((r) => r.json()),
    refetchInterval: 10000,
  })

  const { data: queueData } = useQuery({
    queryKey: ["/api/sla-analytics/queue-status"],
    queryFn: () => fetch("/api/sla-analytics/queue-status").then((r) => r.json()),
    refetchInterval: 5000,
  })

  const { data: aPhysData } = useQuery({
    queryKey: ["/api/acceptance-analytics/by-physician"],
    queryFn: () => fetch("/api/acceptance-analytics/by-physician").then((r) => r.json()),
  })

  const { data: slaPhysData } = useQuery({
    queryKey: ["/api/sla-analytics/by-physician"],
    queryFn: () => fetch("/api/sla-analytics/by-physician").then((r) => r.json()),
  })

  const { data: slaTimeData } = useQuery({
    queryKey: ["/api/sla-analytics/timeseries"],
    queryFn: () => fetch("/api/sla-analytics/timeseries").then((r) => r.json()),
  })

  if (aLoading) {
    return <div className="p-8 text-muted-foreground text-sm">Loading acceptance + SLA dashboard…</div>
  }

  const summary = aSummaryData?.summary
  const slaSummary = slaSummaryData?.summary
  const queueStatus = queueData?.summary ?? { onTime: 0, dueSoon: 0, overdue: 0, blockedUrgent: 0 }
  const byPhysician = aPhysData?.rows ?? []
  const slaByPhysician = slaPhysData?.rows ?? []
  const slaTimeSeries = slaTimeData?.rows ?? []

  const defaultSummary = {
    total: 0, unchanged: 0, light: 0, moderate: 0, heavy: 0,
    acceptedUnchangedRate: 0, acceptedLightRate: 0, heavyRewriteRate: 0, avgSimilarity: 0,
  }

  const defaultSla = {
    avg_inbound_to_draft_min: 0,
    avg_draft_to_approve_min: 0,
    avg_approve_to_send_min: 0,
    avg_inbound_to_send_min: 0,
    avg_blocked_to_resolved_min: 0,
  }

  return (
    <div className="p-4 space-y-6 max-w-7xl mx-auto">

      <div>
        <h1 className="text-xl font-semibold mb-1">Acceptance + SLA Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          How often AI drafts are accepted, how much physicians rewrite them, and how fast the message flow moves.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Draft Acceptance
        </h2>
        <AcceptanceSummaryCards summary={summary ?? defaultSummary} />
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          SLA Performance
        </h2>
        <SlaSummaryCards summary={slaSummary ?? defaultSla} queueStatus={queueStatus} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Edit Distribution (All Conversations)</h2>
          {summary ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: "Unchanged", count: summary.unchanged },
                  { name: "Light", count: summary.light },
                  { name: "Moderate", count: summary.moderate },
                  { name: "Heavy", count: summary.heavy },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-4">
              No conversation data yet. Conversations will appear here as doctors send replies via the Split Pane console.
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">SLA by Stage</h2>
          {slaSummary ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: "Inbound→Draft", min: Number(slaSummary.avg_inbound_to_draft_min) },
                  { name: "Draft→Approve", min: Number(slaSummary.avg_draft_to_approve_min) },
                  { name: "Approve→Send", min: Number(slaSummary.avg_approve_to_send_min) },
                  { name: "Total", min: Number(slaSummary.avg_inbound_to_send_min) },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="m" />
                  <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)} min`} />
                  <Bar dataKey="min" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-4">
              No SLA data yet. SLA metrics will populate after physicians send replies.
            </p>
          )}
        </div>

      </div>

      {byPhysician.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Acceptance by Physician</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPhysician}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="physicianId" tickFormatter={(v) => v || "Unassigned"} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="unchanged" name="Unchanged" fill="#3b82f6" />
                <Bar dataKey="light" name="Light" fill="#10b981" />
                <Bar dataKey="moderate" name="Moderate" fill="#f59e0b" />
                <Bar dataKey="heavy" name="Heavy" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {slaByPhysician.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">SLA by Physician</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={slaByPhysician}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="physician_id" tickFormatter={(v) => v || "Unassigned"} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="m" />
                <Tooltip />
                <Legend />
                <Bar dataKey="avg_inbound_to_draft_min" name="Inbound→Draft" fill="#3b82f6" />
                <Bar dataKey="avg_draft_to_approve_min" name="Draft→Approve" fill="#10b981" />
                <Bar dataKey="avg_approve_to_send_min" name="Approve→Send" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {slaTimeSeries.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">SLA Time Series</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={slaTimeSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} unit="m" />
                <Tooltip />
                <Legend />
                <Bar dataKey="avg_inbound_to_draft_min" name="Inbound→Draft" fill="#3b82f6" />
                <Bar dataKey="avg_draft_to_approve_min" name="Draft→Approve" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {(!summary || summary.total === 0) && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <p className="text-sm font-medium mb-1">No conversation data yet</p>
          <p className="text-xs">
            Use the Split Pane console to handle Telegram/WhatsApp conversations. Metrics will populate as doctors send replies.
          </p>
        </div>
      )}

    </div>
  )
}

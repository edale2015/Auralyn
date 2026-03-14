import { useQuery } from "@tanstack/react-query"
import { Link } from "wouter"
import PageShell from "@/components/PageShell"
import StatusChip from "@/components/StatusChip"
import SectionHeader from "@/components/SectionHeader"
import CardGrid from "@/components/CardGrid"
import CompactMetricRow from "@/components/CompactMetricRow"
import MiniSparklineStrip from "@/components/MiniSparklineStrip"
import { useCockpitAutoRefresh } from "@/components/useCockpitAutoRefresh"

export default function OperationsCockpitPage() {
  const { data: readiness, refetch: refetchReadiness } = useQuery({
    queryKey: ["/api/production-readiness"],
    queryFn: () => fetch("/api/production-readiness").then((r) => r.json()),
  })

  const { data: dlData, refetch: refetchDl } = useQuery({
    queryKey: ["/api/ehr-dead-letter/stats"],
    queryFn: () => fetch("/api/ehr-dead-letter/stats").then((r) => r.json()),
  })

  const { data: reminderData, refetch: refetchReminders } = useQuery({
    queryKey: ["/api/reminders/stats"],
    queryFn: () => fetch("/api/reminders/stats").then((r) => r.json()),
  })

  const { data: acceptanceData, refetch: refetchAcceptance } = useQuery({
    queryKey: ["/api/acceptance-analytics/summary"],
    queryFn: () => fetch("/api/acceptance-analytics/summary").then((r) => r.json()),
  })

  const { data: slaData, refetch: refetchSla } = useQuery({
    queryKey: ["/api/sla-analytics/queue-status"],
    queryFn: () => fetch("/api/sla-analytics/queue-status").then((r) => r.json()),
  })

  const { data: latestRunData } = useQuery({
    queryKey: ["/api/staging-validation/latest"],
    queryFn: () => fetch("/api/staging-validation/latest").then((r) => r.json()),
  })

  useCockpitAutoRefresh(() => {
    refetchReadiness()
    refetchDl()
    refetchReminders()
    refetchAcceptance()
    refetchSla()
  }, 15000)

  const r = readiness
  const dl = dlData?.stats
  const reminders = reminderData?.stats
  const acceptance = acceptanceData?.summary
  const queue = slaData?.summary
  const latestRun = latestRunData?.run

  const panels: { title: string; path: string; status: "success" | "warning" | "error" | "info" | "neutral"; statusLabel: string; metrics: { label: string; value: string | number }[] }[] = [
    {
      title: "Production Readiness",
      path: "/production-readiness",
      status: r?.ok ? "success" : "error",
      statusLabel: r?.readinessLevel ?? "Checking…",
      metrics: [
        { label: "Env Checks", value: r?.sections?.environment?.checks?.filter((c: any) => c.ok).length ?? "–" },
        { label: "Providers OK", value: r?.sections?.providers?.checks?.filter((p: any) => p.ok).length ?? "–" },
      ],
    },
    {
      title: "EHR Dead Letter",
      path: "/ehr-dead-letter",
      status: (dl?.unresolved ?? 0) > 0 ? "error" : "success",
      statusLabel: (dl?.unresolved ?? 0) > 0 ? `${dl?.unresolved} unresolved` : "Clear",
      metrics: [
        { label: "Total", value: dl?.total ?? 0 },
        { label: "Unresolved", value: dl?.unresolved ?? 0 },
      ],
    },
    {
      title: "Reminder Timeline",
      path: "/reminder-timeline",
      status: (reminders?.pending ?? 0) > 0 ? "info" : "neutral",
      statusLabel: `${reminders?.pending ?? 0} pending`,
      metrics: [
        { label: "Sent", value: reminders?.sent ?? 0 },
        { label: "Suppressed", value: reminders?.suppressed ?? 0 },
      ],
    },
    {
      title: "Acceptance + SLA",
      path: "/acceptance-sla",
      status: (queue?.overdue ?? 0) > 0 ? "warning" : "success",
      statusLabel: (queue?.overdue ?? 0) > 0 ? `${queue?.overdue} overdue` : "On track",
      metrics: [
        { label: "Total Drafts", value: acceptance?.total ?? 0 },
        { label: "Unchanged %", value: acceptance ? `${(acceptance.acceptedUnchangedRate * 100).toFixed(0)}%` : "–" },
      ],
    },
    {
      title: "Multilingual Templates",
      path: "/multilingual-templates",
      status: "neutral",
      statusLabel: "Templates",
      metrics: [
        { label: "Overdue Queue", value: queue?.overdue ?? 0 },
        { label: "Due Soon", value: queue?.dueSoon ?? 0 },
      ],
    },
    {
      title: "Staging Validation",
      path: "/production-readiness",
      status: !latestRun ? "neutral" : latestRun.status === "passed" ? "success" : latestRun.status === "running" ? "info" : "error",
      statusLabel: latestRun ? latestRun.status : "No run yet",
      metrics: [
        { label: "Last Run", value: latestRun ? new Date(latestRun.startedAt).toLocaleDateString() : "–" },
        { label: "Result", value: latestRun?.status ?? "–" },
      ],
    },
  ]

  return (
    <PageShell
      title="Operations Cockpit"
      description="Real-time overview of all clinical operations modules — click any panel to drill in"
    >
      <CardGrid cols={3}>
        {panels.map((p) => (
          <Link key={p.path + p.title} href={p.path}>
            <div className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">{p.title}</h3>
                <StatusChip label={p.statusLabel} level={p.status} />
              </div>
              <CompactMetricRow metrics={p.metrics.map((m) => ({ label: m.label, value: m.value }))} />
            </div>
          </Link>
        ))}
      </CardGrid>

      {/* Acceptance sparklines */}
      {acceptance && (
        <section>
          <SectionHeader title="Draft Edit Distribution" />
          <div className="border rounded-xl p-4 bg-card">
            <MiniSparklineStrip
              values={[acceptance.unchanged, acceptance.light, acceptance.moderate, acceptance.heavy]}
              label="Unchanged → Light → Moderate → Heavy"
              color="bg-blue-500"
              height={40}
            />
          </div>
        </section>
      )}
    </PageShell>
  )
}

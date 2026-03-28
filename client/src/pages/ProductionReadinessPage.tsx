import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import PageShell from "@/components/PageShell"
import StatusChip from "@/components/StatusChip"
import LoadingCardSkeleton from "@/components/LoadingCardSkeleton"
import SectionHeader from "@/components/SectionHeader"
import { cn } from "@/lib/utils"
import { Activity, ShieldCheck, Cpu, Pill, Database, Radio, RefreshCw, FlaskConical, BookOpen, GitBranch } from "lucide-react"

type CheckResult = { name: string; ok: boolean; detail: string }
type ProviderStatus = { provider: string; ok: boolean; latencyMs?: number; detail: string; checkedAt: string }
type MigrationStatus = { name: string; applied: boolean; appliedAt?: string }
type ValidationRun = { id: string; startedAt: string; finishedAt?: string; status: string; validationResult?: any; smokeResult?: any }

type ProductionLayer = {
  label: string
  configured?: boolean
  active?: boolean
  enabled?: boolean
  allowed?: boolean
  topics?: number
  interactions?: number
  tables?: string[]
  labeled?: number
  threshold?: number
  pctToThreshold?: number
  reason?: string | null
}

type ProductionStatus = {
  ok: boolean
  ts: string
  layers: Record<string, ProductionLayer>
}

type EventBusStats = {
  subscribedTopics: number
  totalEvents: number
  recentEvents?: any[]
}

type LearningEligibility = {
  allowed: boolean
  reason: string | null
  labeled: number
  goldenCases: number
  threshold: number
  pctToThreshold: number
}

const layerIcons: Record<string, any> = {
  fhirR4:      { icon: Activity,     color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950" },
  eventBus:    { icon: Radio,        color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950" },
  medications: { icon: Pill,         color: "text-rose-600",   bg: "bg-rose-50 dark:bg-rose-950" },
  rlhfGating:  { icon: BookOpen,     color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-950" },
  sheetsSync:  { icon: GitBranch,    color: "text-green-600",  bg: "bg-green-50 dark:bg-green-950" },
  repos:       { icon: Database,     color: "text-slate-600",  bg: "bg-slate-50 dark:bg-slate-950" },
}

function layerStatus(layer: ProductionLayer, key: string): "success" | "warning" | "info" {
  if (key === "fhirR4")      return layer.configured ? "success" : "warning"
  if (key === "eventBus")    return layer.active ? "success" : "warning"
  if (key === "medications") return layer.active ? "success" : "warning"
  if (key === "rlhfGating")  return layer.allowed ? "success" : "warning"
  if (key === "sheetsSync")  return layer.enabled ? "info" : "info"
  if (key === "repos")       return layer.active ? "success" : "warning"
  return "info"
}

function layerBadge(layer: ProductionLayer, key: string): string {
  if (key === "fhirR4")      return layer.configured ? "Configured" : "Not Configured"
  if (key === "eventBus")    return layer.active ? `${layer.topics ?? 0} topics` : "Inactive"
  if (key === "medications") return layer.active ? `${layer.interactions ?? 0} rules` : "Inactive"
  if (key === "rlhfGating")  return layer.allowed ? "Unlocked" : "Gated"
  if (key === "sheetsSync")  return layer.enabled ? "Enabled" : "Disabled"
  if (key === "repos")       return layer.active ? `${(layer.tables ?? []).length} tables` : "Inactive"
  return "Unknown"
}

export default function ProductionReadinessPage() {
  const [showFullBundle, setShowFullBundle] = useState(false)
  const [seedLabeled, setSeedLabeled] = useState(5000)
  const qc = useQueryClient()

  const { data: prodStatus, isLoading: prodLoading, refetch: refetchProd } = useQuery<ProductionStatus>({
    queryKey: ["/api/production/status"],
    queryFn: () => fetch("/api/production/status").then((r) => r.json()),
    refetchInterval: 30000,
  })

  const { data: eventBusData, refetch: refetchBus } = useQuery<{ ok: boolean; stats: EventBusStats; recent: any[] }>({
    queryKey: ["/api/production/event-bus"],
    queryFn: () => fetch("/api/production/event-bus").then((r) => r.json()),
    refetchInterval: 15000,
  })

  const { data: eligibilityData, refetch: refetchElig } = useQuery<{ ok: boolean } & LearningEligibility>({
    queryKey: ["/api/production/learning-eligibility"],
    queryFn: () => fetch("/api/production/learning-eligibility").then((r) => r.json()),
    refetchInterval: 30000,
  })

  const seedMutation = useMutation({
    mutationFn: (totalLabeledEncounters: number) =>
      fetch("/api/production/learning-eligibility/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalLabeledEncounters }),
      }).then((r) => r.json()),
    onSuccess: () => {
      refetchElig()
      refetchProd()
      qc.invalidateQueries({ queryKey: ["/api/production/learning-eligibility"] })
    },
  })

  const { data: readinessData, isLoading, refetch } = useQuery({
    queryKey: ["/api/production-readiness"],
    queryFn: () => fetch("/api/production-readiness").then((r) => r.json()),
    refetchInterval: 30000,
  })

  const { data: latestRunData, refetch: refetchRun } = useQuery({
    queryKey: ["/api/staging-validation/latest"],
    queryFn: () => fetch("/api/staging-validation/latest").then((r) => r.json()),
  })

  const runValidation = useMutation({
    mutationFn: () =>
      fetch("/api/staging-validation/run", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => refetchRun(),
  })

  if (isLoading) {
    return (
      <PageShell title="Production Readiness">
        <LoadingCardSkeleton count={4} />
      </PageShell>
    )
  }

  const r = readinessData
  const latestRun: ValidationRun | null = latestRunData?.run ?? null

  function checkIcon(ok: boolean) {
    return ok ? "✅" : "❌"
  }

  function levelFor(ok: boolean) {
    return ok ? "success" : "error"
  }

  return (
    <PageShell
      title="Production Readiness"
      description="Environment checks, provider health, migrations, and staging validation"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Refresh</Button>
          <Button
            size="sm"
            onClick={() => runValidation.mutate()}
            disabled={runValidation.isPending}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {runValidation.isPending ? "Running…" : "▶ Run Staging Validation"}
          </Button>
        </>
      }
    >

      {/* Readiness badge */}
      <div className="flex items-center gap-3">
        <StatusChip
          label={r?.readinessLevel ?? "CHECKING"}
          level={r?.ok ? "success" : "error"}
          className="text-sm px-4 py-2"
        />
        <span className="text-xs text-muted-foreground">{r?.timestamp ? new Date(r.timestamp).toLocaleString() : ""}</span>
      </div>

      {/* Environment checks */}
      {r?.sections?.environment && (
        <section>
          <SectionHeader title="Environment Variables" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(r.sections.environment.checks as CheckResult[]).map((c) => (
              <div key={c.name} className="flex items-start gap-2 border rounded-lg px-3 py-2 text-xs bg-card">
                <span>{checkIcon(c.ok)}</span>
                <div>
                  <p className="font-mono font-medium">{c.name}</p>
                  <p className="text-muted-foreground">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Provider health */}
      {r?.sections?.providers && (
        <section>
          <SectionHeader title="External Providers" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(r.sections.providers.checks as ProviderStatus[]).map((p) => (
              <div key={p.provider} className="flex items-start gap-2 border rounded-lg px-3 py-2 text-xs bg-card">
                <span>{checkIcon(p.ok)}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium capitalize">{p.provider}</p>
                    <StatusChip label={p.ok ? "OK" : "Down"} level={levelFor(p.ok)} />
                    {p.latencyMs !== undefined && <span className="text-muted-foreground">{p.latencyMs}ms</span>}
                  </div>
                  <p className="text-muted-foreground">{p.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Migrations */}
      {r?.sections?.migrations && (
        <section>
          <SectionHeader title="Database Migrations" />
          <div className="flex items-center gap-3 mb-2">
            <StatusChip label={r.sections.migrations.ok ? "All Applied" : "Pending"} level={r.sections.migrations.ok ? "success" : "warning"} />
            <span className="text-xs text-muted-foreground">{r.sections.migrations.applied?.length ?? 0} applied</span>
            {(r.sections.migrations.pending?.length ?? 0) > 0 && (
              <span className="text-xs text-red-600">{r.sections.migrations.pending.length} pending</span>
            )}
          </div>
        </section>
      )}

      {/* Dead letter queue */}
      {r?.sections?.deadLetter && (
        <section>
          <SectionHeader title="EHR Dead Letter Queue" />
          <div className="flex gap-4 text-sm">
            <span>Total: <strong>{r.sections.deadLetter.total}</strong></span>
            <span className={cn(r.sections.deadLetter.unresolved > 0 ? "text-red-600" : "text-green-600")}>
              Unresolved: <strong>{r.sections.deadLetter.unresolved}</strong>
            </span>
            <span className="text-muted-foreground">Resolved: <strong>{r.sections.deadLetter.resolved}</strong></span>
          </div>
        </section>
      )}

      {/* ── Production Architecture Layers ─────────────────────────────── */}
      <section>
        <SectionHeader
          title="Production Architecture Layers"
          description="FHIR R4 interoperability, clinical event bus, medication safety, RLHF gating, repos"
        />
        {prodLoading ? (
          <LoadingCardSkeleton count={3} />
        ) : prodStatus?.layers ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(prodStatus.layers).map(([key, layer]) => {
              const meta   = layerIcons[key] ?? { icon: Cpu, color: "text-slate-500", bg: "bg-slate-50 dark:bg-slate-950" }
              const Icon   = meta.icon
              const status = layerStatus(layer, key)
              const badge  = layerBadge(layer, key)
              return (
                <div
                  key={key}
                  data-testid={`layer-card-${key}`}
                  className="border rounded-xl p-4 bg-card flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg", meta.bg)}>
                      <Icon className={cn("h-4 w-4", meta.color)} />
                    </div>
                    <span className="font-medium text-sm">{layer.label}</span>
                    <StatusChip label={badge} level={status} className="ml-auto text-xs" />
                  </div>
                  {key === "repos" && layer.tables && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {layer.tables.map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs font-mono">{t}</Badge>
                      ))}
                    </div>
                  )}
                  {key === "fhirR4" && !layer.configured && (
                    <p className="text-xs text-muted-foreground">Set <code className="font-mono">FHIR_BASE_URL</code> to enable R4 sync</p>
                  )}
                  {key === "rlhfGating" && layer.reason && (
                    <p className="text-xs text-muted-foreground">{layer.reason}</p>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="border border-dashed rounded-xl p-6 text-center text-sm text-muted-foreground">No layer data yet</div>
        )}
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => refetchProd()} data-testid="button-refresh-layers">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh layers
          </Button>
        </div>
      </section>

      {/* ── Clinical Event Bus ────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Clinical Event Bus" description="Real-time event tracking across the care pipeline" />
        {eventBusData ? (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm flex-wrap">
              <span>Topics: <strong data-testid="text-bus-topics">{eventBusData.stats?.subscribedTopics ?? 0}</strong></span>
              <span>Total Events: <strong data-testid="text-bus-events">{eventBusData.stats?.totalEvents ?? 0}</strong></span>
            </div>
            {(eventBusData.recent?.length ?? 0) > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Topic</th>
                      <th className="px-3 py-2 text-left font-medium">Event ID</th>
                      <th className="px-3 py-2 text-left font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventBusData.recent.slice(0, 8).map((ev: any, i: number) => (
                      <tr key={i} className="border-t" data-testid={`row-event-${i}`}>
                        <td className="px-3 py-1.5 font-mono text-purple-700 dark:text-purple-400">{ev.topic}</td>
                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[180px]">{ev.id}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{new Date(ev.ts).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading event bus stats…</p>
        )}
      </section>

      {/* ── RLHF Learning Gate ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="RLHF Autonomous Learning Gate" description="Autonomous learning only unlocks after 10,000 labeled encounters" />
        {eligibilityData ? (
          <div className="border rounded-xl p-4 space-y-3 bg-card">
            <div className="flex items-center gap-3">
              <StatusChip
                label={eligibilityData.allowed ? "Learning Unlocked" : "Gated — Awaiting Labels"}
                level={eligibilityData.allowed ? "success" : "warning"}
              />
              <span className="text-xs text-muted-foreground" data-testid="text-labeled-count">
                {(eligibilityData.labeled ?? 0).toLocaleString()} / {(eligibilityData.threshold ?? 0).toLocaleString()} labeled
              </span>
            </div>
            <Progress value={eligibilityData.pctToThreshold ?? 0} className="h-2" data-testid="progress-rlhf" />
            {eligibilityData.reason && (
              <p className="text-xs text-muted-foreground">{eligibilityData.reason}</p>
            )}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-xs text-muted-foreground">Seed labeled count:</span>
              <input
                type="number"
                data-testid="input-seed-labeled"
                value={seedLabeled}
                onChange={(e) => setSeedLabeled(Number(e.target.value))}
                className="border rounded px-2 py-1 text-xs w-28"
              />
              <Button
                size="sm"
                variant="outline"
                data-testid="button-seed-labels"
                onClick={() => seedMutation.mutate(seedLabeled)}
                disabled={seedMutation.isPending}
              >
                {seedMutation.isPending ? "Seeding…" : "Seed Labels"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading eligibility…</p>
        )}
      </section>

      {/* Latest staging validation run */}
      <section>
        <SectionHeader
          title="Staging Validation"
          description="Run automated checks to validate the staging environment"
        />
        {latestRun ? (
          <div className="border rounded-xl p-4 space-y-3 bg-card">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusChip
                label={latestRun.status.replace("_", " ").toUpperCase()}
                level={latestRun.status === "passed" ? "success" : latestRun.status === "running" ? "info" : "error"}
              />
              <span className="text-xs text-muted-foreground">Run ID: {latestRun.id}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(latestRun.startedAt).toLocaleString()}
                {latestRun.finishedAt && ` → ${new Date(latestRun.finishedAt).toLocaleTimeString()}`}
              </span>
            </div>

            {latestRun.validationResult && (
              <div>
                <p className="text-xs font-semibold mb-1">Validation Checks</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {latestRun.validationResult.checks?.map((c: any) => (
                    <div key={c.name} className="flex items-start gap-2 text-xs bg-muted rounded px-2 py-1.5">
                      <span>{checkIcon(c.ok)}</span>
                      <div>
                        <p className="font-mono font-medium">{c.name}</p>
                        <p className="text-muted-foreground">{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {latestRun.smokeResult && (
              <div>
                <p className="text-xs font-semibold mb-1">Smoke Tests</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
                  {latestRun.smokeResult.results?.map((r: any) => (
                    <div key={r.test} className="flex items-start gap-2 text-xs bg-muted rounded px-2 py-1.5">
                      <span>{checkIcon(r.ok)}</span>
                      <div>
                        <p className="font-mono font-medium">{r.test}</p>
                        <p className="text-muted-foreground">{r.detail} ({r.durationMs}ms)</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground">
            <p className="text-sm">No validation runs yet</p>
            <p className="text-xs mt-1">Click "Run Staging Validation" to start</p>
          </div>
        )}
      </section>

    </PageShell>
  )
}

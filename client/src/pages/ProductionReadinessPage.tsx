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
import { Activity, ShieldCheck, Cpu, Pill, Database, Radio, RefreshCw, BookOpen, GitBranch, Lock, FileCheck, Merge, Stethoscope, ScrollText, LogIn, Building2, Send, BarChart3, CreditCard, BrainCircuit, KeyRound, Snowflake, FlaskConical, GitMerge, HeartPulse, Baby, Heart, Brain, FileText, ClipboardCheck, ShieldAlert } from "lucide-react"

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
  fhirR4:               { icon: Activity,      color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950" },
  eventBus:             { icon: Radio,         color: "text-purple-600",  bg: "bg-purple-50 dark:bg-purple-950" },
  medications:          { icon: Pill,          color: "text-rose-600",    bg: "bg-rose-50 dark:bg-rose-950" },
  rlhfGating:           { icon: BookOpen,      color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950" },
  sheetsSync:           { icon: GitBranch,     color: "text-green-600",   bg: "bg-green-50 dark:bg-green-950" },
  repos:                { icon: Database,      color: "text-slate-600",   bg: "bg-slate-50 dark:bg-slate-950" },
  rowLevelSecurity:     { icon: Lock,          color: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-950" },
  claimScrubber:        { icon: FileCheck,     color: "text-teal-600",    bg: "bg-teal-50 dark:bg-teal-950" },
  multiComplaintFusion: { icon: Merge,         color: "text-orange-600",  bg: "bg-orange-50 dark:bg-orange-950" },
  surescripts:          { icon: Stethoscope,   color: "text-cyan-600",    bg: "bg-cyan-50 dark:bg-cyan-950" },
  immutableAudit:       { icon: ScrollText,    color: "text-red-600",     bg: "bg-red-50 dark:bg-red-950" },
  // ── Depth & Maturity Layer (8 new) ──────────────────────────────────────────
  smartLaunchFlow:      { icon: LogIn,         color: "text-sky-600",     bg: "bg-sky-50 dark:bg-sky-950" },
  epicAdapter:          { icon: Building2,     color: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-950" },
  erxReal:              { icon: Send,          color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950" },
  hccEngine:            { icon: BarChart3,     color: "text-lime-600",    bg: "bg-lime-50 dark:bg-lime-950" },
  payerRules:           { icon: CreditCard,    color: "text-pink-600",    bg: "bg-pink-50 dark:bg-pink-950" },
  bayesianDifferential: { icon: BrainCircuit,  color: "text-fuchsia-600", bg: "bg-fuchsia-50 dark:bg-fuchsia-950" },
  secureAudit:          { icon: KeyRound,      color: "text-yellow-600",  bg: "bg-yellow-50 dark:bg-yellow-950" },
  modelFreeze:          { icon: Snowflake,     color: "text-blue-400",    bg: "bg-blue-50 dark:bg-blue-950" },
  studyPipeline:        { icon: FlaskConical,  color: "text-green-700",   bg: "bg-green-50 dark:bg-green-950" },
  // ── Clinical Safety Remediation Layer (8 new) ────────────────────────────────
  conflictResolver:     { icon: GitMerge,      color: "text-orange-500",  bg: "bg-orange-50 dark:bg-orange-950" },
  sepsisDetection:      { icon: HeartPulse,    color: "text-red-700",     bg: "bg-red-50 dark:bg-red-950" },
  pediatricSafety:      { icon: Baby,          color: "text-pink-500",    bg: "bg-pink-50 dark:bg-pink-950" },
  obstetricSafety:      { icon: Heart,         color: "text-rose-600",    bg: "bg-rose-50 dark:bg-rose-950" },
  mentalHealthCrisis:   { icon: Brain,         color: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-950" },
  fdaIntendedUse:       { icon: FileText,      color: "text-blue-700",    bg: "bg-blue-50 dark:bg-blue-950" },
  rlhfReviewQueue:      { icon: ClipboardCheck,color: "text-amber-700",   bg: "bg-amber-50 dark:bg-amber-950" },
  masterSafetyPipeline: { icon: ShieldAlert,   color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-950" },
}

type ExtLayer = ProductionLayer & {
  tables?: number
  policies?: number
  priorAuthCpts?: number
  rules?: number
  totalRecords?: number
  fileSizeBytes?: number
  // Depth & Maturity fields
  provider?: string
  icdMappings?: number
  payers?: number
  diagnoses?: number
  total?: number
  chainHead?: string
  frozen?: boolean
  canLearn?: boolean
  version?: string
  versionLocked?: boolean
  passThreshold?: number
  // Clinical safety fields
  strategies?: number
  tools?: string[]
  tool?: string
  pathways?: number
  stages?: number
  deviceClass?: string
  humanInLoop?: boolean
  clinicalConditions?: number
  pending?: number
  approved?: number
  rejected?: number
}

function layerStatus(layer: ExtLayer, key: string): "success" | "warning" | "info" {
  if (key === "fhirR4")               return layer.configured ? "success" : "warning"
  if (key === "eventBus")             return layer.active ? "success" : "warning"
  if (key === "medications")          return layer.active ? "success" : "warning"
  if (key === "rlhfGating")           return layer.allowed ? "success" : "warning"
  if (key === "sheetsSync")           return "info"
  if (key === "repos")                return layer.active ? "success" : "warning"
  if (key === "rowLevelSecurity")     return layer.active ? "success" : "warning"
  if (key === "claimScrubber")        return layer.active ? "success" : "warning"
  if (key === "multiComplaintFusion") return layer.active ? "success" : "warning"
  if (key === "surescripts")          return layer.enabled ? "success" : "info"
  if (key === "immutableAudit")       return layer.active ? "success" : "warning"
  // Depth & Maturity
  if (key === "smartLaunchFlow")      return layer.configured ? "success" : "info"
  if (key === "epicAdapter")          return layer.configured ? "success" : "info"
  if (key === "erxReal")              return layer.active ? "success" : "warning"
  if (key === "hccEngine")            return layer.active ? "success" : "warning"
  if (key === "payerRules")           return layer.active ? "success" : "warning"
  if (key === "bayesianDifferential") return layer.active ? "success" : "warning"
  if (key === "secureAudit")          return layer.active ? "success" : "warning"
  if (key === "modelFreeze")          return layer.frozen ? "warning" : "success"
  if (key === "studyPipeline")        return layer.active ? "success" : "warning"
  // Clinical Safety
  if (key === "conflictResolver")     return layer.active ? "success" : "warning"
  if (key === "sepsisDetection")      return layer.active ? "success" : "warning"
  if (key === "pediatricSafety")      return layer.active ? "success" : "warning"
  if (key === "obstetricSafety")      return layer.active ? "success" : "warning"
  if (key === "mentalHealthCrisis")   return layer.active ? "success" : "warning"
  if (key === "fdaIntendedUse")       return layer.active ? "success" : "info"
  if (key === "rlhfReviewQueue")      return layer.active ? "success" : "warning"
  if (key === "masterSafetyPipeline") return layer.active ? "success" : "warning"
  return "info"
}

function layerBadge(layer: ExtLayer, key: string): string {
  if (key === "fhirR4")               return layer.configured ? "Configured" : "Not Configured"
  if (key === "eventBus")             return layer.active ? `${layer.topics ?? 0} topics` : "Inactive"
  if (key === "medications")          return layer.active ? `${layer.interactions ?? 0} rules` : "Inactive"
  if (key === "rlhfGating")           return layer.allowed ? "Unlocked" : "Gated"
  if (key === "sheetsSync")           return layer.enabled ? "Enabled" : "Disabled"
  if (key === "repos")                return layer.active ? `${Array.isArray((layer as any).tables) ? (layer as any).tables.length : 4} tables` : "Inactive"
  if (key === "rowLevelSecurity")     return layer.active ? `${layer.policies ?? 3} policies` : "Inactive"
  if (key === "claimScrubber")        return layer.active ? `${layer.priorAuthCpts ?? 6} PA CPTs` : "Inactive"
  if (key === "multiComplaintFusion") return layer.active ? `${layer.rules ?? 8} syndromes` : "Inactive"
  if (key === "surescripts")          return layer.enabled ? "Live" : "Stub Mode"
  if (key === "immutableAudit")       return layer.active ? `${layer.totalRecords ?? 0} records` : "Inactive"
  // Depth & Maturity
  if (key === "smartLaunchFlow")      return layer.configured ? "EPIC-Ready" : "Env Needed"
  if (key === "epicAdapter")          return layer.configured ? "Connected" : "Env Needed"
  if (key === "erxReal")              return layer.active ? `${layer.provider ?? "stub"}` : "Inactive"
  if (key === "hccEngine")            return layer.active ? `${layer.icdMappings ?? 20} ICD-10` : "Inactive"
  if (key === "payerRules")           return layer.active ? `${layer.payers ?? 5} payers` : "Inactive"
  if (key === "bayesianDifferential") return layer.active ? `${layer.diagnoses ?? 8} dx priors` : "Inactive"
  if (key === "secureAudit")          return layer.active ? `${layer.total ?? 0} chained` : "Inactive"
  if (key === "modelFreeze")          return layer.frozen ? "Frozen" : (layer.canLearn ? "Learning ON" : "Locked")
  if (key === "studyPipeline")        return layer.active ? `≥${((layer.passThreshold ?? 0.85) * 100).toFixed(0)}% threshold` : "Inactive"
  // Clinical Safety
  if (key === "conflictResolver")     return layer.active ? `${layer.strategies ?? 4} strategies` : "Inactive"
  if (key === "sepsisDetection")      return layer.active ? (layer.tools as any)?.join(" + ") ?? "qSOFA + NEWS2" : "Inactive"
  if (key === "pediatricSafety")      return layer.active ? layer.tool ?? "PEWS" : "Inactive"
  if (key === "obstetricSafety")      return layer.active ? `${layer.pathways ?? 4} pathways` : "Inactive"
  if (key === "mentalHealthCrisis")   return layer.active ? (layer.tools as any)?.join(" + ") ?? "PHQ-9 + C-SSRS" : "Inactive"
  if (key === "fdaIntendedUse")       return layer.active ? `Class ${layer.deviceClass ?? "II"} SaMD` : "Inactive"
  if (key === "rlhfReviewQueue")      return layer.active ? `${layer.pending ?? 0} pending` : "Inactive"
  if (key === "masterSafetyPipeline") return layer.active ? `${layer.stages ?? 5} stages` : "Inactive"
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

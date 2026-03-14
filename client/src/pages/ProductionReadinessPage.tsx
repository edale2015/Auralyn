import { useQuery, useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import PageShell from "@/components/PageShell"
import StatusChip from "@/components/StatusChip"
import LoadingCardSkeleton from "@/components/LoadingCardSkeleton"
import SectionHeader from "@/components/SectionHeader"
import { cn } from "@/lib/utils"

type CheckResult = { name: string; ok: boolean; detail: string }
type ProviderStatus = { provider: string; ok: boolean; latencyMs?: number; detail: string; checkedAt: string }
type MigrationStatus = { name: string; applied: boolean; appliedAt?: string }
type ValidationRun = { id: string; startedAt: string; finishedAt?: string; status: string; validationResult?: any; smokeResult?: any }

export default function ProductionReadinessPage() {
  const [showFullBundle, setShowFullBundle] = useState(false)

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

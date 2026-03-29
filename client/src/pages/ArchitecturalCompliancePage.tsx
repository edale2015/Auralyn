import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle2, AlertCircle, Clock, RefreshCw, ChevronDown, ChevronRight,
  Shield, ShieldCheck, ShieldAlert, Activity, Brain, Pill, Zap,
  GitBranch, Database, FileCheck, Users, FlaskConical, Lock,
  TrendingUp, ArrowRight, RotateCcw, Check, X
} from "lucide-react"
import { apiRequest } from "@/lib/queryClient"

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface Concern {
  id: string; title: string; priority: string; reviewNote: string
  status: "IMPLEMENTED" | "PARTIAL" | "SCAFFOLDED"; statusNote: string
  evidence: string[]; remainingWork: string[]
}
interface Assessment {
  summary: { total: number; implemented: number; partial: number; scaffolded: number; critical: number }
  concerns: Concern[]
  assessedAt: string
}
interface Proposal {
  proposalId: string; diagnosisKey: string; delta: number
  rationale: string; proposedBy: string; proposedAt: string; outcome?: string
}
interface ModelVersion {
  versionId: string; appliedAt: string; approvedBy: string
  updatesCount: number; proposalIds: string[]; notes?: string
}
interface RLHFData {
  pending: Proposal[]; versions: ModelVersion[]
  stats: { pendingCount: number; approvedVersions: number; rejectedCount: number; latestVersion: string | null; redisHydrated: boolean }
}
interface MedSafetyResult {
  riskLevel: string; safeToProceed: boolean
  interactions: Array<{ drugA: string; drugB: string; severity: string; reason: string }>
  formulary: { covered: boolean; priorAuthRequired: boolean; preferredAlternative?: string }
  dea: { allowed: boolean; schedule: string | null; reason?: string }
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  if (status === "IMPLEMENTED")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">Implemented</Badge>
  if (status === "PARTIAL")
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs">Partial</Badge>
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs">Scaffolded</Badge>
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    HIGH:     "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    MEDIUM:   "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  }
  return <Badge className={`text-xs ${map[priority] ?? "bg-gray-100"}`}>{priority}</Badge>
}

const CONCERN_ICONS: Record<string, React.ElementType> = {
  "sheets-migration":       Database,
  "fhir-integration":       Zap,
  "intended-use":           FileCheck,
  "safety-pathways":        ShieldAlert,
  "async-llm":              Brain,
  "multi-complaint-fusion": Activity,
  "snomed-anchoring":       GitBranch,
  "rlhf-human-gate":        Lock,
  "medication-safety":      Pill,
  "event-driven-arch":      TrendingUp,
}

/* ─── Page ────────────────────────────────────────────────────────────────── */
export default function ArchitecturalCompliancePage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [expandedConcern, setExpandedConcern] = useState<string | null>(null)
  const [approvedBy, setApprovedBy] = useState("physician")
  const [approveNotes, setApproveNotes] = useState("")
  const [rejectedBy, setRejectedBy] = useState("physician")
  const [medDrug, setMedDrug] = useState("")
  const [medCurrentMeds, setMedCurrentMeds] = useState("")
  const [medResult, setMedResult] = useState<MedSafetyResult | null>(null)
  const [medLoading, setMedLoading] = useState(false)

  const { data: assessment, isLoading: asmtLoading } = useQuery<Assessment>({
    queryKey: ["/api/architecture/assessment"],
    queryFn: () => fetch("/api/architecture/assessment").then(r => r.json()),
    refetchInterval: 60000,
  })

  const { data: rlhf, isLoading: rlhfLoading } = useQuery<RLHFData>({
    queryKey: ["/api/architecture/rlhf/proposals"],
    queryFn: () => fetch("/api/architecture/rlhf/proposals").then(r => r.json()),
    refetchInterval: 15000,
  })

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/architecture/rlhf/approve", { approvedBy, notes: approveNotes }),
    onSuccess: () => {
      toast({ title: "Proposals approved", description: "New model version created successfully" })
      qc.invalidateQueries({ queryKey: ["/api/architecture/rlhf/proposals"] })
      qc.invalidateQueries({ queryKey: ["/api/architecture/assessment"] })
      setApproveNotes("")
    },
    onError: (e: any) => toast({ title: "Approval failed", description: e.message, variant: "destructive" }),
  })

  const rejectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/architecture/rlhf/reject", { rejectedBy, reason: "Physician review: rejected" }),
    onSuccess: (data: any) => {
      toast({ title: `${data.count} proposals rejected`, description: "Proposal queue cleared" })
      qc.invalidateQueries({ queryKey: ["/api/architecture/rlhf/proposals"] })
    },
    onError: (e: any) => toast({ title: "Rejection failed", description: e.message, variant: "destructive" }),
  })

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => apiRequest("POST", "/api/architecture/rlhf/rollback", { versionId, rolledBackBy: approvedBy }),
    onSuccess: () => {
      toast({ title: "Version rolled back" })
      qc.invalidateQueries({ queryKey: ["/api/architecture/rlhf/proposals"] })
    },
  })

  async function runMedCheck() {
    if (!medDrug.trim()) return
    setMedLoading(true)
    try {
      const r = await fetch("/api/medications/safety-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedDrug: medDrug.trim(),
          currentMeds: medCurrentMeds.split(",").map(s => s.trim()).filter(Boolean),
        }),
      })
      setMedResult(await r.json())
    } catch {
      toast({ title: "Medication check failed", variant: "destructive" })
    } finally {
      setMedLoading(false)
    }
  }

  function toggleConcern(id: string) {
    setExpandedConcern(prev => prev === id ? null : id)
  }

  const implementedCount = assessment?.summary.implemented ?? 0
  const totalCount       = assessment?.summary.total ?? 0
  const scorePercent     = totalCount > 0 ? Math.round((implementedCount / totalCount) * 100) : 0

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto" data-testid="arch-compliance-page">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-arch-title">Architectural Compliance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Claude 9 &amp; 10 review gap analysis · RLHF proposal governance · Real implementations vs. scaffolded code
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["/api/architecture/assessment"] })} data-testid="button-refresh-arch">
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      {/* ── Score Banner ──────────────────────────────────────────────────── */}
      {asmtLoading ? <Skeleton className="h-28" /> : assessment ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <div className="relative h-20 w-20">
                <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/20" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeDasharray={`${scorePercent} ${100 - scorePercent}`}
                    className="text-green-600 transition-all duration-700" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">{scorePercent}%</span>
              </div>
              <div className="grid grid-cols-4 gap-6 flex-1">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{assessment.summary.implemented}</p>
                  <p className="text-xs text-muted-foreground">Implemented</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">{assessment.summary.partial}</p>
                  <p className="text-xs text-muted-foreground">Partial</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{assessment.summary.scaffolded}</p>
                  <p className="text-xs text-muted-foreground">Scaffolded</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-700">{assessment.summary.critical}</p>
                  <p className="text-xs text-muted-foreground">Critical Gaps</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Gap Assessment ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Review Concerns — Full Gap Analysis
        </h2>
        <div className="space-y-2">
          {asmtLoading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />) :
            assessment?.concerns.map((c) => {
              const Icon = CONCERN_ICONS[c.id] ?? Shield
              const expanded = expandedConcern === c.id
              return (
                <Card key={c.id} className="overflow-hidden" data-testid={`card-concern-${c.id}`}>
                  <button
                    className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                    onClick={() => toggleConcern(c.id)}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium text-sm flex-1">{c.title}</span>
                    <PriorityBadge priority={c.priority} />
                    <StatusBadge status={c.status} />
                    {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground ml-2" /> : <ChevronRight className="h-4 w-4 text-muted-foreground ml-2" />}
                  </button>
                  {expanded && (
                    <CardContent className="pt-0 pb-4 px-4 border-t space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Reviewer Note</p>
                        <p className="text-sm italic text-muted-foreground">{c.reviewNote}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Our Assessment</p>
                        <p className="text-sm">{c.statusNote}</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase mb-1">Evidence</p>
                          <ul className="space-y-1">
                            {c.evidence.map((e, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs">
                                <CheckCircle2 className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />{e}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {c.remainingWork.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase mb-1">Remaining Work</p>
                            <ul className="space-y-1">
                              {c.remainingWork.map((w, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs">
                                  <ArrowRight className="h-3 w-3 text-orange-600 mt-0.5 flex-shrink-0" />{w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })
          }
        </div>
      </section>

      {/* ── RLHF Proposal Governance ──────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          RLHF Proposal Governance — Human Review Gate
        </h2>
        {rlhfLoading ? <Skeleton className="h-48" /> : rlhf ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Proposal queue */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Pending Proposals
                  <Badge variant="outline" className="ml-auto">{rlhf.stats.pendingCount}</Badge>
                  {rlhf.stats.redisHydrated && (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">Redis-backed</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rlhf.pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No pending proposals</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {rlhf.pending.slice(0, 10).map((p) => (
                      <div key={p.proposalId} className="text-xs border rounded p-2 space-y-0.5" data-testid={`row-proposal-${p.proposalId}`}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground">{p.proposalId.slice(-8)}</span>
                          <span className="font-medium">{p.diagnosisKey}</span>
                          <Badge variant="outline" className="ml-auto text-xs">Δ{p.delta > 0 ? "+" : ""}{p.delta}</Badge>
                        </div>
                        <p className="text-muted-foreground truncate">{p.rationale}</p>
                      </div>
                    ))}
                    {rlhf.pending.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center">+{rlhf.pending.length - 10} more</p>
                    )}
                  </div>
                )}
                {rlhf.pending.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <Input
                      value={approvedBy}
                      onChange={e => setApprovedBy(e.target.value)}
                      placeholder="Approver ID"
                      className="text-sm h-8"
                      data-testid="input-approved-by"
                    />
                    <Input
                      value={approveNotes}
                      onChange={e => setApproveNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      className="text-sm h-8"
                      data-testid="input-approve-notes"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => approveMutation.mutate()}
                        disabled={approveMutation.isPending} data-testid="button-approve-proposals">
                        <Check className="h-3 w-3 mr-1" />
                        Approve All ({rlhf.stats.pendingCount})
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate()}
                        disabled={rejectMutation.isPending} data-testid="button-reject-proposals">
                        <X className="h-3 w-3 mr-1" />
                        Reject All
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Model versions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Approved Model Versions
                  <Badge variant="outline" className="ml-auto">{rlhf.stats.approvedVersions}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {rlhf.versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No approved versions yet</p>
                  ) : rlhf.versions.slice(0, 8).map((v) => (
                    <div key={v.versionId} className="flex items-center gap-2 text-xs border rounded p-2" data-testid={`row-version-${v.versionId}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{v.versionId}</span>
                          <span className="text-muted-foreground">{v.updatesCount} updates</span>
                        </div>
                        <p className="text-muted-foreground truncate">By {v.approvedBy} · {new Date(v.appliedAt).toLocaleDateString()}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                        onClick={() => rollbackMutation.mutate(v.versionId)}
                        disabled={rollbackMutation.isPending}
                        data-testid={`button-rollback-${v.versionId}`}>
                        <RotateCcw className="h-3 w-3 mr-1" />Rollback
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-2 border-t text-xs text-muted-foreground flex gap-4">
                  <span>{rlhf.stats.rejectedCount} proposals rejected</span>
                  {rlhf.stats.latestVersion && <span>Latest: {rlhf.stats.latestVersion}</span>}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>

      {/* ── Medication Safety Console ─────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Medication Safety Check — Live Console
        </h2>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Proposed drug</label>
                <Input
                  value={medDrug}
                  onChange={e => setMedDrug(e.target.value)}
                  placeholder="e.g. warfarin"
                  data-testid="input-proposed-drug"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Current medications (comma-separated)</label>
                <Input
                  value={medCurrentMeds}
                  onChange={e => setMedCurrentMeds(e.target.value)}
                  placeholder="e.g. ibuprofen, lisinopril"
                  data-testid="input-current-meds"
                />
              </div>
            </div>
            <Button size="sm" onClick={runMedCheck} disabled={medLoading || !medDrug.trim()} data-testid="button-run-med-check">
              <Pill className="h-4 w-4 mr-2" />
              {medLoading ? "Checking..." : "Run Safety Check"}
            </Button>
            {medResult && (
              <div className="border rounded p-3 space-y-3 mt-2" data-testid="section-med-result">
                <div className="flex items-center gap-3">
                  {medResult.safeToProceed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <div>
                    <p className="font-semibold text-sm" data-testid="text-med-safe-status">
                      {medResult.safeToProceed ? "Safe to Prescribe" : "Do Not Prescribe — Safety Alert"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Risk level: <span className={`font-medium ${medResult.riskLevel === "high" ? "text-red-600" : medResult.riskLevel === "moderate" ? "text-orange-600" : "text-green-600"}`}>
                        {medResult.riskLevel.toUpperCase()}
                      </span>
                    </p>
                  </div>
                </div>
                {medResult.interactions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1">Drug Interactions</p>
                    {medResult.interactions.map((i, idx) => (
                      <div key={idx} className="text-xs bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-2 mb-1">
                        <span className="font-medium">{i.drugA}</span> + <span className="font-medium">{i.drugB}</span>
                        <span className="ml-2 text-red-600">[{i.severity}]</span>: {i.reason}
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="border rounded p-2">
                    <p className="font-semibold mb-0.5">Formulary</p>
                    <p className={medResult.formulary.covered ? "text-green-600" : "text-red-600"}>
                      {medResult.formulary.covered ? "Covered" : "Not covered"}
                    </p>
                    {medResult.formulary.priorAuthRequired && <p className="text-orange-600">Prior auth required</p>}
                    {medResult.formulary.preferredAlternative && <p className="text-blue-600">Alt: {medResult.formulary.preferredAlternative}</p>}
                  </div>
                  <div className="border rounded p-2">
                    <p className="font-semibold mb-0.5">DEA Schedule</p>
                    <p className={medResult.dea.allowed ? "text-green-600" : "text-red-600"}>
                      {medResult.dea.schedule ? `Schedule ${medResult.dea.schedule}` : "Not controlled"}
                    </p>
                    {!medResult.dea.allowed && <p className="text-red-600 text-xs">{medResult.dea.reason}</p>}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Multi-Complaint Fusion Demo ───────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Multi-Complaint Fusion — Pipeline Stage 1.5
        </h2>
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Multi-complaint fusion runs automatically in the final pipeline between NLP intake and hybrid reasoning.
              It detects compound syndromes that a linear decision tree would miss.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                { label: "Pulmonary Embolism", symptoms: ["chest pain", "shortness of breath", "leg swelling"] },
                { label: "STEMI / ACS", symptoms: ["chest pain", "left arm pain", "sweating", "nausea"] },
                { label: "Stroke / CVA", symptoms: ["facial droop", "arm weakness", "slurred speech"] },
                { label: "Sepsis", symptoms: ["fever", "tachycardia", "altered mental status", "confusion"] },
                { label: "Anaphylaxis", symptoms: ["hives", "throat swelling", "difficulty breathing"] },
                { label: "Meningitis", symptoms: ["fever", "neck stiffness", "headache", "photophobia"] },
              ].map((demo) => (
                <FusionDemoCard key={demo.label} {...demo} />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  )
}

/* ─── Fusion demo sub-component ───────────────────────────────────────────── */
function FusionDemoCard({ label, symptoms }: { label: string; symptoms: string[] }) {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function test() {
    setLoading(true)
    try {
      const r = await fetch("/api/final-layer/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptoms, complaint: symptoms[0], freeText: symptoms.join(", ") }),
      })
      const data = await r.json()
      setResult(data)
    } catch {
      setResult({ error: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border rounded p-3 space-y-2 text-xs" data-testid={`card-fusion-${label.replace(/\s+/g, "-").toLowerCase()}`}>
      <p className="font-semibold">{label}</p>
      <p className="text-muted-foreground">{symptoms.join(", ")}</p>
      {result && !result.error && (
        <div className="space-y-1">
          {result.fusionResult ? (
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs w-full justify-center">
              ⚠ {result.fusionResult.suspicion} [{result.fusionResult.priority}]
            </Badge>
          ) : (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs w-full justify-center">
              No high-acuity fusion
            </Badge>
          )}
          <p className="text-muted-foreground">
            Disposition: <span className="font-medium">{result.safetyDisposition}</span> ·
            Top Dx: <span className="font-medium">{result.topDiagnosis}</span>
          </p>
          <p className="text-muted-foreground">{result.durationMs}ms · v{result.pipelineVersion}</p>
        </div>
      )}
      {result?.error && <p className="text-red-600">Pipeline error</p>}
      <Button size="sm" className="w-full h-7 text-xs" onClick={test} disabled={loading}>
        {loading ? "Running..." : "Test Pipeline"}
      </Button>
    </div>
  )
}

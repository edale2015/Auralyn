import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DollarSign, TrendingUp, TrendingDown, AlertCircle, CheckCircle2,
  Activity, BarChart3, Shield, FileWarning, Users, Award,
  RefreshCw, CircleDollarSign, BadgeDollarSign, ArrowUpRight, ArrowDownRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useQueryClient } from "@tanstack/react-query"

/* ─── API types ───────────────────────────────────────────────────── */
interface FinancialSummary {
  totalEncounters: number; approvedCount: number; deniedCount: number
  pendingCount: number; approvalRate: number; denialRate: number
  totalRevenue: number; avgPerEncounter: number; projectedMonthly: number
  periodDays: number
}
interface ROIReport {
  totalEncounters: number; totalRevenue: number; revenuePerEncounter: number
  denialRate: number; deniedRevenueLost: number; hccCaptureRate: number
  estimatedHCCUplift: number; netRevenueWithHCC: number; roi90Days: number
}
interface GrowthMetrics {
  clinicId: string; clinicName?: string; ltv: number; cac: number
  ltvCacRatio: number; revenuePerPatient: number; monthlyRecurring: number
  paybackMonths: number; grade: "A" | "B" | "C" | "D"
}
interface SystemGrowth {
  totalPatients: number; totalRevenue: number; avgLtvCacRatio: number
  topGrade: string; clinicMetrics: GrowthMetrics[]
}
interface HCCCapture {
  keyword: string; icd10: string; code: string; description: string
  riskScore: number; category: string; estimatedUplift: number
}
interface HCCResult {
  detected: HCCCapture[]; totalRiskScore: number
  totalEstimatedUplift: number; captureCount: number
}
interface ClaimResult {
  approved: boolean; issues: string[]; recommendation: string
  hcc: { captureCount: number; totalEstimatedUplift: number }
  scrub?: { valid: boolean; issues: string[]; warnings: string[] }
}
interface PreSubmissionResult {
  goodClaim: ClaimResult
  badClaim?: ClaimResult
}

/* ─── Helpers ─────────────────────────────────────────────────────── */
function fmt$(n: number) { return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` }
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

function GradeChip({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    A: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    B: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    C: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    D: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  }
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${colors[grade] ?? colors.D}`}>
      {grade}
    </span>
  )
}

function MetricCard({ label, value, sub, icon: Icon, trend, color }: {
  label: string; value: string; sub?: string
  icon: React.ElementType; trend?: "up" | "down" | "neutral"; color?: string
}) {
  return (
    <Card data-testid={`card-metric-${label.replace(/\s+/g, "-").toLowerCase()}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color ? "bg-opacity-10" : "bg-muted"}`}>
            <Icon className={`h-5 w-5 ${color ?? "text-muted-foreground"}`} />
          </div>
        </div>
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-muted-foreground"}`}>
            {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : trend === "down" ? <ArrowDownRight className="h-3 w-3" /> : null}
            {trend === "up" ? "Positive" : trend === "down" ? "Needs attention" : "Stable"}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default function BillingIntelligencePage() {
  const qc = useQueryClient()

  const { data: finance, isLoading: financeLoading } = useQuery<FinancialSummary>({
    queryKey: ["/api/observability/finance/demo"],
    queryFn: () => fetch("/api/observability/finance/demo").then(r => r.json()),
    refetchInterval: 60000,
  })

  const { data: roi, isLoading: roiLoading } = useQuery<ROIReport>({
    queryKey: ["/api/observability/roi/demo"],
    queryFn: () => fetch("/api/observability/roi/demo").then(r => r.json()),
    refetchInterval: 60000,
  })

  const { data: growth, isLoading: growthLoading } = useQuery<SystemGrowth>({
    queryKey: ["/api/observability/growth/system/demo"],
    queryFn: () => fetch("/api/observability/growth/system/demo").then(r => r.json()),
    refetchInterval: 60000,
  })

  const { data: hcc, isLoading: hccLoading } = useQuery<HCCResult>({
    queryKey: ["/api/billing-optimization/hcc/demo"],
    queryFn: () => fetch("/api/billing-optimization/hcc/demo").then(r => r.json()),
    refetchInterval: 60000,
  })

  const { data: presub, isLoading: presubLoading } = useQuery<PreSubmissionResult>({
    queryKey: ["/api/billing-optimization/pre-submit/demo"],
    queryFn: () => fetch("/api/billing-optimization/pre-submit/demo").then(r => r.json()),
    refetchInterval: 60000,
  })

  function refresh() {
    qc.invalidateQueries({ queryKey: ["/api/observability/finance/demo"] })
    qc.invalidateQueries({ queryKey: ["/api/observability/roi/demo"] })
    qc.invalidateQueries({ queryKey: ["/api/observability/growth/system/demo"] })
    qc.invalidateQueries({ queryKey: ["/api/billing-optimization/hcc/demo"] })
    qc.invalidateQueries({ queryKey: ["/api/billing-optimization/pre-submit/demo"] })
  }

  const loading = financeLoading || roiLoading || growthLoading || hccLoading || presubLoading

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto" data-testid="billing-intelligence-page">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Billing Intelligence</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Revenue optimization • HCC capture • Denial prevention • Clinic-level ROI
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* ── Section 1: Financial Overview ───────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Financial Overview
        </h2>
        {financeLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : finance ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Revenue" value={fmt$(finance.totalRevenue)}
              sub={`${finance.periodDays}d period`} icon={DollarSign} color="text-green-600" trend="up" />
            <MetricCard label="Projected Monthly" value={fmt$(finance.projectedMonthly)}
              sub="annualized run rate" icon={TrendingUp} color="text-blue-600" trend="up" />
            <MetricCard label="Approval Rate" value={fmtPct(finance.approvalRate)}
              sub={`${finance.approvedCount} of ${finance.totalEncounters} claims`}
              icon={CheckCircle2} color="text-emerald-600" trend="up" />
            <MetricCard label="Denial Rate" value={fmtPct(finance.denialRate)}
              sub={`${finance.deniedCount} denied claims`}
              icon={AlertCircle} color={finance.denialRate > 10 ? "text-red-600" : "text-yellow-600"}
              trend={finance.denialRate > 10 ? "down" : "neutral"} />
          </div>
        ) : null}
      </section>

      {/* ── Section 2: HCC Capture Opportunities ────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          HCC Risk Adjustment Capture
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <MetricCard label="Detected HCC Conditions" value={hcc ? String(hcc.captureCount) : "—"}
            sub="from symptom + history scan" icon={Activity} color="text-violet-600" trend="up" />
          <MetricCard label="RAF Risk Score" value={hcc ? hcc.totalRiskScore.toFixed(3) : "—"}
            sub="CMS-HCC V28 risk weight" icon={BarChart3} color="text-indigo-600" />
          <MetricCard label="Estimated Uplift / Patient" value={hcc ? fmt$(hcc.totalEstimatedUplift) : "—"}
            sub="annual value-based care revenue" icon={BadgeDollarSign} color="text-amber-600" trend="up" />
        </div>

        {hccLoading ? <Skeleton className="h-48" /> : hcc && hcc.detected.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Captured HCC Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {hcc.detected.map((h) => (
                  <div key={h.code} className="flex items-center justify-between py-3" data-testid={`row-hcc-${h.code}`}>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">{h.code}</Badge>
                        <span className="text-sm font-medium">{h.description}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        ICD-10 {h.icd10} · {h.category} · RAF {h.riskScore.toFixed(3)} · Trigger: "{h.keyword}"
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">+{fmt$(h.estimatedUplift)}</p>
                      <p className="text-xs text-muted-foreground">est. annual uplift</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total risk-adjusted uplift</span>
                <span className="text-lg font-bold text-green-600" data-testid="text-total-uplift">
                  +{fmt$(hcc.totalEstimatedUplift)} / patient / year
                </span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">No HCC conditions detected in demo data</CardContent></Card>
        )}
      </section>

      {/* ── Section 3: ROI Engine ────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Clinic ROI Engine
        </h2>
        {roiLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : roi ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <MetricCard label="Net Revenue (HCC-adjusted)" value={fmt$(roi.netRevenueWithHCC)}
              sub={`+${fmt$(roi.estimatedHCCUplift)} HCC uplift`} icon={CircleDollarSign} color="text-green-600" trend="up" />
            <MetricCard label="Revenue Lost to Denials" value={fmt$(roi.deniedRevenueLost)}
              sub={`${roi.denialRate.toFixed(1)}% denial rate`}
              icon={TrendingDown} color="text-red-600" trend="down" />
            <MetricCard label="90-Day ROI Projection" value={fmt$(roi.roi90Days)}
              sub="HCC-adjusted 90-day revenue" icon={TrendingUp} color="text-blue-600" trend="up" />
          </div>
        ) : null}
      </section>

      {/* ── Section 4: Pre-Submission Check ─────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Pre-Submission Billing Gate
        </h2>
        {presubLoading ? <Skeleton className="h-40" /> : presub?.goodClaim ? (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                {presub.goodClaim.approved ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-red-600" />
                )}
                <div>
                  <p className="font-semibold" data-testid="text-presub-status">
                    {presub.goodClaim.approved ? "Claim Approved for Submission" : "Claim Blocked — Issues Found"}
                  </p>
                  <p className="text-sm text-muted-foreground">{presub.goodClaim.recommendation}</p>
                </div>
                <Badge className="ml-auto" variant={presub.goodClaim.approved ? "default" : "destructive"} data-testid="badge-presub-verdict">
                  {presub.goodClaim.approved ? "APPROVED" : "REJECTED"}
                </Badge>
              </div>
              {presub.goodClaim.issues.length > 0 && (
                <div className="space-y-1">
                  {presub.goodClaim.issues.map((issue, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-red-600">
                      <FileWarning className="h-3 w-3 flex-shrink-0" />
                      {issue}
                    </div>
                  ))}
                </div>
              )}
              {presub.goodClaim.hcc?.captureCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 dark:bg-green-950 rounded px-3 py-2">
                  <Award className="h-4 w-4" />
                  HCC opportunity detected: {presub.goodClaim.hcc.captureCount} condition(s) → +{fmt$(presub.goodClaim.hcc.totalEstimatedUplift)} uplift
                </div>
              )}
              {presub.badClaim && !presub.badClaim.approved && (
                <div className="mt-2 pt-3 border-t">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Denial Prevention — Issues Detected in Rejected Claim</p>
                  <div className="space-y-1">
                    {presub.badClaim.issues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-red-600">
                        <FileWarning className="h-3 w-3 flex-shrink-0" />
                        {issue}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* ── Section 5: Clinic LTV / CAC Growth Metrics ──────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Clinic LTV / CAC Growth Metrics
        </h2>

        {growthLoading ? <Skeleton className="h-56" /> : growth ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <MetricCard label="Total Patients" value={growth.totalPatients.toLocaleString()}
                sub="across all clinics" icon={Users} />
              <MetricCard label="System Revenue" value={fmt$(growth.totalRevenue)}
                sub="total from all clinics" icon={DollarSign} color="text-green-600" />
              <MetricCard label="Avg LTV/CAC Ratio" value={growth.avgLtvCacRatio.toFixed(2) + "×"}
                sub={`Top grade: ${growth.topGrade}`} icon={TrendingUp}
                color={growth.avgLtvCacRatio >= 3 ? "text-green-600" : growth.avgLtvCacRatio >= 2 ? "text-blue-600" : "text-yellow-600"} />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Per-Clinic ROI Dashboard</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4">Clinic</th>
                        <th className="text-right py-2 pr-4">Patients</th>
                        <th className="text-right py-2 pr-4">LTV</th>
                        <th className="text-right py-2 pr-4">CAC</th>
                        <th className="text-right py-2 pr-4">LTV/CAC</th>
                        <th className="text-right py-2 pr-4">Monthly Revenue</th>
                        <th className="text-right py-2 pr-4">Payback</th>
                        <th className="text-center py-2">Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {growth.clinicMetrics.map((m) => (
                        <tr key={m.clinicId} data-testid={`row-clinic-${m.clinicId}`} className="hover:bg-muted/40">
                          <td className="py-3 pr-4 font-medium">{m.clinicName ?? m.clinicId}</td>
                          <td className="py-3 pr-4 text-right">{m.revenuePerPatient > 0 ? Math.round(m.ltv / Math.max(m.revenuePerPatient, 1)) : "—"}</td>
                          <td className="py-3 pr-4 text-right">{fmt$(m.ltv)}</td>
                          <td className="py-3 pr-4 text-right">{fmt$(m.cac)}</td>
                          <td className="py-3 pr-4 text-right font-semibold">{m.ltvCacRatio.toFixed(2)}×</td>
                          <td className="py-3 pr-4 text-right">{fmt$(m.monthlyRecurring)}</td>
                          <td className="py-3 pr-4 text-right">{m.paybackMonths.toFixed(1)} mo</td>
                          <td className="py-3 text-center"><GradeChip grade={m.grade} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </section>

      {/* ── Section 6: Prior Auth Detection ─────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Prior Authorization & Modifier Intelligence
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-600" />
                <span className="font-semibold text-sm">Prior Auth Engine</span>
                <Badge variant="outline" className="ml-auto text-xs">Active</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Checks 8 procedure categories + 24 CPT codes including MRI, CT, PET, orthopedic,
                spine surgery, cardiac intervention, biologics, bariatric, and sleep study.
                Emergency exception bypass included.
              </p>
              <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mt-1">
                Coverage: 8 procedure types · 24 CPT codes · Emergency bypass
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2">
                <FileWarning className="h-5 w-5 text-rose-600" />
                <span className="font-semibold text-sm">Modifier Validation</span>
                <Badge variant="outline" className="ml-auto text-xs">Active</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Validates Modifier 25 (separate E/M service), Modifier 59 (distinct procedure),
                and Modifier 51 (multiple procedures) against documentation requirements and
                audit risk thresholds.
              </p>
              <div className="text-xs font-medium text-rose-700 dark:text-rose-400 mt-1">
                Modifiers: 25 · 59 · 51 · High-risk flagging · Audit risk rating
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

    </div>
  )
}

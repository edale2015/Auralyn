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
import { Activity, ShieldCheck, Cpu, Pill, Database, Radio, RefreshCw, BookOpen, GitBranch, Lock, FileCheck, Merge, Stethoscope, ScrollText, LogIn, Building2, Send, BarChart3, CreditCard, BrainCircuit, KeyRound, Snowflake, FlaskConical, GitMerge, HeartPulse, Baby, Heart, Brain, FileText, ClipboardCheck, ShieldAlert, UserCheck, Scale, Zap, Filter, CircuitBoard, TrendingDown, Layers, Cpu as CpuIcon, ListTodo, Globe, Gauge, HardDrive, Timer, Workflow, AlertTriangle, Search, Bell, BellOff, MessageSquare, Stethoscope as Scope2, DollarSign, TrendingUp, LineChart, BookMarked, GitFork, Dna, Receipt, FileWarning, Clipboard, PackageCheck } from "lucide-react"

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
  // ── Physician Governance & Safe Learning Layer (7 new) ──────────────────────
  physicianReview:       { icon: UserCheck,    color: "text-sky-700",     bg: "bg-sky-50 dark:bg-sky-950" },
  liabilityTracking:     { icon: Scale,        color: "text-slate-600",   bg: "bg-slate-50 dark:bg-slate-950" },
  biasAwareRLHF:         { icon: Zap,          color: "text-yellow-600",  bg: "bg-yellow-50 dark:bg-yellow-950" },
  confirmationBiasGuard: { icon: Filter,       color: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-950" },
  driftCircuitBreaker:   { icon: CircuitBoard, color: "text-red-600",     bg: "bg-red-50 dark:bg-red-950" },
  escalationGuard:       { icon: TrendingDown, color: "text-orange-600",  bg: "bg-orange-50 dark:bg-orange-950" },
  safeLearningPipeline:  { icon: Layers,       color: "text-teal-700",    bg: "bg-teal-50 dark:bg-teal-950" },
  // ── Scalability & Infrastructure Layer (8 new) ──────────────────────────────
  asyncLLM:              { icon: CpuIcon,      color: "text-cyan-700",    bg: "bg-cyan-50 dark:bg-cyan-950" },
  asyncAuditQueue:       { icon: ListTodo,     color: "text-lime-700",    bg: "bg-lime-50 dark:bg-lime-950" },
  rlhfBatchQueue:        { icon: Database,     color: "text-purple-500",  bg: "bg-purple-50 dark:bg-purple-950" },
  regionRouter:          { icon: Globe,        color: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-950" },
  rateLimiter:           { icon: Gauge,        color: "text-rose-500",    bg: "bg-rose-50 dark:bg-rose-950" },
  cacheLayer:            { icon: HardDrive,    color: "text-amber-500",   bg: "bg-amber-50 dark:bg-amber-950" },
  performanceGuard:      { icon: Timer,        color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950" },
  safeAsyncPipeline:     { icon: Workflow,     color: "text-violet-700",  bg: "bg-violet-50 dark:bg-violet-950" },
  // ── Tier 6: Observability, UX & Business Intelligence ──────────────────────
  incidentControl:       { icon: AlertTriangle,color: "text-red-600",     bg: "bg-red-50 dark:bg-red-950" },
  distributedTracing:    { icon: Search,       color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950" },
  systemAlerts:          { icon: Bell,         color: "text-yellow-600",  bg: "bg-yellow-50 dark:bg-yellow-950" },
  alertFatigue:          { icon: BellOff,      color: "text-slate-600",   bg: "bg-slate-50 dark:bg-slate-950" },
  physicianSummary:      { icon: MessageSquare,color: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-950" },
  patientExplanation:    { icon: BookMarked,   color: "text-teal-600",    bg: "bg-teal-50 dark:bg-teal-950" },
  financeEngine:         { icon: DollarSign,   color: "text-green-600",   bg: "bg-green-50 dark:bg-green-950" },
  roiEngine:             { icon: TrendingUp,   color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-950" },
  growthMetrics:         { icon: LineChart,    color: "text-lime-700",    bg: "bg-lime-50 dark:bg-lime-950" },
  // ── Tier 7: Knowledge Representation & Hybrid Reasoning ─────────────────────
  diagnosisOntology:     { icon: Dna,          color: "text-fuchsia-700", bg: "bg-fuchsia-50 dark:bg-fuchsia-950" },
  hybridReasoning:       { icon: GitFork,      color: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-950" },
  // ── Tier 8: Advanced Billing Optimization ────────────────────────────────────
  hccCapture:            { icon: BarChart3,    color: "text-amber-700",   bg: "bg-amber-50 dark:bg-amber-950" },
  priorAuthEngine:       { icon: Clipboard,    color: "text-orange-600",  bg: "bg-orange-50 dark:bg-orange-950" },
  modifierEngine:        { icon: FileWarning,  color: "text-rose-600",    bg: "bg-rose-50 dark:bg-rose-950" },
  preSubmissionPipeline: { icon: PackageCheck, color: "text-cyan-700",    bg: "bg-cyan-50 dark:bg-cyan-950" },
  // ── Final Layer
  nlpIntake:             { icon: FileText,     color: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-950" },
  versionedRLHF:         { icon: GitMerge,     color: "text-blue-700",    bg: "bg-blue-50 dark:bg-blue-950" },
  fdaCompliance:         { icon: ShieldCheck,  color: "text-green-700",   bg: "bg-green-50 dark:bg-green-950" },
  prospectiveStudy:      { icon: FlaskConical, color: "text-teal-700",    bg: "bg-teal-50 dark:bg-teal-950" },
  biasAnalysis:          { icon: Scale,        color: "text-orange-600",  bg: "bg-orange-50 dark:bg-orange-950" },
  securityLogging:       { icon: ShieldAlert,  color: "text-red-600",     bg: "bg-red-50 dark:bg-red-950" },
  humanFactors:          { icon: UserCheck,    color: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-950" },
  finalPipeline:         { icon: Workflow,     color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-950" },
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
  // Governance fields
  total?: number
  overrides?: number
  overrideRate?: number
  critical?: number
  high?: number
  updates?: number
  avgDelta?: number
  checked?: number
  flagged?: number
  flagRate?: number
  locked?: boolean
  lockReason?: string
  historyCount?: number
  erRate?: number
  erCount?: number
  threshold?: number
  totalRuns?: number
  updateCount?: number
  blockCount?: number
  updateRate?: number
  // Scalability fields
  complete?: number
  failed?: number
  avgDurationMs?: number
  queued?: number
  processing?: number
  processedCount?: number
  supportedRegions?: number
  regions?: string[]
  maxConcurrent?: number
  currentConcurrent?: number
  perIpMax?: number
  trackedIps?: number
  size?: number
  activeEntries?: number
  hitRate?: number
  totalHits?: number
  totalMisses?: number
  timeoutCount?: number
  timeoutRate?: number
  defaultTimeoutMs?: number
  asyncPaths?: string[]
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
  // Governance
  if (key === "physicianReview")       return layer.active ? "success" : "warning"
  if (key === "liabilityTracking")     return layer.active ? "success" : "warning"
  if (key === "biasAwareRLHF")         return layer.active ? "success" : "warning"
  if (key === "confirmationBiasGuard") return layer.active ? "success" : "warning"
  if (key === "driftCircuitBreaker")   return layer.locked ? "warning" : "success"
  if (key === "escalationGuard")       return layer.active ? "success" : "warning"
  if (key === "safeLearningPipeline")  return layer.active ? "success" : "warning"
  // Scalability
  if (key === "asyncLLM")              return layer.active ? "success" : "warning"
  if (key === "asyncAuditQueue")       return layer.active ? "success" : "warning"
  if (key === "rlhfBatchQueue")        return layer.active ? "success" : "warning"
  if (key === "regionRouter")          return layer.active ? "success" : "info"
  if (key === "rateLimiter")           return layer.active ? "success" : "warning"
  if (key === "cacheLayer")            return layer.active ? "success" : "info"
  if (key === "performanceGuard")      return layer.active ? "success" : "warning"
  if (key === "safeAsyncPipeline")     return layer.active ? "success" : "warning"
  // Tier 6
  if (key === "incidentControl")       return layer.active ? "success" : "warning"
  if (key === "distributedTracing")    return layer.active ? "success" : "warning"
  if (key === "systemAlerts")          return layer.active ? "success" : "warning"
  if (key === "alertFatigue")          return layer.active ? "success" : "warning"
  if (key === "physicianSummary")      return layer.active ? "success" : "warning"
  if (key === "patientExplanation")    return layer.active ? "success" : "warning"
  if (key === "financeEngine")         return layer.active ? "success" : "warning"
  if (key === "roiEngine")             return layer.active ? "success" : "warning"
  if (key === "growthMetrics")         return layer.active ? "success" : "warning"
  // Tier 7
  if (key === "diagnosisOntology")     return layer.active ? "success" : "warning"
  if (key === "hybridReasoning")       return layer.active ? "success" : "warning"
  // Tier 8
  if (key === "hccCapture")            return layer.active ? "success" : "warning"
  if (key === "priorAuthEngine")       return layer.active ? "success" : "warning"
  if (key === "modifierEngine")        return layer.active ? "success" : "warning"
  if (key === "preSubmissionPipeline") return layer.active ? "success" : "warning"
  // Final Layer
  if (key === "nlpIntake")             return layer.active ? "success" : "warning"
  if (key === "versionedRLHF")         return layer.active ? "success" : "warning"
  if (key === "fdaCompliance")         return (layer as any).readinessLevel === "green" ? "success" : (layer as any).readinessLevel === "yellow" ? "warning" : "error"
  if (key === "prospectiveStudy")      return layer.active ? "success" : "warning"
  if (key === "biasAnalysis")          return layer.active ? "success" : "warning"
  if (key === "securityLogging")       return layer.active ? "success" : "warning"
  if (key === "humanFactors")          return layer.active ? "success" : "warning"
  if (key === "finalPipeline")         return layer.active ? "success" : "warning"
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
  // Governance
  if (key === "physicianReview")       return layer.active ? `${layer.total ?? 0} reviews` : "Inactive"
  if (key === "liabilityTracking")     return layer.active ? `${layer.critical ?? 0} critical` : "Inactive"
  if (key === "biasAwareRLHF")         return layer.active ? `${layer.updates ?? 0} updates` : "Inactive"
  if (key === "confirmationBiasGuard") return layer.active ? `${layer.checked ?? 0} checked` : "Inactive"
  if (key === "driftCircuitBreaker")   return layer.locked ? "LOCKED" : "Unlocked"
  if (key === "escalationGuard")       return layer.active ? `${((layer.erRate ?? 0) * 100).toFixed(0)}% ER rate` : "Inactive"
  if (key === "safeLearningPipeline")  return layer.active ? `${layer.totalRuns ?? 0} runs` : "Inactive"
  // Scalability
  if (key === "asyncLLM")              return layer.active ? `${layer.complete ?? 0} completed` : "Inactive"
  if (key === "asyncAuditQueue")       return layer.active ? `${layer.processedCount ?? 0} stored` : "Inactive"
  if (key === "rlhfBatchQueue")        return layer.active ? `${layer.processed ?? 0} processed` : "Inactive"
  if (key === "regionRouter")          return layer.active ? `${layer.supportedRegions ?? 5} regions` : "Inactive"
  if (key === "rateLimiter")           return layer.active ? `${layer.maxConcurrent ?? 200} max` : "Inactive"
  if (key === "cacheLayer")            return layer.active ? `${layer.hitRate ?? 0}% hit rate` : "Inactive"
  if (key === "performanceGuard")      return layer.active ? `${layer.defaultTimeoutMs ?? 2000}ms timeout` : "Inactive"
  if (key === "safeAsyncPipeline")     return layer.active ? `${layer.stages ?? 3} async paths` : "Inactive"
  // Tier 6
  if (key === "incidentControl")       return layer.active ? `${(layer as any).open ?? 0} open` : "Inactive"
  if (key === "distributedTracing")    return layer.active ? `${(layer as any).buffered ?? 0} traces` : "Inactive"
  if (key === "systemAlerts")          return layer.active ? `${(layer as any).total ?? 0} fired` : "Inactive"
  if (key === "alertFatigue")          return layer.active ? `${(layer as any).suppressRate ?? 0}% suppressed` : "Inactive"
  if (key === "physicianSummary")      return layer.active ? "1-line output" : "Inactive"
  if (key === "patientExplanation")    return layer.active ? `${(layer as any).urgencyLevels ?? 4} urgency levels` : "Inactive"
  if (key === "financeEngine")         return layer.active ? `$${(layer as any).demoAvgRevenuePerEncounter ?? 0}/enc` : "Inactive"
  if (key === "roiEngine")             return layer.active ? `$${(layer as any).hccUpliftPerPatient ?? 320}/pt HCC` : "Inactive"
  if (key === "growthMetrics")         return layer.active ? `LTV/CAC ≥${(layer as any).ltvCacThreshold ?? 3}` : "Inactive"
  // Tier 7
  if (key === "diagnosisOntology")     return layer.active ? `${(layer as any).conceptCount ?? 15} concepts` : "Inactive"
  if (key === "hybridReasoning")       return layer.active ? `${(layer as any).fusionPatterns ?? 4} patterns` : "Inactive"
  // Tier 8
  if (key === "hccCapture")            return layer.active ? `${(layer as any).uniqueHCCCodes ?? 6} HCC codes` : "Inactive"
  if (key === "priorAuthEngine")       return layer.active ? `${(layer as any).coveredProcedures ?? 8} procedures` : "Inactive"
  if (key === "modifierEngine")        return layer.active ? `Mod 25/59/51` : "Inactive"
  if (key === "preSubmissionPipeline") return layer.active ? `${(layer as any).stages ?? 4} gate checks` : "Inactive"
  // Final Layer
  if (key === "nlpIntake")             return layer.active ? `${(layer as any).keywordRules ?? 15} ICD rules` : "Inactive"
  if (key === "versionedRLHF")         return layer.active ? `${(layer as any).approvedVersions ?? 0} versions` : "Inactive"
  if (key === "fdaCompliance")         return `Score ${(layer as any).readinessScore ?? 80}% • ${(layer as any).openGaps ?? 0} gaps`
  if (key === "prospectiveStudy")      return layer.active ? `${(layer as any).totalStudies ?? 0} studies` : "Inactive"
  if (key === "biasAnalysis")          return layer.active ? `${(layer as any).supportedAxes?.length ?? 4} axes` : "Inactive"
  if (key === "securityLogging")       return layer.active ? `${(layer as any).eventTypes ?? 11} event types` : "Inactive"
  if (key === "humanFactors")          return layer.active ? `${(layer as any).trackedActionTypes ?? 12} actions` : "Inactive"
  if (key === "finalPipeline")         return layer.active ? `${(layer as any).stages ?? 7} stages` : "Inactive"
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

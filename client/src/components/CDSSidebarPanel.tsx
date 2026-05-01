/**
 * CDSSidebarPanel.tsx
 * Drop into: client/src/components/CDSSidebarPanel.tsx
 *
 * A right-side Sheet slide-over triggered by a fixed floating button.
 * Calls POST /api/telemed/analyze with the current case context and displays:
 *   - Safety alerts (critical / urgent / warning)
 *   - Differential diagnoses with confidence bars
 *   - Medication alerts and suggestions
 *   - ICD-10 / CPT codes
 *   - Return precautions
 *
 * READ-ONLY display panel — no actions, no approvals, no audit events.
 * All clinical decisions remain with the physician in the review card below.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Activity,
  Pill,
  Code2,
  ArrowRight,
  RefreshCw,
  Stethoscope,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SafetyAlert {
  severity: "critical" | "urgent" | "warning";
  category: string;
  message: string;
  recommendation: string;
}

interface DifferentialItem {
  rank: number;
  diagnosis: string;
  confidence: number;
  keyFeatures: string[];
  rulingIn: string[];
  rulingOut: string[];
  urgency: "routine" | "urgent" | "emergent";
}

interface MedicationSuggestion {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  indication: string;
  category: "first-line" | "alternative" | "adjunct" | "avoid";
  caveat?: string;
}

interface MedicationAlert {
  severity: "critical" | "major" | "moderate" | "minor";
  type: string;
  medication: string;
  concern: string;
  recommendation: string;
}

interface ReturnPrecautions {
  immediateReturn: string[];
  warningSymptoms: string[];
  expectedCourse: string;
  followupRecommendation: string;
}

interface CDSResponse {
  ok: boolean;
  safetyAlerts: SafetyAlert[];
  differential: DifferentialItem[];
  medicationSuggestions: MedicationSuggestion[];
  medicationAlerts: MedicationAlert[];
  codes: { icd10: string[]; cpt: string[] };
  returnPrecautions: ReturnPrecautions;
}

interface CDSSidebarPanelProps {
  caseId: string | number;
  complaint?: string;
  disposition?: string;
  caseDoc?: { _ont?: { returnPrecautionsKey?: string } };
  patientMedications?: string[];
  allergies?: string[];
  conditions?: string[];
}

// ─── Severity color helpers ───────────────────────────────────────────────────

function alertSeverityClass(severity: string) {
  switch (severity) {
    case "critical": return "bg-red-50 border-red-300 text-red-800";
    case "urgent":   return "bg-orange-50 border-orange-300 text-orange-800";
    case "warning":  return "bg-yellow-50 border-yellow-300 text-yellow-800";
    case "major":    return "bg-red-50 border-red-300 text-red-800";
    case "moderate": return "bg-orange-50 border-orange-300 text-orange-800";
    case "minor":    return "bg-yellow-50 border-yellow-300 text-yellow-800";
    default:         return "bg-gray-50 border-gray-300 text-gray-800";
  }
}

function alertBadgeClass(severity: string) {
  switch (severity) {
    case "critical": return "bg-red-600 text-white";
    case "urgent":   return "bg-orange-500 text-white";
    case "major":    return "bg-red-600 text-white";
    case "moderate": return "bg-orange-500 text-white";
    case "warning":
    case "minor":    return "bg-yellow-500 text-white";
    default:         return "bg-gray-500 text-white";
  }
}

function urgencyBadgeClass(urgency: string) {
  switch (urgency) {
    case "emergent": return "bg-red-600 text-white";
    case "urgent":   return "bg-orange-500 text-white";
    default:         return "bg-green-600 text-white";
  }
}

function medicationCategoryClass(category: string) {
  switch (category) {
    case "first-line":  return "bg-green-100 text-green-800 border-green-300";
    case "alternative": return "bg-blue-100 text-blue-800 border-blue-300";
    case "adjunct":     return "bg-purple-100 text-purple-800 border-purple-300";
    case "avoid":       return "bg-red-100 text-red-800 border-red-300";
    default:            return "bg-gray-100 text-gray-800 border-gray-300";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 70 ? "bg-green-500" :
    pct >= 40 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{pct}%</span>
    </div>
  );
}

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-gray-500">{icon}</span>
      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</span>
      {count !== undefined && (
        <Badge variant="outline" className="text-xs ml-auto">{count}</Badge>
      )}
    </div>
  );
}

function ExpandableItem({ children, summary }: { children: React.ReactNode; summary: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-center justify-between gap-1 py-0.5"
      >
        <span className="flex-1">{summary}</span>
        {open
          ? <ChevronUp className="h-3 w-3 text-gray-400 shrink-0" />
          : <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
        }
      </button>
      {open && <div className="mt-1 pl-1">{children}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CDSSidebarPanel({
  caseId,
  complaint,
  disposition,
  caseDoc,
  patientMedications = [],
  allergies = [],
  conditions = [],
}: CDSSidebarPanelProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CDSResponse | null>(null);

  const translatedDisposition = caseDoc?._ont?.returnPrecautionsKey ?? "Home Care";

  // ── API call ────────────────────────────────────────────────────────────────
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest<CDSResponse>(
        "POST",
        "/api/telemed/analyze",
        {
          caseId:             String(caseId),
          complaint,
          disposition:        translatedDisposition,
          patientMedications,
          allergies,
          conditions,
        }
      );
      return res;
    },
    onSuccess: (res) => {
      if (res.ok) setData(res);
    },
  });

  // Open sheet + fetch if not yet loaded
  const handleOpen = () => {
    setOpen(true);
    if (!data && !analyzeMutation.isPending) {
      analyzeMutation.mutate();
    }
  };

  const handleRefresh = () => {
    analyzeMutation.mutate();
  };

  // Critical/urgent alert count for floating button badge
  const criticalCount = data?.safetyAlerts?.filter(
    a => a.severity === "critical" || a.severity === "urgent"
  ).length ?? 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating trigger button ── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {criticalCount > 0 && !open && (
          <div className="bg-red-600 text-white text-xs font-bold rounded-full px-2 py-0.5 animate-pulse">
            {criticalCount} alert{criticalCount > 1 ? "s" : ""}
          </div>
        )}
        <Button
          onClick={handleOpen}
          className="rounded-full h-12 w-12 shadow-lg bg-blue-600 hover:bg-blue-700 text-white p-0"
          title="Open Clinical Decision Support"
          data-testid="btn-cds-open"
        >
          <Stethoscope className="h-5 w-5" />
        </Button>
      </div>

      {/* ── Slide-over sheet ── */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[420px] overflow-y-auto p-0"
          data-testid="panel-cds-sidebar"
        >
          {/* Header */}
          <SheetHeader className="px-4 pt-4 pb-3 border-b sticky top-0 bg-white z-10">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-sm font-semibold text-gray-900">
                  Clinical Decision Support
                </SheetTitle>
                <SheetDescription className="text-xs text-gray-500 mt-0.5">
                  {complaint
                    ? complaint.replace(/_/g, " ")
                    : "Current case"}{" "}
                  · {translatedDisposition}
                </SheetDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefresh}
                disabled={analyzeMutation.isPending}
                className="h-7 w-7 p-0"
                title="Refresh analysis"
                data-testid="btn-cds-refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${analyzeMutation.isPending ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              For clinical decision support only. Physician judgment governs all care decisions.
            </p>
          </SheetHeader>

          <div className="px-4 py-3 space-y-5">

            {/* ── Loading ── */}
            {analyzeMutation.isPending && (
              <div className="space-y-3 animate-pulse pt-2">
                {[1, 0.7, 0.85, 0.6, 0.9].map((w, i) => (
                  <div key={i} className="h-3 bg-gray-100 rounded" style={{ width: `${w * 100}%` }} />
                ))}
                <div className="h-16 bg-gray-100 rounded mt-4" />
                <div className="h-16 bg-gray-100 rounded" />
              </div>
            )}

            {/* ── Error ── */}
            {analyzeMutation.isError && (
              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-3">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Analysis failed.{" "}
                  <button onClick={handleRefresh} className="underline font-medium">
                    Retry
                  </button>
                </span>
              </div>
            )}

            {/* ── Data ── */}
            {data && !analyzeMutation.isPending && (
              <>
                {/* 1. Safety Alerts */}
                {data.safetyAlerts?.length > 0 && (
                  <section data-testid="section-safety-alerts">
                    <SectionHeader
                      icon={<AlertTriangle className="h-3.5 w-3.5" />}
                      title="Safety Alerts"
                      count={data.safetyAlerts.length}
                    />
                    <div className="space-y-2">
                      {data.safetyAlerts.map((alert, i) => (
                        <div
                          key={i}
                          className={`border rounded p-2.5 text-xs ${alertSeverityClass(alert.severity)}`}
                          data-testid={`alert-safety-${i}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Badge className={`text-[10px] px-1.5 py-0 ${alertBadgeClass(alert.severity)}`}>
                              {alert.severity.toUpperCase()}
                            </Badge>
                            <span className="font-medium">{alert.message}</span>
                          </div>
                          <p className="text-xs opacity-80 flex items-start gap-1">
                            <ArrowRight className="h-3 w-3 shrink-0 mt-0.5" />
                            {alert.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                    <Separator className="mt-4" />
                  </section>
                )}

                {/* 2. Differential Diagnoses */}
                {data.differential?.length > 0 && (
                  <section data-testid="section-differential">
                    <SectionHeader
                      icon={<Activity className="h-3.5 w-3.5" />}
                      title="Differential Diagnoses"
                      count={data.differential.length}
                    />
                    <div className="space-y-2">
                      {data.differential.map((dx, i) => (
                        <ExpandableItem
                          key={i}
                          summary={
                            <div className="w-full" data-testid={`dx-item-${i}`}>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-medium text-gray-800">
                                  {dx.rank}. {dx.diagnosis}
                                </span>
                                <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${urgencyBadgeClass(dx.urgency)}`}>
                                  {dx.urgency}
                                </Badge>
                              </div>
                              <ConfidenceBar value={dx.confidence} />
                            </div>
                          }
                        >
                          <div className="text-xs text-gray-600 space-y-1.5 mt-1.5 pl-1 border-l-2 border-gray-200">
                            {dx.keyFeatures?.length > 0 && (
                              <div>
                                <span className="font-medium text-gray-700">Key features: </span>
                                {dx.keyFeatures.join(", ")}
                              </div>
                            )}
                            {dx.rulingIn?.length > 0 && (
                              <div>
                                <span className="font-medium text-green-700">Ruling in: </span>
                                {dx.rulingIn.join(", ")}
                              </div>
                            )}
                            {dx.rulingOut?.length > 0 && (
                              <div>
                                <span className="font-medium text-red-700">Ruling out: </span>
                                {dx.rulingOut.join(", ")}
                              </div>
                            )}
                          </div>
                        </ExpandableItem>
                      ))}
                    </div>
                    <Separator className="mt-4" />
                  </section>
                )}

                {/* 3. Medication Alerts */}
                {data.medicationAlerts?.length > 0 && (
                  <section data-testid="section-med-alerts">
                    <SectionHeader
                      icon={<Pill className="h-3.5 w-3.5" />}
                      title="Medication Alerts"
                      count={data.medicationAlerts.length}
                    />
                    <div className="space-y-2">
                      {data.medicationAlerts.map((alert, i) => (
                        <div
                          key={i}
                          className={`border rounded p-2.5 text-xs ${alertSeverityClass(alert.severity)}`}
                          data-testid={`alert-med-${i}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Badge className={`text-[10px] px-1.5 py-0 ${alertBadgeClass(alert.severity)}`}>
                              {alert.severity.toUpperCase()}
                            </Badge>
                            <span className="font-medium">{alert.medication}</span>
                            <span className="text-gray-500">·</span>
                            <span className="text-gray-600">{alert.type}</span>
                          </div>
                          <p className="opacity-80">{alert.concern}</p>
                          <p className="flex items-start gap-1 mt-1">
                            <ArrowRight className="h-3 w-3 shrink-0 mt-0.5" />
                            {alert.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                    <Separator className="mt-4" />
                  </section>
                )}

                {/* 4. Medication Suggestions */}
                {data.medicationSuggestions?.length > 0 && (
                  <section data-testid="section-med-suggestions">
                    <SectionHeader
                      icon={<Pill className="h-3.5 w-3.5" />}
                      title="Medication Suggestions"
                      count={data.medicationSuggestions.length}
                    />
                    <div className="space-y-2">
                      {data.medicationSuggestions.map((med, i) => (
                        <div
                          key={i}
                          className="border border-gray-200 rounded p-2.5 text-xs bg-white"
                          data-testid={`med-suggestion-${i}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="font-semibold text-gray-800">{med.name}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${medicationCategoryClass(med.category)}`}
                            >
                              {med.category}
                            </Badge>
                          </div>
                          <p className="text-gray-700">
                            {med.dose} {med.route} {med.frequency} × {med.duration}
                          </p>
                          <p className="text-gray-500 mt-0.5">{med.indication}</p>
                          {med.caveat && (
                            <p className="text-amber-700 mt-0.5 italic">{med.caveat}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <Separator className="mt-4" />
                  </section>
                )}

                {/* 5. Billing Codes */}
                {(data.codes?.icd10?.length > 0 || data.codes?.cpt?.length > 0) && (
                  <section data-testid="section-codes">
                    <SectionHeader
                      icon={<Code2 className="h-3.5 w-3.5" />}
                      title="Suggested Codes"
                    />
                    <div className="space-y-1.5">
                      {data.codes.icd10?.length > 0 && (
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="text-xs text-gray-500 w-12">ICD-10</span>
                          {data.codes.icd10.map((code, i) => (
                            <Badge key={i} variant="outline" className="text-xs font-mono" data-testid={`code-icd10-${i}`}>
                              {code}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {data.codes.cpt?.length > 0 && (
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="text-xs text-gray-500 w-12">CPT</span>
                          {data.codes.cpt.map((code, i) => (
                            <Badge key={i} variant="outline" className="text-xs font-mono" data-testid={`code-cpt-${i}`}>
                              {code}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Separator className="mt-4" />
                  </section>
                )}

                {/* 6. Return Precautions */}
                {data.returnPrecautions && (
                  <section data-testid="section-return-precautions">
                    <SectionHeader
                      icon={<AlertTriangle className="h-3.5 w-3.5" />}
                      title="Return Precautions"
                    />
                    <div className="space-y-2 text-xs text-gray-700">
                      {data.returnPrecautions.immediateReturn?.length > 0 && (
                        <div>
                          <p className="font-medium text-red-700 mb-1">Return immediately for:</p>
                          <ul className="space-y-0.5 pl-3">
                            {data.returnPrecautions.immediateReturn.map((item, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-red-500 mt-0.5">•</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {data.returnPrecautions.warningSymptoms?.length > 0 && (
                        <div>
                          <p className="font-medium text-amber-700 mb-1">Watch for:</p>
                          <ul className="space-y-0.5 pl-3">
                            {data.returnPrecautions.warningSymptoms.map((item, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-amber-500 mt-0.5">•</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {data.returnPrecautions.expectedCourse && (
                        <div>
                          <p className="font-medium text-gray-700 mb-0.5">Expected course:</p>
                          <p className="text-gray-600">{data.returnPrecautions.expectedCourse}</p>
                        </div>
                      )}
                      {data.returnPrecautions.followupRecommendation && (
                        <div>
                          <p className="font-medium text-gray-700 mb-0.5">Follow-up:</p>
                          <p className="text-gray-600">{data.returnPrecautions.followupRecommendation}</p>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Empty state */}
                {!data.safetyAlerts?.length &&
                  !data.differential?.length &&
                  !data.medicationAlerts?.length && (
                  <div className="text-center text-xs text-gray-400 py-8">
                    No clinical decision support data returned for this case.
                  </div>
                )}
              </>
            )}

            {/* Not yet loaded */}
            {!data && !analyzeMutation.isPending && !analyzeMutation.isError && (
              <div className="text-center text-xs text-gray-400 py-8">
                Loading clinical analysis…
              </div>
            )}

          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

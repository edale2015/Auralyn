/**
 * PatientContextPanel.tsx
 *
 * Displays fetched EHR patient context in the case review page.
 * Shows: demographics, active medications, allergies, conditions, recent labs.
 *
 * Usage in CaseReview.tsx — add between EConsult and Answers cards:
 *
 *   <PatientContextPanel
 *     caseId={c.caseId}
 *     patientId={c.answers?.structured?._ehr_patient_id}
 *     vendor={c.answers?.structured?._ehr_vendor ?? "mock"}
 *     manualTrigger
 *   />
 */

import { useState }                                    from "react";
import { useMutation }                                 from "@tanstack/react-query";
import { apiRequest }                                  from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle }    from "@/components/ui/card";
import { Badge }                                       from "@/components/ui/badge";
import { Button }                                      from "@/components/ui/button";
import {
  AlertTriangle, ChevronDown, ChevronUp,
  Database, Pill, Activity, FlaskConical,
  RefreshCw, User, ShieldAlert,
} from "lucide-react";

// ─── Types (matching server PatientContext shape) ─────────────────────────────

interface Demographics {
  name?:      string; dob?:  string; sex?: string;
  age?:       number; mrn?:  string; insurance?: string;
}
interface Medication  { name: string; dose?: string; frequency?: string; status: string }
interface Allergy     { substance: string; reaction?: string; severity?: string; status: string }
interface Condition   { display: string; icdCode?: string; status: string }
interface LabResult   { name: string; value: string; unit?: string; date: string; flag?: string }

interface PatientContext {
  vendor:       string;
  fetchedAt:    string;
  partial:      boolean;
  errors:       string[];
  demographics: Demographics;
  medications:  Medication[];
  allergies:    Allergy[];
  conditions:   Condition[];
  labs:         LabResult[];
}

interface PatientContextPanelProps {
  caseId:         string | number;
  patientId?:     string;
  vendor?:        string;
  manualTrigger?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flagColor(flag?: string) {
  switch (flag) {
    case "critical": return "text-red-700 font-bold";
    case "high":     return "text-red-600";
    case "low":      return "text-blue-600";
    default:         return "text-gray-700";
  }
}

function severityBadge(severity?: string) {
  const s   = severity?.toLowerCase();
  const cls =
    s === "severe"   ? "bg-red-100 text-red-800 border-red-300" :
    s === "moderate" ? "bg-orange-100 text-orange-800 border-orange-300" :
    s === "mild"     ? "bg-yellow-100 text-yellow-800 border-yellow-300" :
                       "bg-gray-100 text-gray-600 border-gray-300";
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cls}`}>
      {severity ?? "unknown"}
    </Badge>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PatientContextPanel({
  caseId,
  patientId,
  vendor = "mock",
  manualTrigger = false,
}: PatientContextPanelProps) {
  const [isExpanded, setIsExpanded] = useState(!manualTrigger);
  const [context,    setContext]    = useState<PatientContext | null>(null);

  const fetchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/ehr/context/${patientId ?? "demo"}?vendor=${vendor}`
      );
      return res.json() as Promise<{ ok: boolean; context: PatientContext }>;
    },
    onSuccess: (data) => {
      if (data.ok) setContext(data.context);
    },
  });

  const handleLoad = () => {
    setIsExpanded(true);
    if (!context && !fetchMutation.isPending) {
      fetchMutation.mutate();
    }
  };

  const vendorLabel =
    vendor === "mock"   ? "Demo EHR" :
    vendor === "ecw"    ? "eClinicalWorks" :
    vendor === "epic"   ? "Epic" :
    vendor === "athena" ? "Athena" : vendor;

  return (
    <Card className="border border-teal-200 bg-teal-50/30">
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-teal-600" />
            <CardTitle className="text-sm font-semibold text-teal-900">
              EHR Patient Context
            </CardTitle>
            <Badge variant="outline" className="text-[10px] text-teal-600 border-teal-300">
              {vendorLabel}
            </Badge>
            {context?.partial && (
              <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                Partial
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {context && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fetchMutation.mutate()}
                disabled={fetchMutation.isPending}
                className="h-6 w-6 p-0 text-teal-600"
                title="Refresh EHR data"
                data-testid="btn-refresh-ehr"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${fetchMutation.isPending ? "animate-spin" : ""}`} />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={isExpanded ? () => setIsExpanded(false) : handleLoad}
              className="h-6 w-6 p-0 text-teal-600"
              data-testid="btn-toggle-ehr-panel"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {!isExpanded && !context && (
          <p className="text-xs text-teal-500 mt-1">
            {manualTrigger
              ? "Click ↓ to load patient EHR record — medications, allergies, conditions, labs"
              : "EHR data pre-loaded from intake"}
          </p>
        )}
        {!isExpanded && context && (
          <p className="text-xs text-teal-600 mt-1">
            {context.medications.filter(m => m.status === "active").length} meds ·{" "}
            {context.allergies.filter(a => a.status === "active").length} allergies ·{" "}
            {context.conditions.filter(c => c.status === "active").length} conditions
          </p>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-4 space-y-4">

          {fetchMutation.isPending && (
            <div className="space-y-2 animate-pulse py-2">
              {[0.5, 0.8, 0.65, 1, 0.7].map((w, i) => (
                <div key={i} className="h-3 bg-teal-100 rounded" style={{ width: `${w * 100}%` }} />
              ))}
            </div>
          )}

          {!context && !fetchMutation.isPending && manualTrigger && (
            <Button
              size="sm"
              onClick={() => fetchMutation.mutate()}
              className="bg-teal-600 hover:bg-teal-700 text-white w-full"
              data-testid="btn-load-ehr-context"
            >
              <Database className="h-3.5 w-3.5 mr-2" />
              Load EHR Context {patientId ? `for ${patientId}` : "(demo)"}
            </Button>
          )}

          {fetchMutation.isError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Failed to fetch EHR data.{" "}
              <button onClick={() => fetchMutation.mutate()} className="underline">Retry</button>
            </div>
          )}

          {context?.errors?.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 space-y-0.5">
              {context.errors.map((e, i) => (
                <p key={i} className="flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  {e}
                </p>
              ))}
            </div>
          )}

          {context && !fetchMutation.isPending && (
            <>
              {Object.keys(context.demographics).length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Demographics</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700" data-testid="ehr-demographics">
                    {context.demographics.name      && <span><span className="text-gray-400">Name </span>{context.demographics.name}</span>}
                    {context.demographics.age       && <span><span className="text-gray-400">Age </span>{context.demographics.age}</span>}
                    {context.demographics.sex       && <span><span className="text-gray-400">Sex </span>{context.demographics.sex}</span>}
                    {context.demographics.dob       && <span><span className="text-gray-400">DOB </span>{context.demographics.dob}</span>}
                    {context.demographics.mrn       && <span><span className="text-gray-400">MRN </span>{context.demographics.mrn}</span>}
                    {context.demographics.insurance && <span><span className="text-gray-400">Ins </span>{context.demographics.insurance}</span>}
                  </div>
                </section>
              )}

              {context.allergies.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-[10px] font-semibold text-red-700 uppercase tracking-wide">
                      Allergies ({context.allergies.filter(a => a.status === "active").length} active)
                    </span>
                  </div>
                  <div className="space-y-1" data-testid="ehr-allergies">
                    {context.allergies.filter(a => a.status === "active").map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-red-800">{a.substance}</span>
                        {a.reaction  && <span className="text-gray-500">→ {a.reaction}</span>}
                        {severityBadge(a.severity)}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {context.medications.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Pill className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Active Medications ({context.medications.filter(m => m.status === "active").length})
                    </span>
                  </div>
                  <div className="space-y-0.5" data-testid="ehr-medications">
                    {context.medications.filter(m => m.status === "active").map((m, i) => (
                      <div key={i} className="text-xs text-gray-700 flex items-baseline gap-2">
                        <span className="font-medium">{m.name}</span>
                        {m.frequency && <span className="text-gray-400 text-[10px]">{m.frequency}</span>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {context.conditions.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Activity className="h-3.5 w-3.5 text-purple-500" />
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Active Conditions ({context.conditions.filter(c => c.status === "active").length})
                    </span>
                  </div>
                  <div className="space-y-0.5" data-testid="ehr-conditions">
                    {context.conditions.filter(c => c.status === "active").map((c, i) => (
                      <div key={i} className="text-xs text-gray-700 flex items-baseline gap-2">
                        <span>{c.display}</span>
                        {c.icdCode && <span className="text-gray-400 font-mono text-[10px]">{c.icdCode}</span>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {context.labs.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FlaskConical className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Recent Labs
                    </span>
                  </div>
                  <div className="space-y-0.5" data-testid="ehr-labs">
                    {context.labs.map((lab, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">{lab.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={flagColor(lab.flag)}>
                            {lab.value}{lab.unit ? ` ${lab.unit}` : ""}
                          </span>
                          <span className="text-[10px] text-gray-400">{lab.date.split("T")[0]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <p className="text-[10px] text-teal-500">
                Fetched from {vendorLabel} · {new Date(context.fetchedAt).toLocaleTimeString()}
                {context.partial && " · Some sections unavailable"}
              </p>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

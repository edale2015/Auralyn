import { useEffect, useMemo, useState } from "react";
import { skillLayerApi } from "../lib/skillLayerApi";
import { learningApi } from "../lib/learningApi";
import CaseInputCard from "../components/skill-layer/CaseInputCard";
import DispositionBadge from "../components/skill-layer/DispositionBadge";
import RedFlagsCard from "../components/skill-layer/RedFlagsCard";
import DifferentialCard from "../components/skill-layer/DifferentialCard";
import ChartNoteCard from "../components/skill-layer/ChartNoteCard";
import DischargeCard from "../components/skill-layer/DischargeCard";
import AuditTraceCard from "../components/skill-layer/AuditTraceCard";
import OutcomePanel from "../components/skill-layer/OutcomePanel";
import CallbackQueueCard from "../components/skill-layer/CallbackQueueCard";
import DriftAlertsCard from "../components/skill-layer/DriftAlertsCard";
import CaseReplayCompareCard from "../components/skill-layer/CaseReplayCompareCard";

export default function SkillLayerReviewPage() {
  const [rawText, setRawText] = useState(
    "32 year old male with sore throat x 3 days, fever, no cough"
  );
  const [modifiersJson, setModifiersJson] = useState("{}");
  const [runResult, setRunResult] = useState<any>(null);
  const [chartNote, setChartNote] = useState<any>(null);
  const [discharge, setDischarge] = useState<any>(null);
  const [auditTrace, setAuditTrace] = useState<any[]>([]);
  const [graphTrace, setGraphTrace] = useState<any>(null);
  const [driftAlerts, setDriftAlerts] = useState<any[]>([]);
  const [tuningSuggestions, setTuningSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    learningApi.getDriftAlerts().then((r) => setDriftAlerts(r.alerts ?? [])).catch(console.error);
    learningApi.getTuningSuggestions().then((r) => setTuningSuggestions(r.suggestions ?? [])).catch(console.error);
  }, []);

  const contextForDerivedCalls = useMemo(() => {
    if (!runResult?.state?.context) return null;
    return {
      ...runResult.state.context,
      priorSkillOutputs: runResult.state.skillResults,
    };
  }, [runResult]);

  async function handleRun() {
    try {
      setLoading(true);
      setError("");
      setChartNote(null);
      setDischarge(null);
      setAuditTrace([]);

      let modifiers: Record<string, any> = {};
      try {
        modifiers = JSON.parse(modifiersJson || "{}");
      } catch {
        throw new Error("Modifiers JSON is invalid. Please fix and retry.");
      }

      const res = await skillLayerApi.runCase({ rawText, modifiers });
      setRunResult(res);
      setGraphTrace(null);

      const context = {
        ...res.state.context,
        priorSkillOutputs: res.state.skillResults,
      };

      const [noteRes, dischargeRes, traceRes, gTraceRes] = await Promise.all([
        skillLayerApi.buildChartNote(context),
        skillLayerApi.buildDischarge(context),
        skillLayerApi.getAuditTrace(context),
        skillLayerApi.getGraphTrace(context).catch(() => null),
      ]);

      setChartNote(noteRes.note);
      setDischarge(dischargeRes.instructions);
      setAuditTrace(traceRes.trace);
      if (gTraceRes?.ok) setGraphTrace(gTraceRes.trace);
    } catch (err: any) {
      setError(err.message ?? "Run failed");
    } finally {
      setLoading(false);
    }
  }

  const skillResults = runResult?.state?.skillResults ?? {};
  const complaintId = skillResults?.identify_chief_complaint?.result?.complaint_id ?? "";
  const modifiers = skillResults?.collect_modifiers?.result?.modifiers ?? {};
  const disposition = skillResults?.determine_disposition?.result?.disposition ?? "";
  const redFlags = skillResults?.detect_red_flags?.result?.red_flag_hits ?? [];
  const differential = skillResults?.generate_differential?.result?.differential_list ?? [];
  const caseId = runResult?.state?.context?.caseId;

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header / Run panel */}
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Clinician Review</h1>
              <p className="text-sm text-slate-500">
                18-skill pipeline · audit trace · chart note · discharge · outcome capture
              </p>
            </div>
            <DispositionBadge disposition={disposition} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Patient input
              </label>
              <textarea
                data-testid="input-patient-text"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={5}
                className="w-full rounded-2xl border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Modifiers JSON
              </label>
              <textarea
                data-testid="input-modifiers-json"
                value={modifiersJson}
                onChange={(e) => setModifiersJson(e.target.value)}
                rows={5}
                className="w-full rounded-2xl border px-4 py-3 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              data-testid="button-run-case"
              onClick={handleRun}
              disabled={loading}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Running…" : "Run case"}
            </button>

            {loading && (
              <span className="text-sm text-slate-500 animate-pulse">
                Running 18 skills…
              </span>
            )}

            {!!error && (
              <div data-testid="run-error" className="text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Three-column output grid */}
        <div className="grid gap-6 xl:grid-cols-3">

          {/* Column 1: case info, red flags, callbacks, outcome */}
          <div className="space-y-6">
            <CaseInputCard
              rawText={rawText}
              complaintId={complaintId}
              modifiers={modifiers}
            />
            <RedFlagsCard redFlags={redFlags} />
            <CallbackQueueCard context={contextForDerivedCalls} />
            <OutcomePanel caseId={caseId} />
          </div>

          {/* Column 2: differential, chart note, discharge */}
          <div className="space-y-6">
            <DifferentialCard items={differential} />
            <ChartNoteCard note={chartNote} />
            <DischargeCard instructions={discharge} />
          </div>

          {/* Column 3: audit trace + quick outputs + graph trace */}
          <div className="space-y-6">
            <AuditTraceCard trace={auditTrace} />

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Quick Outputs</h2>
              <pre
                data-testid="quick-outputs"
                className="overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-800"
              >
                {JSON.stringify(
                  {
                    complaintId,
                    disposition,
                    topDifferential: differential.slice(0, 3),
                  },
                  null,
                  2
                )}
              </pre>
            </div>

            {graphTrace && (
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-semibold">Graph Trace</h2>
                <pre
                  data-testid="graph-trace"
                  className="overflow-auto rounded-xl bg-blue-50 p-3 text-xs text-blue-900"
                >
                  {JSON.stringify(graphTrace, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Second row: drift alerts + replay */}
        <div className="grid gap-6 xl:grid-cols-2">
          <DriftAlertsCard alerts={driftAlerts} suggestions={tuningSuggestions} />
          <CaseReplayCompareCard
            caseId={caseId}
            rawText={rawText}
            complaintId={complaintId}
          />
        </div>
      </div>
    </div>
  );
}

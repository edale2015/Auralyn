import { useState } from "react";
import { caseReplayApi } from "../../lib/caseReplayApi";

type Props = {
  caseId?: string;
  rawText?: string;
  complaintId?: string;
};

function summarize(state: any) {
  return {
    complaint:
      state?.skillResults?.identify_chief_complaint?.result?.complaint_id ?? "",
    disposition:
      state?.skillResults?.determine_disposition?.result?.disposition ?? "",
    score: state?.skillResults?.apply_clinical_score?.result?.score_name ?? "",
    topDx: (
      state?.skillResults?.generate_differential?.result?.differential_list ?? []
    )
      .slice(0, 3)
      .map((d: any) => d.diagnosis ?? String(d)),
    completedSkills: (state?.completedSkills ?? []).length,
  };
}

export default function CaseReplayCompareCard({ caseId, rawText, complaintId }: Props) {
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState("");

  async function handleReplay() {
    try {
      if (!caseId) {
        setStatus("Missing case ID.");
        return;
      }
      setStatus("Running replay…");
      const res = await caseReplayApi.replayCompare(caseId, rawText, complaintId);
      setResult({
        sequential: summarize(res.sequential),
        graph: summarize(res.graph),
      });
      setStatus("Replay comparison complete.");
    } catch (err: any) {
      setStatus(err.message ?? "Replay failed");
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Sequential vs Graph Replay</h2>

      <button
        data-testid="button-replay-compare"
        onClick={handleReplay}
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
      >
        Replay case
      </button>

      {!!status && (
        <div data-testid="replay-status" className="mt-3 text-sm text-slate-600">
          {status}
        </div>
      )}

      {result && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="mb-2 font-semibold text-slate-700">Sequential</div>
            <pre
              data-testid="replay-sequential"
              className="overflow-auto text-xs text-slate-800"
            >
              {JSON.stringify(result.sequential, null, 2)}
            </pre>
          </div>
          <div className="rounded-xl bg-blue-50 p-3">
            <div className="mb-2 font-semibold text-blue-700">Graph</div>
            <pre
              data-testid="replay-graph"
              className="overflow-auto text-xs text-blue-900"
            >
              {JSON.stringify(result.graph, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

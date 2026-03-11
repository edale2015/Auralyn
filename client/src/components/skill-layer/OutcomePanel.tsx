import { useState } from "react";

type Props = {
  caseId?: string;
};

export default function OutcomePanel({ caseId }: Props) {
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [actualDisposition, setActualDisposition] = useState("");
  const [status, setStatus] = useState("");

  function handleSave() {
    if (!finalDiagnosis && !actualDisposition) {
      setStatus("Enter at least one outcome field before saving.");
      return;
    }
    setStatus("Outcome draft saved locally — wired to /api/skill-layer on next pass.");
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Outcome / Reconciliation</h2>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Final diagnosis
          </label>
          <input
            data-testid="outcome-final-diagnosis"
            value={finalDiagnosis}
            onChange={(e) => setFinalDiagnosis(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            placeholder="e.g. Streptococcal Pharyngitis"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Actual disposition
          </label>
          <input
            data-testid="outcome-actual-disposition"
            value={actualDisposition}
            onChange={(e) => setActualDisposition(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            placeholder="e.g. routine_evaluation"
          />
        </div>

        <button
          data-testid="button-save-outcome"
          onClick={handleSave}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
        >
          Save outcome draft
        </button>

        {!!status && (
          <div data-testid="outcome-status" className="text-sm text-slate-600">
            {status}
          </div>
        )}

        <div className="text-xs text-slate-400">Case ID: {caseId || "unknown"}</div>
      </div>
    </div>
  );
}

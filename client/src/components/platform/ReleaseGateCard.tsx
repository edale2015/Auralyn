import { useState } from "react";
import { platformAdminApi } from "../../lib/platformAdminApi";

export default function ReleaseGateCard() {
  const [complaint, setComplaint] = useState("sore_throat");
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState("");

  async function runGate() {
    try {
      setStatus("Checking...");
      const res = await platformAdminApi.getReleaseGate(complaint);
      setResult(res.result);
      setStatus("");
    } catch (err: any) {
      setStatus(err.message ?? "Failed");
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Release Gate</h2>

      <div className="mb-3 flex gap-2">
        <input
          data-testid="input-release-gate-complaint"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
        <button
          data-testid="button-release-gate-evaluate"
          onClick={runGate}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Evaluate
        </button>
      </div>

      {!!status && <div className="mb-2 text-sm text-slate-600">{status}</div>}

      {result && (
        <div className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Complaint:</span> {result.complaint}
          </div>
          <div className="text-sm">
            <span className="font-medium">Passed:</span> {String(result.passed)}
          </div>
          <div className="text-sm">
            <span className="font-medium">Score:</span> {(Number(result.score) * 100).toFixed(1)}%
          </div>

          {(result.checks ?? []).map((check: any, idx: number) => (
            <div key={idx} className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="font-medium">{check.check}</div>
              <div className={check.passed ? "text-green-700" : "text-red-700"}>
                {String(check.value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { compareDiffExplorerApi } from "../../lib/compareDiffExplorerApi";

export default function CompareDiffExplorerCard() {
  const [complaint, setComplaint] = useState("");
  const [sameDisposition, setSameDisposition] = useState("");
  const [sameComplaint, setSameComplaint] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState("");

  async function runSearch() {
    try {
      setStatus("Searching...");
      const res = await compareDiffExplorerApi.query({
        complaint: complaint || undefined,
        sameDisposition:
          sameDisposition === "" ? undefined : sameDisposition === "true",
        sameComplaint:
          sameComplaint === "" ? undefined : sameComplaint === "true",
        limit: 100,
      });
      setRows(res.result ?? []);
      setStatus(`Found ${res.result?.length ?? 0} rows.`);
    } catch (err: any) {
      setStatus(err.message ?? "Search failed");
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Compare Diff Explorer</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          data-testid="input-diff-complaint"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          className="rounded-xl border px-3 py-2 text-sm"
          placeholder="Complaint filter"
        />
        <select
          data-testid="select-diff-same-disposition"
          value={sameDisposition}
          onChange={(e) => setSameDisposition(e.target.value)}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="">Any disposition match</option>
          <option value="true">Same disposition</option>
          <option value="false">Different disposition</option>
        </select>
        <select
          data-testid="select-diff-same-complaint"
          value={sameComplaint}
          onChange={(e) => setSameComplaint(e.target.value)}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="">Any complaint match</option>
          <option value="true">Same complaint</option>
          <option value="false">Different complaint</option>
        </select>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          data-testid="button-diff-search"
          onClick={runSearch}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Search
        </button>
        {!!status && <span className="text-sm text-slate-600">{status}</span>}
      </div>

      {rows.length > 0 && (
        <div className="mt-4 space-y-3">
          {rows.slice(0, 20).map((row, idx) => (
            <div key={idx} className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <div className="font-medium text-slate-900">{row.caseId ?? "—"}</div>
                <div className="flex gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.sameComplaint
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    complaint {row.sameComplaint ? "match" : "diff"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.sameDisposition
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    disposition {row.sameDisposition ? "match" : "diff"}
                  </span>
                </div>
              </div>
              <div className="text-slate-700">
                Seq: {row.sequential?.complaint || "—"} / {row.sequential?.disposition || "—"}
              </div>
              <div className="text-slate-700">
                Graph: {row.graph?.complaint || "—"} / {row.graph?.disposition || "—"}
              </div>
              {row.compareError && (
                <div className="mt-1 text-xs text-red-600">{row.compareError}</div>
              )}
              <div className="mt-0.5 text-xs text-slate-500">{row.timestamp}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

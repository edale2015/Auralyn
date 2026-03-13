import { useEffect, useState } from "react";
import { rolloutManagerApi } from "../../lib/rolloutManagerApi";

const MODE_COLORS: Record<string, string> = {
  graph: "bg-blue-100 text-blue-800",
  compare: "bg-amber-100 text-amber-800",
  sequential: "bg-slate-100 text-slate-700",
};

export default function ComplaintRolloutManagerCard() {
  const [modes, setModes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");

  async function load() {
    try {
      const res = await rolloutManagerApi.getModes();
      setModes(res.result?.modes ?? {});
    } catch (err: any) {
      setStatus(err.message ?? "Failed to load rollout modes");
    }
  }

  async function updateMode(complaint: string, mode: string) {
    try {
      setStatus(`Saving ${complaint}...`);
      await rolloutManagerApi.setMode({ complaint, mode });
      await load();
      setStatus(`Saved: ${complaint} → ${mode}`);
    } catch (err: any) {
      setStatus(err.message ?? "Failed to save rollout mode");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Complaint Rollout Manager</h2>

      {Object.keys(modes).length === 0 ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : (
        <div className="space-y-2">
          {Object.entries(modes).map(([complaint, mode]) => (
            <div
              key={complaint}
              className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{complaint}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    MODE_COLORS[mode] ?? "bg-slate-100 text-slate-700"
                  }`}
                >
                  {mode}
                </span>
              </div>
              <select
                data-testid={`select-rollout-${complaint}`}
                value={mode}
                onChange={(e) => updateMode(complaint, e.target.value)}
                className="rounded-xl border px-3 py-1.5 text-sm"
              >
                <option value="sequential">sequential</option>
                <option value="compare">compare</option>
                <option value="graph">graph</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {!!status && (
        <div className="mt-3 text-sm text-slate-600">{status}</div>
      )}
    </div>
  );
}

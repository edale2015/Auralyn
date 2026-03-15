import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { COMPLAINTS } from "@shared/complaints";

const ROLLOUT_MODES = ["sequential", "graph", "compare"] as const;

const MODE_COLORS: Record<string, string> = {
  graph: "bg-indigo-100 text-indigo-800",
  compare: "bg-amber-100 text-amber-800",
  sequential: "bg-slate-100 text-slate-700",
};

export default function SiteManagementPage() {
  const queryClient = useQueryClient();
  const [selectedComplaint, setSelectedComplaint] = useState("");
  const [selectedMode, setSelectedMode] = useState<string>("sequential");
  const [saveMsg, setSaveMsg] = useState("");

  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ["/api/platform/config"],
    queryFn: async () => {
      const res = await fetch("/api/platform/config?siteId=default");
      return res.json();
    },
  });

  const { data: rolloutData, isLoading: rolloutLoading } = useQuery({
    queryKey: ["/api/platform/rollout-modes"],
    queryFn: async () => {
      const res = await fetch("/api/platform/rollout-modes?siteId=default");
      return res.json();
    },
  });

  const rolloutMutation = useMutation({
    mutationFn: async ({ complaint, mode }: { complaint: string; mode: string }) => {
      const res = await fetch("/api/platform/rollout-modes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaint, mode, siteId: "default" }),
      });
      return res.json();
    },
    onSuccess: () => {
      setSaveMsg("Saved!");
      setTimeout(() => setSaveMsg(""), 2000);
      queryClient.invalidateQueries({ queryKey: ["/api/platform/rollout-modes"] });
    },
  });

  const config = configData?.config;
  const rolloutModes: Record<string, string> = rolloutData?.modes ?? {};

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-xl font-bold text-slate-900">Site Management</h1>
          <p className="text-sm text-slate-500">Per-complaint rollout modes and platform configuration</p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 p-6">
        {/* Site overview */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">Site Configuration</div>
          {configLoading && <div className="text-sm text-slate-400">Loading…</div>}
          {config && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">Site ID</div>
                <div className="text-sm font-semibold text-slate-900">{config.siteId}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">Site Name</div>
                <div className="text-sm font-semibold text-slate-900">{config.siteName}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">Max LLM Cost / Case</div>
                <div className="text-sm font-semibold text-slate-900">
                  ${config.maxLlmCostUsdPerCase?.toFixed(3)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">Golden Pass Threshold</div>
                <div className="text-sm font-semibold text-slate-900">
                  {Math.round(config.requireGoldenPassRate * 100)}%
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">Enabled Modules</div>
                <div className="text-sm text-slate-700">
                  {config.enabledModules?.join(", ") ?? "—"}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">Require Reasoning</div>
                <div className="text-sm font-semibold text-slate-900">
                  {config.requireReasoningSummary ? "Yes" : "No"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rollout modes */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Complaint Rollout Modes</div>
            {saveMsg && (
              <span className="text-sm font-medium text-green-700">{saveMsg}</span>
            )}
          </div>

          {rolloutLoading && <div className="text-sm text-slate-400">Loading…</div>}

          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {COMPLAINTS.map((complaint) => {
              const mode = rolloutModes[complaint] ?? "sequential";
              return (
                <div
                  key={complaint}
                  data-testid={`text-rollout-${complaint}`}
                  className="flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-slate-800">
                    {complaint.replace(/_/g, " ")}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      MODE_COLORS[mode] ?? MODE_COLORS.sequential
                    }`}
                  >
                    {mode}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-2 text-sm font-medium text-slate-700">Update Rollout Mode</div>
            <div className="flex gap-2">
              <select
                data-testid="select-rollout-complaint"
                value={selectedComplaint}
                onChange={(e) => setSelectedComplaint(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select complaint…</option>
                {COMPLAINTS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <select
                data-testid="select-rollout-mode"
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value)}
                className="w-36 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {ROLLOUT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button
                data-testid="button-save-rollout"
                disabled={!selectedComplaint || rolloutMutation.isPending}
                onClick={() =>
                  rolloutMutation.mutate({ complaint: selectedComplaint, mode: selectedMode })
                }
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {rolloutMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* Clinical API reference */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">Clinical API Endpoints (EHR Readiness)</div>
          <div className="space-y-2">
            {[
              { method: "POST", path: "/api/clinical/triage", desc: "Full triage result (FHIR-lite format)" },
              { method: "POST", path: "/api/clinical/differential", desc: "Differential diagnosis only" },
              { method: "POST", path: "/api/clinical/documentation", desc: "HPI + Assessment + Plan + Discharge" },
              { method: "POST", path: "/api/clinical/care-plan", desc: "Structured care plan" },
            ].map((ep) => (
              <div key={ep.path} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs font-bold text-white">
                  {ep.method}
                </span>
                <div>
                  <div className="font-mono text-sm text-slate-800">{ep.path}</div>
                  <div className="text-xs text-slate-500">{ep.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-slate-100 p-3">
            <div className="mb-1 text-xs font-semibold text-slate-600">Example request body</div>
            <pre className="overflow-x-auto text-xs text-slate-700">{`{
  "rawText": "Patient has cough and fever for 3 days",
  "complaint": "cough"
}`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

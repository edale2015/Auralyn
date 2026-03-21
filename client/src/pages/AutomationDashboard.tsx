import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import RunCard from "../components/automation/RunCard";
import { apiRequest } from "@/lib/queryClient";

export default function AutomationDashboard() {
  const qc = useQueryClient();
  const [templateKey, setTemplateKey] = useState("demo-intake-form");
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(
      { firstName: "Dale", lastName: "Thomas", dob: "1980-01-01", state: "NY", agree: true },
      null,
      2
    )
  );
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const { data: runs = [], isLoading: runsLoading } = useQuery<any[]>({
    queryKey: ["/api/automation/runs"],
  });

  const { data: approvals = [], isLoading: approvalsLoading } = useQuery<any[]>({
    queryKey: ["/api/automation/approvals"],
  });

  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["/api/automation/templates"],
  });

  const startMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/automation/run", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/automation/runs"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/automation/approvals/${id}/approve`, {
        decidedBy: "operator",
        notes: "Approved from dashboard",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/automation/approvals"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/automation/approvals/${id}/reject`, {
        decidedBy: "operator",
        notes: "Rejected from dashboard",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/automation/approvals"] });
    },
  });

  function handleStartRun() {
    try {
      const parsed = JSON.parse(payloadText);
      setPayloadError(null);
      startMutation.mutate({ templateKey, payload: parsed, startedBy: "operator" });
    } catch {
      setPayloadError("Invalid JSON payload");
    }
  }

  return (
    <div className="p-6 space-y-8" data-testid="automation-dashboard">
      <h1 className="text-3xl font-semibold">Automation Dashboard</h1>

      <section className="rounded-2xl border p-5 bg-white dark:bg-gray-900 space-y-4">
        <h2 className="text-lg font-semibold">Launch Run</h2>

        <div>
          <label className="block text-sm font-medium mb-1">Template</label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800"
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value)}
            data-testid="select-template-key"
          >
            {templates.map((t: any) => (
              <option key={t.templateKey} value={t.templateKey}>
                {t.name} ({t.templateKey})
              </option>
            ))}
            {templates.length === 0 && (
              <option value="demo-intake-form">demo-intake-form</option>
            )}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Payload JSON</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 min-h-[160px] font-mono text-sm dark:bg-gray-800"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            data-testid="input-payload-json"
          />
          {payloadError && (
            <div className="text-xs text-red-600 mt-1" data-testid="payload-error">
              {payloadError}
            </div>
          )}
        </div>

        <button
          className="rounded-xl bg-blue-600 text-white px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          onClick={handleStartRun}
          disabled={startMutation.isPending}
          data-testid="button-start-run"
        >
          {startMutation.isPending ? "Starting..." : "Start Automation Run"}
        </button>

        {startMutation.isError && (
          <div className="text-sm text-red-600" data-testid="run-start-error">
            {(startMutation.error as any)?.message || "Failed to start run"}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">
          Pending Approvals{" "}
          {approvalsLoading && <span className="text-sm text-gray-400">loading...</span>}
        </h2>
        <div className="space-y-3">
          {approvals.map((row: any) => (
            <div
              key={row.id}
              className="rounded-2xl border p-4 bg-white dark:bg-gray-900"
              data-testid={`approval-card-${row.id}`}
            >
              <div className="font-medium">{row.checkpoint_name}</div>
              <div className="text-sm text-gray-500">Run: {row.run_id}</div>
              <div className="text-xs text-gray-400 mt-1">
                Requested: {new Date(row.created_at).toLocaleString()}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded-xl bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700 disabled:opacity-50"
                  onClick={() => approveMutation.mutate(row.id)}
                  disabled={approveMutation.isPending}
                  data-testid={`button-approve-${row.id}`}
                >
                  Approve
                </button>
                <button
                  className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => rejectMutation.mutate(row.id)}
                  disabled={rejectMutation.isPending}
                  data-testid={`button-reject-${row.id}`}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
          {!approvalsLoading && approvals.length === 0 && (
            <div className="text-gray-500 text-sm" data-testid="no-approvals">
              No pending approvals
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">
          Recent Runs{" "}
          {runsLoading && <span className="text-sm text-gray-400">loading...</span>}
        </h2>
        <div className="grid gap-4">
          {runs.map((run: any) => (
            <RunCard key={run.id} run={run} />
          ))}
          {!runsLoading && runs.length === 0 && (
            <div className="text-gray-500 text-sm" data-testid="no-runs">
              No runs yet. Use the form above to start one.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

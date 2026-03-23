import { useEffect, useState } from "react";

export default function ReplayInspectorPage() {
  const [replays, setReplays] = useState<any[]>([]);
  const [selectedReplay, setSelectedReplay] = useState<any>(null);
  const [selectedStep, setSelectedStep] = useState<any>(null);

  useEffect(() => {
    fetch("/api/replay-inspector/replays")
      .then(r => r.json())
      .then(data => setReplays(data.replays || []));
  }, []);

  async function openReplay(replayId: string) {
    const res = await fetch(`/api/replay-inspector/replays/${replayId}`);
    const data = await res.json();
    setSelectedReplay(data.replay);
    setSelectedStep(data.replay?.stepRecords?.[0] ?? null);
  }

  const statusColor: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    running: "bg-blue-100 text-blue-700",
    cancelled: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="p-4 grid grid-cols-12 gap-4 min-h-screen bg-slate-50">
      <div className="col-span-3 bg-white rounded-2xl shadow p-4 overflow-auto">
        <h2 className="text-xl font-semibold mb-3">Replay Sessions</h2>
        <div className="space-y-2">
          {replays.map(r => (
            <button
              key={r.replayId}
              data-testid={`replay-item-${r.replayId}`}
              onClick={() => openReplay(r.replayId)}
              className={`w-full text-left border rounded-xl p-3 hover:bg-slate-50 transition-colors ${
                selectedReplay?.replayId === r.replayId ? "border-blue-500 bg-blue-50" : ""
              }`}
            >
              <div className="font-medium text-sm truncate">{r.templateId}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[r.status] ?? "bg-slate-100"}`}>
                  {r.status}
                </span>
                <span className="text-xs text-slate-400">{new Date(r.startedAt).toLocaleString()}</span>
              </div>
            </button>
          ))}
          {replays.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-6">No replay sessions yet</div>
          )}
        </div>
      </div>

      <div className="col-span-9 grid grid-rows-[auto_1fr] gap-4">
        {selectedReplay && (
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <div className="text-xs text-slate-500">Replay ID</div>
                <div data-testid="text-replay-id" className="font-mono text-sm">{selectedReplay.replayId}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Template</div>
                <div className="font-medium text-sm">{selectedReplay.templateId}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Version</div>
                <div className="text-sm">{selectedReplay.versionId}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Status</div>
                <span className={`text-sm px-2 py-0.5 rounded-full ${statusColor[selectedReplay.status] ?? ""}`}>
                  {selectedReplay.status}
                </span>
              </div>
              <div>
                <div className="text-xs text-slate-500">Environment</div>
                <div className="text-sm">{selectedReplay.environment}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Initiated By</div>
                <div className="text-sm">{selectedReplay.initiatedBy}</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-12 gap-4 overflow-auto">
          {selectedReplay && (
            <>
              <div className="col-span-4 bg-white rounded-2xl shadow p-4 overflow-auto">
                <h3 className="font-semibold mb-3">Steps ({selectedReplay.stepRecords?.length ?? 0})</h3>
                <div className="space-y-2">
                  {selectedReplay.stepRecords?.map((step: any) => (
                    <button
                      key={step.stepId}
                      data-testid={`step-record-${step.stepId}`}
                      className={`w-full text-left border rounded-xl p-3 hover:bg-slate-50 transition-colors ${
                        selectedStep?.stepId === step.stepId ? "border-blue-500 bg-blue-50" : ""
                      }`}
                      onClick={() => setSelectedStep(step)}
                    >
                      <div className="flex justify-between items-center">
                        <div className="font-medium text-sm truncate flex-1 mr-2">{step.stepName}</div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                          step.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}>
                          {step.success ? "OK" : "FAIL"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">{step.action} • {step.durationMs}ms</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-8 bg-white rounded-2xl shadow p-4 overflow-auto">
                <h3 className="font-semibold mb-3">Step Detail</h3>
                {!selectedStep && <div className="text-slate-400 text-sm">Select a step</div>}
                {selectedStep && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="font-semibold">{selectedStep.stepName}</div>
                      <span className={`text-sm px-3 py-1 rounded-full ${
                        selectedStep.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {selectedStep.success ? "Success" : "Failed"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-xs text-slate-500">Action</div>
                        <div>{selectedStep.action}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-xs text-slate-500">Duration</div>
                        <div>{selectedStep.durationMs}ms</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-xs text-slate-500">Approval State</div>
                        <div>{selectedStep.approvalState || "-"}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-xs text-slate-500">Selector Healing</div>
                        <div>{selectedStep.selectorHealingApplied ? "Yes" : "No"}</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-xs text-slate-500 mb-1">Selector Original</div>
                        <div className="font-mono text-xs break-all">{selectedStep.selectorOriginal || "-"}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-xs text-slate-500 mb-1">Selector Resolved</div>
                        <div className="font-mono text-xs break-all">{selectedStep.selectorResolved || "-"}</div>
                      </div>
                      {selectedStep.inputPreview && (
                        <div className="bg-slate-50 rounded-lg p-2">
                          <div className="text-xs text-slate-500 mb-1">Input Preview</div>
                          <div className="font-mono text-xs">{selectedStep.inputPreview}</div>
                        </div>
                      )}
                      {selectedStep.errorMessage && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                          <div className="text-xs text-red-500 mb-1">Error</div>
                          <div className="text-red-700 text-xs">{selectedStep.errorMessage}</div>
                        </div>
                      )}
                    </div>

                    {selectedStep.artifacts?.length > 0 && (
                      <div>
                        <div className="font-medium text-sm mb-2">Artifacts ({selectedStep.artifacts.length})</div>
                        <div className="space-y-2">
                          {selectedStep.artifacts.map((a: any, idx: number) => (
                            <div key={idx} className="text-sm border rounded-lg p-2 bg-slate-50">
                              <div className="text-xs text-slate-500">{a.type}</div>
                              <div className="font-mono text-xs truncate">{a.path || a.inlineText || "-"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedStep.variablesUsed?.length > 0 && (
                      <div>
                        <div className="font-medium text-sm mb-2">Variables Used</div>
                        <div className="flex flex-wrap gap-1">
                          {selectedStep.variablesUsed.map((v: string) => (
                            <span key={v} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{v}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {!selectedReplay && (
            <div className="col-span-12 bg-white rounded-2xl shadow p-8 flex items-center justify-center text-slate-400">
              Select a replay session to inspect
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

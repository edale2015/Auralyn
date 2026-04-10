import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface AutoResult {
  ok: boolean;
  time: number;
  error?: string;
}

interface LoopStatus {
  running: boolean;
  queueLength: number;
  processed: number;
  errors: number;
}

export default function UIAutomationPanel() {
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<AutoResult | null>(null);
  const [loopStatus, setLoopStatus] = useState<LoopStatus | null>(null);
  const [syncResult, setSyncResult] = useState<{ ecw: string; epic: string } | null>(null);
  const { toast } = useToast();

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ui/run", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: { url: "about:blank", steps: [] } }),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: data.ok ? "Automation complete" : "Automation failed", description: `${data.time}ms` });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function toggleLoop(action: "start" | "stop") {
    await fetch(`/api/clinic-loop/${action}`, { method: "POST" });
    const res = await fetch("/api/clinic-loop/status");
    setLoopStatus(await res.json());
    toast({ title: action === "start" ? "Clinic loop started" : "Clinic loop stopped" });
  }

  async function syncEHRs() {
    const res = await fetch("/api/ui/sync-ehrs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: "DEMO-001", disposition: "ROUTINE" }),
    });
    setSyncResult(await res.json());
    toast({ title: "EHR sync triggered" });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-2xl font-bold mb-1">🖱️ Automation Control</h1>
      <p className="text-gray-400 text-sm mb-6">ECW UI automation, live clinic loop, and cross-system EHR sync.</p>

      <div className="grid grid-cols-1 gap-4 mb-6">

        {/* UI Automation */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3 text-sm">🖱️ UI Automation (ECW)</h2>
          <button
            onClick={run}
            disabled={loading}
            data-testid="button-run-automation"
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded text-sm font-medium"
          >
            {loading ? "Running…" : "▶ Run Automation"}
          </button>
          {result && (
            <div className="mt-3 text-xs" data-testid="automation-result">
              <span className={result.ok ? "text-green-400" : "text-red-400"}>
                {result.ok ? "✅ Success" : "❌ Failed"}
              </span>
              <span className="text-gray-400 ml-2">{result.time}ms</span>
              {result.error && <p className="text-red-400 mt-1">{result.error}</p>}
            </div>
          )}
        </div>

        {/* Clinic Loop */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3 text-sm">🔄 Live Clinic Loop</h2>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => toggleLoop("start")}
              data-testid="button-loop-start"
              className="px-3 py-2 bg-green-800 hover:bg-green-700 rounded text-xs font-medium"
            >
              ▶ Start Loop
            </button>
            <button
              onClick={() => toggleLoop("stop")}
              data-testid="button-loop-stop"
              className="px-3 py-2 bg-red-800 hover:bg-red-700 rounded text-xs font-medium"
            >
              ⏹ Stop Loop
            </button>
          </div>
          {loopStatus && (
            <div className="grid grid-cols-2 gap-2 text-xs" data-testid="loop-status">
              <div className="bg-gray-800 rounded p-2">
                <p className="text-gray-400">Status</p>
                <p className={loopStatus.running ? "text-green-400" : "text-gray-300"}>
                  {loopStatus.running ? "Running" : "Stopped"}
                </p>
              </div>
              <div className="bg-gray-800 rounded p-2">
                <p className="text-gray-400">Queue</p>
                <p className="text-white">{loopStatus.queueLength}</p>
              </div>
              <div className="bg-gray-800 rounded p-2">
                <p className="text-gray-400">Processed</p>
                <p className="text-white">{loopStatus.processed}</p>
              </div>
              <div className="bg-gray-800 rounded p-2">
                <p className="text-gray-400">Errors</p>
                <p className={loopStatus.errors > 0 ? "text-red-400" : "text-white"}>{loopStatus.errors}</p>
              </div>
            </div>
          )}
        </div>

        {/* EHR Sync */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3 text-sm">🌍 Cross-EHR Sync (ECW + Epic)</h2>
          <button
            onClick={syncEHRs}
            data-testid="button-sync-ehrs"
            className="px-4 py-2 bg-purple-700 hover:bg-purple-600 rounded text-sm font-medium"
          >
            ⚡ Sync EHRs
          </button>
          {syncResult && (
            <div className="mt-3 text-xs flex gap-4" data-testid="sync-result">
              <span>ECW: <span className={syncResult.ecw === "ok" ? "text-green-400" : "text-yellow-400"}>{syncResult.ecw}</span></span>
              <span>Epic: <span className={syncResult.epic === "ok" ? "text-green-400" : "text-yellow-400"}>{syncResult.epic}</span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

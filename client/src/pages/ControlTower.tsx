import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface SystemMetrics {
  errorRate: number;
  latency: number;
  denialRate: number;
}

interface ScoreResult { score: number }
interface LoopStatus { running: boolean; queueLength: number; processed: number; errors: number }

function ScoreGauge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "text-green-400" : pct >= 60 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex flex-col items-center" data-testid="score-gauge">
      <span className={`text-5xl font-black ${color}`}>{pct}</span>
      <span className="text-xs text-gray-400 mt-1">System Health</span>
    </div>
  );
}

export default function ControlTower() {
  const [metrics, setMetrics] = useState<SystemMetrics>({ errorRate: 0.02, latency: 800, denialRate: 0.05 });
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [connType, setConnType] = useState("slack");
  const [connMsg, setConnMsg] = useState("System check from Control Tower");
  const { toast } = useToast();

  const { data: loopStatus } = useQuery<LoopStatus>({
    queryKey: ["/api/clinic-loop/status"],
    refetchInterval: 5_000,
  });

  async function computeScore() {
    const res = await fetch("/api/system/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metrics),
    });
    setScoreResult(await res.json());
  }

  async function routeConnector() {
    const res = await fetch("/api/connector/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: connType, payload: { msg: connMsg } }),
    });
    await res.json();
    toast({ title: `Sent via ${connType}`, description: connMsg });
  }

  async function orchestrateDemo() {
    const res = await fetch("/api/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: "DEMO-001", complaint: "chest_pain", insurance: "Aetna" }),
    });
    const data = await res.json();
    toast({ title: "Orchestration complete", description: `Disposition: ${data.triage?.safetyDisposition ?? "unknown"}` });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="flex items-center mb-6">
        <h1 className="text-2xl font-bold mr-auto">📡 Control Tower</h1>
        <span className="text-xs text-gray-500">Unified system visibility</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">

        {/* Clinic Loop Status */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 col-span-2">
          <h2 className="text-sm font-semibold mb-3">🔄 Live Clinic Loop</h2>
          {loopStatus ? (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Status",    val: loopStatus.running ? "Running" : "Stopped", ok: loopStatus.running },
                { label: "Queue",     val: String(loopStatus.queueLength), ok: true },
                { label: "Processed", val: String(loopStatus.processed), ok: true },
                { label: "Errors",    val: String(loopStatus.errors), ok: loopStatus.errors === 0 },
              ].map(({ label, val, ok }) => (
                <div key={label} className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className={`text-xl font-bold ${ok ? "text-white" : "text-red-400"}`}>{val}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-16 bg-gray-800 rounded-lg animate-pulse" />
          )}
        </div>

        {/* System Health Score */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3">📊 System Score</h2>
          <div className="space-y-2 mb-3">
            {(["errorRate", "latency", "denialRate"] as const).map(k => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-24 shrink-0">{k}</span>
                <input
                  type="number"
                  step={k === "latency" ? 100 : 0.01}
                  value={metrics[k]}
                  onChange={e => setMetrics(m => ({ ...m, [k]: Number(e.target.value) }))}
                  data-testid={`input-metric-${k}`}
                  className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                />
              </div>
            ))}
          </div>
          <button
            onClick={computeScore}
            data-testid="button-compute-score"
            className="w-full py-2 bg-indigo-700 hover:bg-indigo-600 rounded text-xs font-medium"
          >
            Compute Score
          </button>
          {scoreResult && <ScoreGauge score={scoreResult.score} />}
        </div>

        {/* Connector Router */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3">🔌 Connector Router</h2>
          <div className="space-y-2 mb-3">
            <select
              value={connType}
              onChange={e => setConnType(e.target.value)}
              data-testid="select-connector-type"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
            >
              {["slack","telegram","broadcast","ecw"].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              value={connMsg}
              onChange={e => setConnMsg(e.target.value)}
              data-testid="input-connector-msg"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white"
              placeholder="Message…"
            />
          </div>
          <button
            onClick={routeConnector}
            data-testid="button-route-connector"
            className="w-full py-2 bg-purple-700 hover:bg-purple-600 rounded text-xs font-medium"
          >
            ⚡ Route
          </button>
        </div>

        {/* Central Orchestrator */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 col-span-2">
          <h2 className="text-sm font-semibold mb-3">🧠 Central Orchestrator</h2>
          <p className="text-xs text-gray-400 mb-3">
            Runs the full patient pipeline: triage → revenue → EHR write → hospital alert in one call.
          </p>
          <button
            onClick={orchestrateDemo}
            data-testid="button-orchestrate"
            className="px-6 py-2.5 bg-green-800 hover:bg-green-700 rounded font-medium text-sm"
          >
            ▶ Run Demo Patient (DEMO-001)
          </button>
        </div>

      </div>

      {/* Navigation Panel Links */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3">🗂 System Panels</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["/alert-rules",       "🚨 Alert Rules"],
            ["/admin-panel",       "🧑‍💼 Admin"],
            ["/multi-tenant",      "🏢 Multi-Tenant"],
            ["/workflow-canvas-full", "🧩 Workflow Canvas"],
            ["/physician-copilot", "⚡ Physician Copilot"],
            ["/ui-automation",     "🖱️ UI Automation"],
            ["/epic-test",         "🏥 Epic Test"],
            ["/alert-rules",       "📐 Alert Rules"],
          ].map(([href, label]) => (
            <a
              key={`${href}-${label}`}
              href={href}
              data-testid={`link-panel-${label.replace(/[^a-z]/gi,"").toLowerCase()}`}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 hover:text-white transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

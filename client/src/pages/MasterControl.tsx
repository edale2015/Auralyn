import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface IntegrationStatus { epic: string; ecw: string; chatgpt: string; whatsapp: string }
interface UnifiedState {
  clinical:     { activeCases: number; safetyMismatch: number };
  automation:   { templates: number; failures: number; lastRun: number };
  revenue:      { dailyRevenue: number; denialRate: number };
  vision:       { successRate: number; fallbackRate: number };
  integrations: IntegrationStatus;
  score:        number;
}

function StatusDot({ val }: { val: string }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full mr-1 ${val === "ok" ? "bg-green-400" : "bg-yellow-400"}`} />
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const bg = pct >= 80 ? "bg-green-700" : pct >= 60 ? "bg-yellow-700" : "bg-red-700";
  return (
    <span className={`${bg} text-white text-xs font-bold px-2 py-0.5 rounded`} data-testid="score-badge">
      {pct}
    </span>
  );
}

export default function MasterControl() {
  const { toast } = useToast();

  const { data: state, isLoading } = useQuery<UnifiedState>({
    queryKey: ["/api/control/state/unified"],
    refetchInterval: 3_000,
  });

  const action = useMutation({
    mutationFn: (a: string) => apiRequest("POST", "/api/control/action", { action: a }),
    onSuccess: (_: unknown, a: string) => toast({ title: `${a} triggered` }),
    onError:   (e: any, a: string) => toast({ title: `${a} failed`, description: e?.message, variant: "destructive" }),
  });

  if (isLoading || !state) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-6 flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading system state…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">🧠 Master Control Tower</h1>
          <p className="text-xs text-gray-500 mt-0.5">Unified visibility — all systems live</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Health</span>
          <ScoreBadge score={state.score} />
        </div>
      </div>

      {/* State Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">

        {/* Clinical */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4" data-testid="panel-clinical">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">🏥 Clinical</h2>
          <div className="flex justify-between">
            <div>
              <p className="text-2xl font-bold">{state.clinical.activeCases}</p>
              <p className="text-xs text-gray-500">Active cases</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${state.clinical.safetyMismatch < 0.01 ? "text-green-400" : "text-red-400"}`}>
                {(state.clinical.safetyMismatch * 100).toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500">Safety mismatch</p>
            </div>
          </div>
        </div>

        {/* Automation */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4" data-testid="panel-automation">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">🖱️ Automation</h2>
          <div className="flex justify-between">
            <div>
              <p className="text-2xl font-bold">{state.automation.templates}</p>
              <p className="text-xs text-gray-500">Templates</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${state.automation.failures === 0 ? "text-green-400" : "text-red-400"}`}>
                {state.automation.failures}
              </p>
              <p className="text-xs text-gray-500">Failures</p>
            </div>
          </div>
        </div>

        {/* Revenue */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4" data-testid="panel-revenue">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">💰 Revenue</h2>
          <div className="flex justify-between">
            <div>
              <p className="text-2xl font-bold">${state.revenue.dailyRevenue.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Daily revenue</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${state.revenue.denialRate < 0.1 ? "text-yellow-400" : "text-red-400"}`}>
                {(state.revenue.denialRate * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500">Denial rate</p>
            </div>
          </div>
        </div>

        {/* Vision */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4" data-testid="panel-vision">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">👁️ Vision Agent</h2>
          <div className="flex justify-between">
            <div>
              <p className="text-2xl font-bold">{(state.vision.successRate * 100).toFixed(0)}%</p>
              <p className="text-xs text-gray-500">Success rate</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-yellow-400">{(state.vision.fallbackRate * 100).toFixed(0)}%</p>
              <p className="text-xs text-gray-500">Fallback rate</p>
            </div>
          </div>
        </div>

        {/* Integrations */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 col-span-2" data-testid="panel-integrations">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">🔌 Integrations</h2>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(state.integrations).map(([k, v]) => (
              <div key={k} className="bg-gray-800 rounded-lg p-2">
                <p className="text-xs text-gray-400 uppercase">{k}</p>
                <p className="text-sm font-semibold mt-0.5 flex items-center">
                  <StatusDot val={String(v)} />
                  {String(v)}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Control Actions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">⚡ Control Actions</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "runSimulation",   label: "🧪 Simulation",      color: "bg-blue-800 hover:bg-blue-700" },
            { key: "stressTest",      label: "🔥 Stress Test",     color: "bg-orange-800 hover:bg-orange-700" },
            { key: "repairAutomation",label: "🔧 Repair",          color: "bg-yellow-800 hover:bg-yellow-700" },
            { key: "deployRegion",    label: "🌍 Deploy Region",   color: "bg-green-800 hover:bg-green-700" },
            { key: "publishUpdate",   label: "📡 Publish Update",  color: "bg-purple-800 hover:bg-purple-700" },
          ].map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => action.mutate(key)}
              disabled={action.isPending}
              data-testid={`button-action-${key}`}
              className={`px-4 py-2 ${color} rounded text-xs font-medium disabled:opacity-50 transition-colors`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Panel Navigation */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">🗂 All Panels</h2>
        <div className="grid grid-cols-4 gap-2">
          {[
            ["/control-tower",     "📡 Control Tower"],
            ["/ui-automation",     "🖱️ UI Automation"],
            ["/physician-copilot", "⚡ Physician Copilot"],
            ["/alert-rules",       "🚨 Alert Rules"],
            ["/admin-panel",       "🧑‍💼 Admin"],
            ["/multi-tenant",      "🏢 Multi-Tenant"],
            ["/workflow-canvas-full", "🧩 Workflow Canvas"],
            ["/epic-test",         "🏥 Epic Test"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              data-testid={`link-master-${href.replace("/","")}`}
              className="px-2 py-2 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 hover:text-white transition-colors text-center"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

    </div>
  );
}

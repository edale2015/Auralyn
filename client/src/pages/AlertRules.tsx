import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface AlertRule {
  id: string;
  expr: string;
  target: string;
  createdAt: string;
}

export default function AlertRules() {
  const [expr,   setExpr]   = useState("latency > 2000");
  const [target, setTarget] = useState("slack");
  const [rules,  setRules]  = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function save() {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expr, target }),
      });
      const rule = await res.json();
      setRules(prev => [...prev, rule]);
      toast({ title: "Rule saved", description: `Fires when: ${expr}` });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function evalNow() {
    const testMetrics = { latency: 3000, erRate: 0.3, safetyMismatchRate: 0.02 };
    const res = await fetch("/api/alerts/rules/eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics: testMetrics }),
    });
    const { fired } = await res.json();
    toast({
      title: `${fired.length} rule(s) fired`,
      description: fired.length === 0 ? "All clear" : `IDs: ${fired.join(", ")}`,
    });
  }

  async function removeRule(id: string) {
    await fetch(`/api/alerts/rules/${id}`, { method: "DELETE" });
    setRules(prev => prev.filter(r => r.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-2xl font-bold mb-6">🚨 Alert Rules</h1>

      <div className="bg-gray-900 rounded-xl p-4 mb-6 space-y-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Expression</label>
          <input
            value={expr}
            onChange={e => setExpr(e.target.value)}
            data-testid="input-alert-expr"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono"
            placeholder="latency > 2000"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Target</label>
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            data-testid="select-alert-target"
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
          >
            <option value="slack">Slack</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={loading}
            data-testid="button-save-rule"
            className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded text-sm font-medium"
          >
            + Save Rule
          </button>
          <button
            onClick={evalNow}
            data-testid="button-eval-rules"
            className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 rounded text-sm font-medium"
          >
            ⚡ Evaluate Now
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {rules.length === 0 && (
          <p className="text-gray-500 text-sm">No rules yet — add one above.</p>
        )}
        {rules.map(r => (
          <div
            key={r.id}
            data-testid={`rule-row-${r.id}`}
            className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-mono text-yellow-300">{r.expr}</p>
              <p className="text-xs text-gray-500 mt-0.5">→ {r.target} · {new Date(r.createdAt).toLocaleTimeString()}</p>
            </div>
            <button
              onClick={() => removeRule(r.id)}
              data-testid={`button-remove-rule-${r.id}`}
              className="text-red-400 hover:text-red-300 text-xs"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

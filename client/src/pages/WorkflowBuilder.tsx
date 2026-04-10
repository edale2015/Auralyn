import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const AVAILABLE_STEPS = [
  { id: "fastTriage",   label: "⚡ Fast Triage" },
  { id: "fullTriage",   label: "🧠 Full Triage" },
  { id: "bill",         label: "💰 Bill" },
  { id: "sendHospital", label: "🏥 Send to Hospital" },
];

export default function WorkflowBuilder() {
  const [steps, setSteps] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const { toast } = useToast();

  function add(step: string) {
    setSteps(prev => [...prev, step]);
  }

  function remove(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx));
  }

  async function run() {
    if (steps.length === 0) {
      toast({ title: "No steps", description: "Add at least one step to run.", variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: steps.map(s => ({ name: s })), input: {} }),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: "Workflow executed", description: `${steps.length} steps completed.` });
    } catch {
      toast({ title: "Error", description: "Workflow execution failed.", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 bg-gray-950 text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-6">🧩 Workflow Builder</h1>

      <div className="flex flex-wrap gap-2 mb-6">
        {AVAILABLE_STEPS.map(s => (
          <button
            key={s.id}
            data-testid={`button-add-${s.id}`}
            onClick={() => add(s.id)}
            className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded text-sm font-medium"
          >
            + {s.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl p-4 mb-4 min-h-24 space-y-2">
        {steps.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-4">Add steps above to build your workflow</p>
        )}
        {steps.map((s, i) => {
          const label = AVAILABLE_STEPS.find(st => st.id === s)?.label ?? s;
          return (
            <div key={i} className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded" data-testid={`step-row-${i}`}>
              <span className="text-sm">Step {i + 1}: {label}</span>
              <button
                onClick={() => remove(i)}
                data-testid={`button-remove-step-${i}`}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={run}
        disabled={running}
        data-testid="button-run-workflow"
        className="px-5 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded font-semibold"
      >
        {running ? "Running…" : "▶ Run Workflow"}
      </button>

      {result && (
        <pre className="mt-4 bg-gray-900 rounded p-3 text-xs text-green-300 overflow-auto" data-testid="workflow-result">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

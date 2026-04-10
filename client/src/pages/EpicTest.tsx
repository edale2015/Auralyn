import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface EpicTestResult {
  patientId?: string;
  status?: string;
  error?: string;
  [key: string]: unknown;
}

export default function EpicTest() {
  const [loading, setLoading]  = useState(false);
  const [result,  setResult]   = useState<EpicTestResult | null>(null);
  const { toast } = useToast();

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/epic/test", { method: "POST" });
      const data = await res.json();
      setResult(data);
      toast({ title: "Epic test run complete", description: `Patient: ${data.patientId ?? "N/A"}` });
    } catch (e: any) {
      toast({ title: "Epic test failed", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-2xl font-bold mb-2">🏥 Epic Sandbox</h1>
      <p className="text-gray-400 text-sm mb-6">Runs a test patient flow against the Epic sandbox environment.</p>

      <button
        onClick={run}
        disabled={loading}
        data-testid="button-run-epic-test"
        className="px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg font-medium text-sm transition-colors"
      >
        {loading ? "Running…" : "▶ Run Test Patient Flow"}
      </button>

      {result && (
        <div className="mt-6 bg-gray-900 border border-gray-700 rounded-xl p-4" data-testid="epic-test-result">
          <p className="text-xs text-gray-400 mb-2">Result</p>
          <pre className="text-xs text-green-300 overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

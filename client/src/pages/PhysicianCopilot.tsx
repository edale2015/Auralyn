import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

interface TriageResult {
  disposition?: string;
  safetyDisposition?: string;
  recommendation?: string;
  confidence?: number;
  [key: string]: unknown;
}

function QuickDecision({ d }: { d: string }) {
  const colorMap: Record<string, string> = {
    "ER_NOW":     "text-red-400",
    "URGENT":     "text-orange-400",
    "ROUTINE":    "text-green-400",
    "MONITORING": "text-blue-400",
  };
  return (
    <div
      data-testid="quick-decision"
      className={`text-4xl font-black tracking-tight ${colorMap[d] ?? "text-white"}`}
    >
      {d}
    </div>
  );
}

export default function PhysicianCopilot() {
  const [complaint, setComplaint] = useState("");
  const [result, setResult]       = useState<TriageResult | null>(null);

  const triage = useMutation({
    mutationFn: async (complaint: string) => {
      const res = await fetch("/api/triage/fast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaint, symptoms: [], vitals: {} }),
      });
      return res.json() as Promise<TriageResult>;
    },
    onSuccess: (data) => setResult(data),
  });

  const disposition = result?.safetyDisposition ?? result?.disposition ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-2xl font-bold mb-1">⚡ Physician Copilot</h1>
      <p className="text-gray-400 text-sm mb-6">2-second decision mode — type chief complaint, get instant disposition.</p>

      <div className="flex gap-3 mb-6">
        <input
          value={complaint}
          onChange={e => setComplaint(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && complaint.trim()) triage.mutate(complaint.trim()); }}
          placeholder="Chief complaint…"
          data-testid="input-complaint"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={() => complaint.trim() && triage.mutate(complaint.trim())}
          disabled={triage.isPending || !complaint.trim()}
          data-testid="button-triage"
          className="px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg font-semibold text-sm transition-colors"
        >
          {triage.isPending ? "Thinking…" : "Triage →"}
        </button>
      </div>

      {result && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6" data-testid="triage-result">
          {disposition && <QuickDecision d={disposition} />}
          {result.recommendation && (
            <p className="text-gray-300 text-sm mt-3">{result.recommendation}</p>
          )}
          {result.confidence != null && (
            <p className="text-gray-500 text-xs mt-2">Confidence: {(result.confidence * 100).toFixed(0)}%</p>
          )}
        </div>
      )}
    </div>
  );
}

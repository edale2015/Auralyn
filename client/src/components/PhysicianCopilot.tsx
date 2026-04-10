interface CaseData {
  complaint?: string;
  differential?: Array<{ diagnosis?: string; name?: string }>;
  risk?: string;
  disposition?: string;
  [key: string]: unknown;
}

interface PhysicianCopilotProps {
  caseData: CaseData;
  onOverride?: (disposition: string) => void;
}

export default function PhysicianCopilot({ caseData, onOverride }: PhysicianCopilotProps) {
  const topDx =
    caseData.differential?.[0]?.diagnosis ??
    caseData.differential?.[0]?.name ??
    "—";

  const riskColor =
    caseData.risk === "high" ? "text-red-400" :
    caseData.risk === "medium" ? "text-yellow-300" : "text-green-400";

  return (
    <div className="bg-gray-900 text-white p-4 rounded-xl space-y-2 border border-gray-700">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <span>🧠</span> AI Copilot
      </h2>

      <div className="text-sm space-y-1">
        <p>
          <span className="text-gray-400 font-medium">Complaint: </span>
          <span data-testid="copilot-complaint">{caseData.complaint ?? "—"}</span>
        </p>
        <p>
          <span className="text-gray-400 font-medium">Top Diagnosis: </span>
          <span data-testid="copilot-top-dx">{topDx}</span>
        </p>
        <p>
          <span className="text-gray-400 font-medium">Risk: </span>
          <span className={`font-bold ${riskColor}`} data-testid="copilot-risk">{caseData.risk ?? "—"}</span>
        </p>
      </div>

      <div className="mt-2 bg-gray-800 rounded-lg p-2 text-yellow-300 text-sm" data-testid="copilot-disposition">
        Suggested Action: <span className="font-bold">{caseData.disposition ?? "—"}</span>
      </div>

      {onOverride && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => onOverride("ER_NOW")}
            data-testid="button-override-er"
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded font-semibold"
          >
            🚨 Override → ER
          </button>
          <button
            onClick={() => onOverride("ROUTINE")}
            data-testid="button-override-routine"
            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs rounded font-semibold"
          >
            ✅ Override → Routine
          </button>
        </div>
      )}
    </div>
  );
}

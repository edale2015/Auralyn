type Props = {
  alerts: any[];
  suggestions: any[];
};

export default function DriftAlertsCard({ alerts, suggestions }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Drift Alerts & Tuning</h2>

      <div className="space-y-4">
        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Alerts</div>
          {alerts.length === 0 ? (
            <div className="text-sm text-slate-500">No active complaint drift alerts.</div>
          ) : (
            <div className="space-y-2">
              {alerts.map((a, idx) => (
                <div
                  key={idx}
                  data-testid={`drift-alert-${idx}`}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3"
                >
                  <div className="font-medium text-amber-900">{a.complaint}</div>
                  <div className="text-sm text-amber-800">
                    Failure rate: {(a.failureRate * 100).toFixed(1)}% | Safety miss:{" "}
                    {(a.safetyMissRate * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Tuning Suggestions</div>
          {suggestions.length === 0 ? (
            <div className="text-sm text-slate-500">No tuning suggestions generated.</div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s, idx) => (
                <div key={idx} className="rounded-xl bg-slate-50 p-3">
                  <div className="font-medium text-slate-900">{s.complaint}</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {(s.suggestions ?? []).map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

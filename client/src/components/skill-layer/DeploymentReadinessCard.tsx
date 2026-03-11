type Props = {
  result: any;
};

export default function DeploymentReadinessCard({ result }: Props) {
  const checks: any[] = result?.checks ?? [];
  const ready: boolean = result?.ready ?? false;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Deployment Readiness</h2>
        <span
          data-testid="readiness-status"
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            ready
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {ready ? "READY" : "NOT READY"}
        </span>
      </div>

      {checks.length === 0 ? (
        <div className="text-sm text-slate-500">No readiness checks available.</div>
      ) : (
        <div className="space-y-2">
          {checks.map((c, idx) => (
            <div
              key={idx}
              data-testid={`readiness-check-${idx}`}
              className={`flex items-start gap-2 rounded-xl p-2 ${
                c.passed ? "bg-green-50" : "bg-red-50"
              }`}
            >
              <span className="mt-0.5 text-sm">
                {c.passed ? "✓" : "✗"}
              </span>
              <div>
                <div className="text-sm font-medium text-slate-900">
                  {c.name}
                </div>
                <div className="text-xs text-slate-600">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

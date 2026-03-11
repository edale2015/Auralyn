type Props = {
  result: any;
};

export default function DeploymentReadinessCard({ result }: Props) {
  const checks = result?.checks ?? [];

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Deployment Readiness</h2>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            result?.ready ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {result?.ready ? "Ready" : "Not ready"}
        </span>
      </div>

      {!result && (
        <div className="text-sm text-slate-400">Loading...</div>
      )}

      <div className="space-y-2">
        {checks.map((check: any, idx: number) => (
          <div key={idx} className="rounded-xl bg-slate-50 p-3 text-sm">
            <div className="font-medium">{check.name}</div>
            <div className={check.passed ? "text-green-700" : "text-red-700"}>
              {check.passed ? "Pass" : "Fail"} | {check.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

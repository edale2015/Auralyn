type RedFlag = {
  id?: string;
  label?: string;
  severity?: string;
};

type Props = {
  redFlags: RedFlag[];
};

export default function RedFlagsCard({ redFlags }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Red Flags</h2>

      {redFlags.length === 0 ? (
        <div data-testid="red-flags-empty" className="text-sm text-slate-500">
          No red flags detected.
        </div>
      ) : (
        <div className="space-y-2">
          {redFlags.map((rf, idx) => (
            <div
              key={`${rf.id ?? rf.label ?? "rf"}_${idx}`}
              data-testid={`red-flag-item-${idx}`}
              className="rounded-xl border border-red-200 bg-red-50 p-3"
            >
              <div className="font-medium text-red-800">{rf.label ?? rf.id}</div>
              <div className="text-sm text-red-700">Severity: {rf.severity ?? "unknown"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

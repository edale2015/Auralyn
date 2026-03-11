type DifferentialItem = {
  diagnosis?: string;
  confidence?: number;
  supporting_findings?: string[];
};

type Props = {
  items: DifferentialItem[];
};

export default function DifferentialCard({ items }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Top Differential</h2>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div data-testid="differential-empty" className="text-sm text-slate-500">
            No differential available.
          </div>
        ) : (
          items.slice(0, 5).map((item, idx) => (
            <div
              key={`${item.diagnosis ?? "dx"}_${idx}`}
              data-testid={`differential-item-${idx}`}
              className="rounded-xl bg-slate-50 p-3"
            >
              <div className="font-medium text-slate-900">
                {idx + 1}. {item.diagnosis ?? "Unknown diagnosis"}
              </div>
              <div className="text-sm text-slate-600">
                Confidence:{" "}
                {typeof item.confidence === "number" ? item.confidence.toFixed(2) : "n/a"}
              </div>
              {!!item.supporting_findings?.length && (
                <div className="mt-1 text-xs text-slate-500">
                  Supports: {item.supporting_findings.join(" | ")}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

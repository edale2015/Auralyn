type Props = {
  note?: {
    hpi?: string;
    assessment?: string;
    plan?: string[];
    redFlags?: string[];
    disposition?: string;
  };
};

export default function ChartNoteCard({ note }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Chart Note</h2>

      {!note ? (
        <div data-testid="chart-note-empty" className="text-sm text-slate-500">
          No chart note generated.
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-1 font-medium text-slate-700">HPI</div>
            <div data-testid="chart-note-hpi" className="rounded-xl bg-slate-50 p-3">
              {note.hpi || "—"}
            </div>
          </div>

          <div>
            <div className="mb-1 font-medium text-slate-700">Assessment</div>
            <div data-testid="chart-note-assessment" className="rounded-xl bg-slate-50 p-3">
              {note.assessment || "—"}
            </div>
          </div>

          <div>
            <div className="mb-1 font-medium text-slate-700">Plan</div>
            <ul className="list-disc space-y-1 pl-5 text-slate-800">
              {(note.plan ?? []).map((p, idx) => (
                <li data-testid={`chart-note-plan-${idx}`} key={idx}>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 font-medium text-slate-700">Disposition</div>
            <div data-testid="chart-note-disposition" className="rounded-xl bg-slate-50 p-3">
              {note.disposition || "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

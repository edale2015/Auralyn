type Props = {
  rawText: string;
  complaintId?: string;
  modifiers?: Record<string, any>;
};

export default function CaseInputCard({ rawText, complaintId, modifiers }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Case Input</h2>

      <div className="mb-3">
        <div className="mb-1 text-sm font-medium text-slate-600">Patient input</div>
        <div data-testid="case-input-rawtext" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-800">
          {rawText || <span className="italic text-slate-400">No input yet</span>}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1 text-sm font-medium text-slate-600">Complaint</div>
        <div data-testid="case-input-complaint" className="text-sm text-slate-800">
          {complaintId || <span className="italic text-slate-400">Not identified yet</span>}
        </div>
      </div>

      <div>
        <div className="mb-1 text-sm font-medium text-slate-600">Modifiers</div>
        <pre data-testid="case-input-modifiers" className="overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-800">
          {JSON.stringify(modifiers ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}

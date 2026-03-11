type Props = {
  instructions?: {
    summary?: string;
    homeCare?: string[];
    followUp?: string[];
    returnPrecautions?: string[];
  };
};

export default function DischargeCard({ instructions }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Discharge Instructions</h2>

      {!instructions ? (
        <div data-testid="discharge-empty" className="text-sm text-slate-500">
          No discharge instructions generated.
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1 font-medium text-slate-700">Summary</div>
            <div data-testid="discharge-summary" className="rounded-xl bg-slate-50 p-3">
              {instructions.summary || "—"}
            </div>
          </div>

          <div>
            <div className="mb-1 font-medium text-slate-700">Home care</div>
            <ul className="list-disc space-y-1 pl-5">
              {(instructions.homeCare ?? []).map((item, idx) => (
                <li data-testid={`discharge-homecare-${idx}`} key={idx}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 font-medium text-slate-700">Follow up</div>
            <ul className="list-disc space-y-1 pl-5">
              {(instructions.followUp ?? []).map((item, idx) => (
                <li data-testid={`discharge-followup-${idx}`} key={idx}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 font-medium text-slate-700">Return precautions</div>
            <ul className="list-disc space-y-1 pl-5 text-red-700">
              {(instructions.returnPrecautions ?? []).map((item, idx) => (
                <li data-testid={`discharge-precaution-${idx}`} key={idx}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

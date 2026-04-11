type Props = {
  result: any;
};

export default function ClinicalConsistencyCard({ result }: Props) {
  if (!result?.canonical) return null;

  const c = result.canonical;

  const confidenceColor = {
    high:     "text-green-700 bg-green-50 border-green-200",
    moderate: "text-yellow-700 bg-yellow-50 border-yellow-200",
    low:      "text-red-700 bg-red-50 border-red-200",
  }[c.confidence as string] ?? "text-gray-700 bg-gray-50 border-gray-200";

  const dispositionBadge = {
    home_supportive_care: "bg-green-100 text-green-800",
    home_with_rx:         "bg-blue-100 text-blue-800",
    follow_up_primary_care: "bg-yellow-100 text-yellow-800",
    same_day_urgent_care: "bg-orange-100 text-orange-800",
    er_now:               "bg-red-100 text-red-800",
    hospital_admission:   "bg-purple-100 text-purple-800",
  }[c.disposition?.disposition as string] ?? "bg-gray-100 text-gray-800";

  return (
    <div className="rounded-2xl border border-gray-200 p-5 bg-white shadow-sm space-y-4" data-testid="clinical-consistency-card">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-gray-900">Clinical Consistency Engine</div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${confidenceColor}`} data-testid="confidence-band">
          {c.confidence} confidence
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Complaint</span>
          <div className="font-medium text-gray-900" data-testid="text-complaint">{c.complaint}</div>
        </div>
        <div>
          <span className="text-gray-500">Phenotype hash</span>
          <div className="font-mono text-xs text-gray-600">{c.phenotypeHash}</div>
        </div>
        <div>
          <span className="text-gray-500">Syndrome</span>
          <div className="font-medium text-gray-900" data-testid="text-syndrome">
            {c.winningSyndrome?.label ?? "No dominant syndrome"}
          </div>
        </div>
        <div>
          <span className="text-gray-500">Treatment</span>
          <div className="font-medium text-gray-900 capitalize" data-testid="text-treatment-class">
            {c.treatment?.class}
            {c.treatment?.medicationKey && (
              <span className="ml-1 text-xs text-gray-500">({c.treatment.medicationKey})</span>
            )}
          </div>
        </div>
        <div className="col-span-2">
          <span className="text-gray-500">Disposition</span>
          <div className="mt-0.5">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dispositionBadge}`} data-testid="text-disposition">
              {c.disposition?.disposition?.replace(/_/g, " ")}
            </span>
            {c.disposition?.urgency && (
              <span className="ml-2 text-xs text-gray-500">urgency {c.disposition.urgency}/5</span>
            )}
          </div>
        </div>
      </div>

      {c.notesForClinician?.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-1">Clinical reasoning</div>
          <ul className="list-disc pl-5 text-sm text-gray-600 space-y-0.5">
            {c.notesForClinician.map((n: string, i: number) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {c.treatment?.whyChosen?.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-1">Why this treatment</div>
          <ul className="list-disc pl-5 text-sm text-gray-600 space-y-0.5">
            {c.treatment.whyChosen.map((w: string, i: number) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {c.treatment?.blockedAlternatives?.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="text-xs font-medium text-gray-600 mb-1">Blocked alternatives (shotgun protection)</div>
          <div className="flex flex-wrap gap-1">
            {c.treatment.blockedAlternatives.map((alt: string, i: number) => (
              <span key={i} className="px-1.5 py-0.5 bg-gray-200 text-gray-700 text-xs rounded font-mono">
                {alt}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.variance?.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3" data-testid="variance-warnings">
          <div className="font-medium text-amber-900 text-sm mb-1">Variance warnings</div>
          <ul className="list-disc pl-5 text-sm text-amber-800 space-y-0.5">
            {result.variance.map((v: string, i: number) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

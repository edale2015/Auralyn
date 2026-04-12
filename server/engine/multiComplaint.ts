export interface ComplaintResult {
  complaint:    string;
  riskScore:    number;
  redFlags:     string[];
  diagnosis?:   string;
  probability?: number;
}

export interface FusedResult {
  dominantComplaint: string;
  totalRisk:         number;
  anyRedFlags:       boolean;
  allRedFlags:       string[];
  diagnoses:         string[];
  fusedDisposition:  string;
  rationale:         string;
}

export function fuseComplaints(results: ComplaintResult[]): FusedResult {
  if (results.length === 0) {
    return {
      dominantComplaint: "unknown",
      totalRisk:         0,
      anyRedFlags:       false,
      allRedFlags:       [],
      diagnoses:         [],
      fusedDisposition:  "follow_up_primary_care",
      rationale:         "No complaints provided",
    };
  }

  const fused = results.reduce(
    (acc, r) => {
      acc.totalRisk  += r.riskScore;
      acc.anyRedFlags = acc.anyRedFlags || r.redFlags.length > 0;
      acc.allRedFlags = [...acc.allRedFlags, ...r.redFlags];
      return acc;
    },
    { totalRisk: 0, anyRedFlags: false, allRedFlags: [] as string[] }
  );

  const dominant   = [...results].sort((a, b) => b.riskScore - a.riskScore)[0];
  const uniqueFlags = [...new Set(fused.allRedFlags)];

  let fusedDisposition = "follow_up_primary_care";
  if (fused.anyRedFlags)        fusedDisposition = "er_now";
  else if (fused.totalRisk > 0.7) fusedDisposition = "er_now";
  else if (fused.totalRisk > 0.5) fusedDisposition = "urgent_care";

  return {
    dominantComplaint: dominant.complaint,
    totalRisk:         Math.min(fused.totalRisk, 1.0),
    anyRedFlags:       fused.anyRedFlags,
    allRedFlags:       uniqueFlags,
    diagnoses:         results.map((r) => r.diagnosis ?? "unknown"),
    fusedDisposition,
    rationale:         `${results.length} complaints fused; dominant: ${dominant.complaint}, totalRisk: ${fused.totalRisk.toFixed(2)}`,
  };
}

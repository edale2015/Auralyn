export type ExecutiveSummaryInput = {
  clinicId: string;
  totalCases: number;
  safetyMode: string;
  marginPct: number;
  overrideRate: number;
  topComplaint: string;
};

export function buildExecutiveSummary(input: ExecutiveSummaryInput) {
  return {
    headline: `Clinic ${input.clinicId} processed ${input.totalCases} cases with ${input.marginPct}% margin`,
    summary: [
      `Current safety mode: ${input.safetyMode}`,
      `Override rate: ${(input.overrideRate * 100).toFixed(1)}%`,
      `Highest staffing pressure complaint: ${input.topComplaint}`,
      input.marginPct < 25
        ? "Margin is compressed and should be improved through safer automation expansion."
        : "Margin profile is healthy enough to support reinvestment."
    ]
  };
}

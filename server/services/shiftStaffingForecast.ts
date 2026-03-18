export type ShiftForecastInput = {
  hourBlock: string;
  expectedCases: number;
  avgRiskScore: number;
};

export function buildShiftStaffingForecast(rows: ShiftForecastInput[]) {
  return rows.map(row => {
    const recommendedClinicians = Math.ceil(row.expectedCases / 20 + row.avgRiskScore / 2);
    const recommendedHighRiskReviewers = row.avgRiskScore >= 3.5 ? 2 : 1;

    return {
      ...row,
      recommendedClinicians,
      recommendedHighRiskReviewers
    };
  });
}

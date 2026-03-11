export type SavedCaseDetail = {
  caseId?: string;
  skillRuns?: Array<{ inputSummary?: string }>;
  caseAudit?: { complaintId?: string; complaint_id?: string };
};

export async function getSavedCaseDetail(
  _caseId: string
): Promise<SavedCaseDetail | null> {
  return null;
}

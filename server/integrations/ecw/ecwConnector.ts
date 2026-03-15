export interface ECWCase {
  caseId: string;
  patientId?: string;
  complaint: string;
  disposition: string;
  notes?: string;
}

export function sendToECW(caseData: ECWCase): void {
  console.log('[ECW] Sending case to eClinicalWorks:', caseData.caseId);
}

export async function sendToECWAsync(caseData: ECWCase): Promise<{ success: boolean }> {
  console.log('[ECW] Async push to eClinicalWorks:', caseData.caseId);
  return { success: true };
}

import { firestoreCaseStore } from "./firestoreCaseStore";

export interface EcwPacket {
  caseId: string;
  patientName?: string;
  complaint: string;
  disposition: string;
  dxCandidates: { clusterId: string; score: number }[];
  noteDraft?: string;
  redFlags: string[];
  orders: string[];
  generatedAt: string;
}

export async function buildEcwPacket(caseId: string): Promise<EcwPacket | null> {
  const c = await firestoreCaseStore.getCase(caseId);
  if (!c) return null;

  return {
    caseId,
    patientName: (c as any).patientName ?? "Unknown",
    complaint: c.complaintId,
    disposition: c.engineResult?.recommendedDisposition ?? "unknown",
    dxCandidates: c.engineResult?.dxCandidates ?? [],
    noteDraft: c.noteDraft,
    redFlags: c.engineResult?.triggeredRedFlags ?? [],
    orders: c.engineResult?.orders ?? [],
    generatedAt: new Date().toISOString(),
  };
}

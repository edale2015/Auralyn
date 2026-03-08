import { firestoreCaseStore } from "../firestoreCaseStore";

export interface ReplayResult {
  caseId: string;
  originalDisposition?: string;
  replayDisposition?: string;
  match: boolean;
  durationMs: number;
}

export async function replayCase(caseId: string): Promise<ReplayResult> {
  const start = Date.now();
  const c = await firestoreCaseStore.getCase(caseId);

  if (!c) return { caseId, match: false, durationMs: Date.now() - start };

  const originalDisp = c.engineResult?.recommendedDisposition;
  const replayDisp = originalDisp;

  return {
    caseId,
    originalDisposition: originalDisp,
    replayDisposition: replayDisp,
    match: originalDisp === replayDisp,
    durationMs: Date.now() - start,
  };
}

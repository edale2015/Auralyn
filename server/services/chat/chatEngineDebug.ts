import { firestoreCaseStore } from "../firestoreCaseStore";
import { runEngineAdapterV2, type AdapterV2Result } from "./chatEngineAdapterV2";

export async function debugEngineForCase(caseId: string): Promise<AdapterV2Result | null> {
  const caseRecord = await firestoreCaseStore.getCase(caseId);
  if (!caseRecord) return null;
  return runEngineAdapterV2(caseRecord);
}

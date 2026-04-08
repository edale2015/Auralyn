export interface CaseMemoryEntry {
  id: string;
  caseId: string;
  iteration: number;
  timestamp: number;
  triage: string;
  urgencyScore: number;
  uncertainty: number;
  topDiagnosis: string;
  winnerAgent: string;
  questionAsked?: string;
  changedFromPrior: boolean;
}

const memoryStore = new Map<string, CaseMemoryEntry[]>();
const MAX_ENTRIES_PER_CASE = 50;

let _idCounter = 0;
function nextId() { return `mem_${Date.now()}_${++_idCounter}`; }

export function logCaseMemory(entry: Omit<CaseMemoryEntry, "id" | "timestamp">): CaseMemoryEntry {
  const full: CaseMemoryEntry = { ...entry, id: nextId(), timestamp: Date.now() };
  const arr = memoryStore.get(entry.caseId) ?? [];
  arr.push(full);
  if (arr.length > MAX_ENTRIES_PER_CASE) arr.splice(0, arr.length - MAX_ENTRIES_PER_CASE);
  memoryStore.set(entry.caseId, arr);
  return full;
}

export function getCaseMemory(caseId: string): CaseMemoryEntry[] {
  return memoryStore.get(caseId) ?? [];
}

export function getLastMemory(caseId: string): CaseMemoryEntry | null {
  const arr = memoryStore.get(caseId);
  return arr?.length ? arr[arr.length - 1] : null;
}

export function getAllActiveCases(): string[] {
  return [...memoryStore.keys()];
}

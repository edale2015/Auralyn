/**
 * In-memory symptom-to-diagnosis memory graph.
 * Accumulates case patterns over the session for population-level insight.
 * Backed by an in-memory Map — no DB migration required.
 */

export interface MemoryEntry {
  symptom:    string;
  diagnosis:  string;
  frequency:  number;
  lastSeen:   string;
}

const memory = new Map<string, MemoryEntry>();

function key(symptom: string, diagnosis: string) {
  return `${symptom.toLowerCase()}::${diagnosis.toLowerCase()}`;
}

export async function writeToMemoryGraph(
  caseData: { symptoms?: string[] | Record<string, boolean> },
  result:   { bayesianResult?: { topDiagnosis?: string }; final_diagnosis?: string; diagnosis?: string }
): Promise<void> {
  const symptoms: string[] = Array.isArray(caseData.symptoms)
    ? caseData.symptoms
    : Object.keys(caseData.symptoms ?? {}).filter((s) => (caseData.symptoms as any)[s]);

  const diagnosis = result.final_diagnosis ?? result.diagnosis ?? result.bayesianResult?.topDiagnosis ?? "unknown";
  const now       = new Date().toISOString();

  for (const symptom of symptoms) {
    const s   = symptom.toLowerCase();
    const d   = diagnosis.toLowerCase();
    const k   = key(s, d);
    const cur = memory.get(k);
    if (cur) {
      cur.frequency++;
      cur.lastSeen = now;
    } else {
      memory.set(k, { symptom: s, diagnosis: d, frequency: 1, lastSeen: now });
    }
  }
}

export function readMemoryGraph(): MemoryEntry[] {
  return [...memory.values()].sort((a, b) => b.frequency - a.frequency);
}

export function queryMemory(symptom: string): MemoryEntry[] {
  const s = symptom.toLowerCase();
  return [...memory.values()].filter((e) => e.symptom === s).sort((a, b) => b.frequency - a.frequency);
}

export function memorySize(): number {
  return memory.size;
}

export function clearMemory(): void {
  memory.clear();
}

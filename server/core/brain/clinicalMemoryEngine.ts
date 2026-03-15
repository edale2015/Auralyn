import fs from 'fs';
import path from 'path';
import { BrainCaseInput, MemoryRetrieveResult, RankedItem } from '../../../shared/brainEngineTypes';

const MEMORY_PATH = path.join(process.cwd(), 'brain_memory.ndjson');

function jaccard(a: Set<string>, b: Set<string>): number {
  const i = [...a].filter((x) => b.has(x)).length;
  const u = new Set([...a, ...b]).size || 1;
  return i / u;
}

export function retrieveClinicalMemory(input: BrainCaseInput): MemoryRetrieveResult {
  if (!fs.existsSync(MEMORY_PATH)) return { matches: [] };
  const current = new Set(input.symptoms);
  const lines = fs.readFileSync(MEMORY_PATH, 'utf8').split('\n').filter(Boolean);
  const matches = lines
    .map((line) => JSON.parse(line))
    .map((row) => ({
      caseId: row.caseId,
      complaint: row.complaint,
      similarity: jaccard(current, new Set(row.symptoms || [])),
      outcome: row.disposition,
      diagnoses: (row.aggregatedDifferentials || []) as RankedItem[]
    }))
    .filter((m) => m.similarity > 0.2)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
  return { matches };
}

export function storeClinicalMemory(payload: Record<string, unknown>): void {
  fs.appendFileSync(MEMORY_PATH, JSON.stringify(payload) + '\n');
}

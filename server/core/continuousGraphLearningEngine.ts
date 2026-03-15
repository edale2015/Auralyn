import fs from 'node:fs';
import path from 'node:path';
import type { MegaGraphEdge } from '../../shared/clinicalEngineTypes';

const LEARNED_EDGES_FILE = path.join(process.cwd(), 'learned_graph_edges.ndjson');

export interface LearnedEdge extends MegaGraphEdge {
  learnedAt: string;
  supportCount: number;
  sourceType: 'physician_feedback' | 'case_outcome' | 'literature' | 'simulation';
}

export function recordLearnedEdge(edge: Omit<LearnedEdge, 'learnedAt'>): void {
  const entry: LearnedEdge = { ...edge, learnedAt: new Date().toISOString() };
  fs.appendFileSync(LEARNED_EDGES_FILE, JSON.stringify(entry) + '\n');
}

export function loadLearnedEdges(): LearnedEdge[] {
  if (!fs.existsSync(LEARNED_EDGES_FILE)) return [];
  return fs.readFileSync(LEARNED_EDGES_FILE, 'utf8')
    .split('\n').filter(Boolean)
    .map((l) => JSON.parse(l) as LearnedEdge);
}

export function getTopLearnedEdges(minSupport = 3, limit = 50): LearnedEdge[] {
  const edges = loadLearnedEdges();
  const counts: Record<string, LearnedEdge & { supportCount: number }> = {};
  edges.forEach((e) => {
    const key = `${e.from}→${e.to}→${e.relation}`;
    if (!counts[key]) counts[key] = { ...e, supportCount: 0 };
    counts[key].supportCount++;
    counts[key].weight = (counts[key].weight ?? 0) + (e.weight ?? 1);
  });
  return Object.values(counts)
    .filter((e) => e.supportCount >= minSupport)
    .sort((a, b) => b.supportCount - a.supportCount)
    .slice(0, limit);
}

export function proposeGraphExpansion(
  existingEdges: MegaGraphEdge[],
  minSupport = 3
): { toAdd: LearnedEdge[]; toStrengthen: LearnedEdge[] } {
  const learned = getTopLearnedEdges(minSupport);
  const existingKeys = new Set(existingEdges.map((e) => `${e.from}→${e.to}→${e.relation}`));

  const toAdd = learned.filter((e) => !existingKeys.has(`${e.from}→${e.to}→${e.relation}`));
  const toStrengthen = learned.filter((e) => existingKeys.has(`${e.from}→${e.to}→${e.relation}`));

  return { toAdd, toStrengthen };
}

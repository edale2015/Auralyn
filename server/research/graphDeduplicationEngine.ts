export interface GraphEdge {
  from: string;
  relation: string;
  to: string;
  weight?: number;
  sourceType?: string;
  [key: string]: unknown;
}

export interface DeduplicationResult {
  deduped: GraphEdge[];
  removed: number;
  duplicates: string[];
  total: number;
}

export function graphDeduplicationEngine(edges: GraphEdge[]): DeduplicationResult {
  const seen = new Set<string>();
  const deduped: GraphEdge[] = [];
  const duplicates: string[] = [];

  for (const e of edges) {
    const key = `${e.from}::${e.relation ?? 'related'}::${e.to}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(e);
    } else {
      duplicates.push(key);
    }
  }

  return {
    deduped,
    removed: edges.length - deduped.length,
    duplicates,
    total: edges.length,
  };
}

export function mergeEdgeWeights(edges: GraphEdge[]): GraphEdge[] {
  const map = new Map<string, GraphEdge>();

  for (const e of edges) {
    const key = `${e.from}::${e.relation ?? 'related'}::${e.to}`;
    if (map.has(key)) {
      const existing = map.get(key)!;
      const existW = (existing.weight ?? 0.5);
      const newW = (e.weight ?? 0.5);
      map.set(key, { ...existing, weight: Math.min(1.0, (existW + newW) / 2 + 0.05) });
    } else {
      map.set(key, e);
    }
  }

  return Array.from(map.values());
}

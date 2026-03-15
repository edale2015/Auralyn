export type EdgeRelation = 'causes' | 'indicates' | 'rules_out' | 'requires' | 'treats' | 'worsens' | 'protects_against';

export interface ExtractedEdge {
  from: string;
  to: string;
  relation: EdgeRelation;
  confidence: number;
  source: string;
}

const RELATION_KEYWORDS: Record<string, { keyword: string; relation: EdgeRelation; confidence: number }[]> = {
  causes: [
    { keyword: 'causes', relation: 'causes', confidence: 0.9 },
    { keyword: 'leads to', relation: 'causes', confidence: 0.85 },
    { keyword: 'results in', relation: 'causes', confidence: 0.8 },
    { keyword: 'produces', relation: 'causes', confidence: 0.75 },
  ],
  indicates: [
    { keyword: 'indicates', relation: 'indicates', confidence: 0.85 },
    { keyword: 'suggests', relation: 'indicates', confidence: 0.7 },
    { keyword: 'is associated with', relation: 'indicates', confidence: 0.65 },
    { keyword: 'predicts', relation: 'indicates', confidence: 0.8 },
  ],
  rules_out: [
    { keyword: 'rules out', relation: 'rules_out', confidence: 0.9 },
    { keyword: 'excludes', relation: 'rules_out', confidence: 0.85 },
    { keyword: 'makes unlikely', relation: 'rules_out', confidence: 0.7 },
  ],
  requires: [
    { keyword: 'requires', relation: 'requires', confidence: 0.85 },
    { keyword: 'needs', relation: 'requires', confidence: 0.8 },
    { keyword: 'warrants', relation: 'requires', confidence: 0.75 },
  ],
  treats: [
    { keyword: 'treats', relation: 'treats', confidence: 0.9 },
    { keyword: 'manages', relation: 'treats', confidence: 0.8 },
    { keyword: 'is used for', relation: 'treats', confidence: 0.75 },
  ],
  worsens: [
    { keyword: 'worsens', relation: 'worsens', confidence: 0.85 },
    { keyword: 'exacerbates', relation: 'worsens', confidence: 0.85 },
    { keyword: 'aggravates', relation: 'worsens', confidence: 0.8 },
  ],
  protects_against: [
    { keyword: 'protects against', relation: 'protects_against', confidence: 0.85 },
    { keyword: 'prevents', relation: 'protects_against', confidence: 0.8 },
    { keyword: 'reduces risk of', relation: 'protects_against', confidence: 0.75 },
  ],
};

const ALL_PATTERNS = Object.values(RELATION_KEYWORDS).flat();

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, '_');
}

export function clinicalKnowledgeExtractionEngine(
  text: string,
  source = 'manual'
): ExtractedEdge[] {
  const edges: ExtractedEdge[] = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    // ── Arrow notation: "X -> Y" ─────────────────────────────────────────
    if (lower.includes('->')) {
      const parts = line.split('->');
      if (parts.length === 2) {
        edges.push({
          from: normalize(parts[0]),
          to: normalize(parts[1]),
          relation: 'causes',
          confidence: 0.7,
          source,
        });
      }
      continue;
    }

    // ── Natural language pattern matching ────────────────────────────────
    for (const { keyword, relation, confidence } of ALL_PATTERNS) {
      const idx = lower.indexOf(keyword);
      if (idx === -1) continue;

      const fromRaw = line.slice(0, idx).trim();
      const toRaw = line.slice(idx + keyword.length).trim();

      if (fromRaw.length > 0 && toRaw.length > 0) {
        // Strip trailing punctuation
        const to = toRaw.replace(/[.,;:!?]+$/, '').trim();
        edges.push({
          from: normalize(fromRaw),
          to: normalize(to),
          relation,
          confidence,
          source,
        });
        break;
      }
    }
  }

  // Deduplicate by from+to+relation
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.from}→${e.to}→${e.relation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractFromCsv(csv: string, source = 'csv'): ExtractedEdge[] {
  const edges: ExtractedEdge[] = [];
  const lines = csv.split('\n').filter(Boolean);
  // skip header
  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 3) {
      edges.push({
        from: normalize(parts[0]),
        to: normalize(parts[1]),
        relation: (parts[2].trim() as EdgeRelation) || 'causes',
        confidence: parts[3] ? parseFloat(parts[3]) : 0.75,
        source,
      });
    }
  }
  return edges;
}

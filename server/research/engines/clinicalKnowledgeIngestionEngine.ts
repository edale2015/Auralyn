import type { KnowledgeEdge, RelationType, EvidenceStrength } from '../types/researchTypes';
import { getSource } from '../sourceRegistry';

const PATTERN_MAP: { keyword: string; relation: RelationType; confidence: number }[] = [
  { keyword: 'causes', relation: 'causes', confidence: 0.9 },
  { keyword: 'leads to', relation: 'causes', confidence: 0.85 },
  { keyword: 'results in', relation: 'causes', confidence: 0.8 },
  { keyword: 'indicates', relation: 'indicates', confidence: 0.85 },
  { keyword: 'suggests', relation: 'indicates', confidence: 0.7 },
  { keyword: 'is associated with', relation: 'associated_with', confidence: 0.65 },
  { keyword: 'rules out', relation: 'rules_out', confidence: 0.9 },
  { keyword: 'excludes', relation: 'rules_out', confidence: 0.85 },
  { keyword: 'requires', relation: 'requires', confidence: 0.85 },
  { keyword: 'warrants', relation: 'requires', confidence: 0.75 },
  { keyword: 'treats', relation: 'treats', confidence: 0.9 },
  { keyword: 'manages', relation: 'treats', confidence: 0.8 },
  { keyword: 'worsens', relation: 'worsens', confidence: 0.85 },
  { keyword: 'exacerbates', relation: 'worsens', confidence: 0.85 },
];

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function tierToStrength(tier?: number): EvidenceStrength {
  if (tier === 1) return 'high';
  if (tier === 2) return 'moderate';
  if (tier === 3) return 'low';
  return 'unknown';
}

export function clinicalKnowledgeIngestionEngine(
  text: string,
  sourceId: string
): KnowledgeEdge[] {
  const edges: KnowledgeEdge[] = [];
  const source = getSource(sourceId);
  const evidenceStrength = tierToStrength(source?.authorityTier);
  const sourceTitle = source?.title ?? sourceId;
  const requiresHumanReview = source?.requiresHumanReview ?? true;

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('//')) continue;

    const lower = line.toLowerCase();

    // ── Arrow notation ─────────────────────────────────────────────────────
    if (lower.includes('->')) {
      const parts = line.split('->');
      if (parts.length === 2) {
        const from = normalize(parts[0]);
        const to = normalize(parts[1]);
        const key = `${from}|${to}|causes`;
        if (from && to && !seen.has(key)) {
          seen.add(key);
          edges.push({ from, to, relation: 'causes', confidence: 0.7, provenance: { sourceId, sourceTitle, extractedAt: new Date().toISOString(), evidenceStrength, reviewedByHuman: false, approvedForClinicalUse: false } });
        }
      }
      continue;
    }

    // ── NLP pattern matching ──────────────────────────────────────────────
    for (const { keyword, relation, confidence } of PATTERN_MAP) {
      const idx = lower.indexOf(keyword);
      if (idx === -1) continue;
      const fromRaw = line.slice(0, idx).trim();
      const toRaw = line.slice(idx + keyword.length).trim().replace(/[.,;!?]+$/, '');
      if (!fromRaw || !toRaw) continue;
      const from = normalize(fromRaw);
      const to = normalize(toRaw);
      const key = `${from}|${to}|${relation}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from, to, relation, confidence, provenance: { sourceId, sourceTitle, extractedAt: new Date().toISOString(), evidenceStrength, reviewedByHuman: false, approvedForClinicalUse: !requiresHumanReview && evidenceStrength === 'high' } });
      }
      break;
    }
  }

  return edges;
}

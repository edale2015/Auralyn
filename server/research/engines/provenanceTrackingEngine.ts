import type { KnowledgeEdge, EvidenceStrength } from '../types/researchTypes';

export interface ProvenanceReport {
  edge: KnowledgeEdge;
  provenanceChain: string;
  trustScore: number;
  safeForClinicalUse: boolean;
  warnings: string[];
}

export function attachProvenance(
  edge: KnowledgeEdge,
  sourceTitle: string,
  options?: { reviewedBy?: string; reviewedAt?: string; reviewNotes?: string }
): KnowledgeEdge {
  return {
    ...edge,
    provenance: {
      sourceId: edge.provenance?.sourceId ?? 'unknown',
      sourceTitle,
      extractedAt: edge.provenance?.extractedAt ?? new Date().toISOString(),
      evidenceStrength: edge.provenance?.evidenceStrength ?? 'unknown',
      reviewedByHuman: options?.reviewedBy ? true : (edge.provenance?.reviewedByHuman ?? false),
      approvedForClinicalUse: edge.provenance?.approvedForClinicalUse ?? false,
      reviewedBy: options?.reviewedBy,
      reviewedAt: options?.reviewedAt ?? (options?.reviewedBy ? new Date().toISOString() : undefined),
      reviewNotes: options?.reviewNotes,
    },
  };
}

function strengthToScore(s: EvidenceStrength): number {
  return { high: 0.9, moderate: 0.65, low: 0.35, unknown: 0.1 }[s] ?? 0.1;
}

export function buildProvenanceReport(edge: KnowledgeEdge): ProvenanceReport {
  const warnings: string[] = [];
  const p = edge.provenance;

  if (!p) return { edge, provenanceChain: 'No provenance', trustScore: 0, safeForClinicalUse: false, warnings: ['No provenance attached'] };

  let trustScore = strengthToScore(p.evidenceStrength);
  if (p.reviewedByHuman) trustScore = Math.min(trustScore + 0.2, 1.0);
  if (p.approvedForClinicalUse) trustScore = Math.min(trustScore + 0.1, 1.0);
  if (!edge.from || !edge.to) { warnings.push('Incomplete edge (missing from/to)'); trustScore *= 0.3; }
  if (p.evidenceStrength === 'unknown') warnings.push('Evidence strength not assessed');
  if (!p.reviewedByHuman) warnings.push('Awaiting human review before clinical use');

  const provenanceChain = [
    `Source: ${p.sourceTitle} (${p.sourceId})`,
    `Extracted: ${new Date(p.extractedAt).toLocaleDateString()}`,
    `Evidence: ${p.evidenceStrength}`,
    p.reviewedBy ? `Reviewed by: ${p.reviewedBy}` : 'Pending review',
  ].join(' → ');

  return {
    edge,
    provenanceChain,
    trustScore: Math.round(trustScore * 100) / 100,
    safeForClinicalUse: p.approvedForClinicalUse && p.reviewedByHuman,
    warnings,
  };
}

export function rankByProvenance(edges: KnowledgeEdge[]): KnowledgeEdge[] {
  return [...edges].sort((a, b) => {
    const scoreA = strengthToScore(a.provenance?.evidenceStrength ?? 'unknown') + (a.provenance?.reviewedByHuman ? 0.3 : 0);
    const scoreB = strengthToScore(b.provenance?.evidenceStrength ?? 'unknown') + (b.provenance?.reviewedByHuman ? 0.3 : 0);
    return scoreB - scoreA;
  });
}

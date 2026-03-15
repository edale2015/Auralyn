import type { KnowledgeEdge, PromotionResult } from '../types/researchTypes';

export interface PromotionOptions {
  reviewerName: string;
  reviewerRole?: 'physician' | 'admin' | 'researcher';
  batchNotes?: string;
  promoteAll?: boolean;
}

export function sourcePromotionEngine(
  edges: KnowledgeEdge[],
  options?: PromotionOptions
): PromotionResult {
  const promoted: KnowledgeEdge[] = [];
  const pendingReview: KnowledgeEdge[] = [];

  for (const e of edges) {
    const p = e.provenance;
    const isReviewed = p?.reviewedByHuman || options?.promoteAll;
    const isTrusted = p?.evidenceStrength === 'high' || p?.evidenceStrength === 'moderate';
    const isComplete = e.from && e.to && e.relation;

    if (isComplete && (isReviewed || isTrusted)) {
      const promotedEdge: KnowledgeEdge = {
        ...e,
        provenance: {
          ...p!,
          reviewedByHuman: true,
          approvedForClinicalUse: true,
          reviewedBy: options?.reviewerName ?? p?.reviewedBy ?? 'system',
          reviewedAt: new Date().toISOString(),
          reviewNotes: options?.batchNotes ?? p?.reviewNotes,
        },
      };
      promoted.push(promotedEdge);
    } else {
      pendingReview.push(e);
    }
  }

  return { promoted, pendingReview, totalPromoted: promoted.length };
}

export function approveEdge(
  edge: KnowledgeEdge,
  reviewedBy: string,
  notes?: string
): KnowledgeEdge {
  return {
    ...edge,
    provenance: {
      ...edge.provenance!,
      reviewedByHuman: true,
      approvedForClinicalUse: true,
      reviewedBy,
      reviewedAt: new Date().toISOString(),
      reviewNotes: notes,
    },
  };
}

export function rejectEdge(edge: KnowledgeEdge, reason: string): KnowledgeEdge {
  return {
    ...edge,
    provenance: {
      ...edge.provenance!,
      reviewedByHuman: true,
      approvedForClinicalUse: false,
      reviewNotes: `REJECTED: ${reason}`,
    },
  };
}

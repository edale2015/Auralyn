// Clinical knowledge registry.
//
// The single end-of-conversation lookup that hydrates the physician packet.
// One entry per complaint protocol.

import { NEURO_HEADACHE_KNOWLEDGE, type ClinicalKnowledge } from "./neuroHeadache";

const KNOWLEDGE: Record<string, ClinicalKnowledge> = {
  neuro_headache: NEURO_HEADACHE_KNOWLEDGE,
};

export function getClinicalKnowledge(slug: string): ClinicalKnowledge | null {
  return KNOWLEDGE[slug] ?? null;
}

export type { ClinicalKnowledge };

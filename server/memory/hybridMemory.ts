import { addNode, queryNodes, listAllNodes, MemoryNode } from "./memoryGraph";

export interface HybridMemoryRecord {
  id: string;
  type: string;
  data: Record<string, any>;
  embedding?: number[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const embeddingStore = new Map<string, number[]>();

export async function storeMemory(node: Omit<HybridMemoryRecord, "embedding"> & { embedding?: number[] }): Promise<MemoryNode> {
  const memNode = addNode({
    id: node.id,
    type: node.type as any,
    label: `${node.type}: ${node.id}`,
    data: node.data,
    tags: [node.type],
  });

  if (node.embedding?.length) {
    embeddingStore.set(node.id, node.embedding);
  }

  return memNode;
}

export async function vectorSearch(queryEmbedding: number[], topK = 5): Promise<Array<MemoryNode & { similarity: number }>> {
  if (!queryEmbedding.length) {
    return listAllNodes().slice(0, topK).map(n => ({ ...n, similarity: 0 }));
  }

  const scored: Array<{ node: MemoryNode; similarity: number }> = [];

  for (const node of listAllNodes()) {
    const emb = embeddingStore.get(node.id);
    const similarity = emb ? cosineSimilarity(queryEmbedding, emb) : 0;
    scored.push({ node, similarity });
  }

  return scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map(({ node, similarity }) => ({ ...node, similarity }));
}

export async function logClinicalDecision(input: {
  patientId?: string;
  centor?: number;
  curb?: number;
  complaints?: string[];
  vitals?: Record<string, any>;
  embedding?: number[];
}): Promise<MemoryNode> {
  const id = `decision-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return storeMemory({
    id,
    type: "clinical_decision",
    data: {
      patientId: input.patientId,
      centor: input.centor,
      curb: input.curb,
      complaints: input.complaints,
      vitals: input.vitals,
      scoredAt: new Date().toISOString(),
    },
    embedding: input.embedding,
  });
}

export async function logReplay(replay: {
  replayId: string;
  templateId: string;
  status: string;
  embedding?: number[];
}): Promise<MemoryNode> {
  return storeMemory({
    id: `replay-${replay.replayId}`,
    type: "replay",
    data: {
      replayId: replay.replayId,
      templateId: replay.templateId,
      status: replay.status,
      loggedAt: new Date().toISOString(),
    },
    embedding: replay.embedding,
  });
}

export function getEmbeddingStoreSize(): number {
  return embeddingStore.size;
}

import { storeMemory, vectorSearch } from "./hybridMemory";
import { auditLog } from "../security/auditLogger";

export interface CaseMemoryInput {
  caseId: string;
  patientId?: string;
  complaint: string;
  diagnosis?: string;
  disposition?: string;
  riskScore?: number;
  symptoms?: string[];
  protocol?: string;
  outcome?: string;
  physicianId?: string;
  context?: Record<string, unknown>;
}

export interface SimilarCase {
  caseId: string;
  complaint: string;
  diagnosis?: string;
  disposition?: string;
  riskScore?: number;
  similarity: number;
  outcome?: string;
}

function textToEmbedding(text: string, dims = 64): number[] {
  const v = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % dims] += text.charCodeAt(i) / 255;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export async function storeCaseMemory(caseData: CaseMemoryInput): Promise<void> {
  const content = [
    `complaint: ${caseData.complaint}`,
    caseData.diagnosis ? `diagnosis: ${caseData.diagnosis}` : "",
    caseData.disposition ? `disposition: ${caseData.disposition}` : "",
    caseData.symptoms?.length ? `symptoms: ${caseData.symptoms.join(", ")}` : "",
    caseData.outcome ? `outcome: ${caseData.outcome}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  const embedding = textToEmbedding(content);

  await storeMemory({
    id: `case_${caseData.caseId}`,
    type: "case",
    data: {
      caseId: caseData.caseId,
      patientId: caseData.patientId,
      complaint: caseData.complaint,
      diagnosis: caseData.diagnosis,
      disposition: caseData.disposition,
      riskScore: caseData.riskScore,
      outcome: caseData.outcome,
      physicianId: caseData.physicianId,
      storedAt: new Date().toISOString(),
    },
    embedding,
  });

  auditLog({
    actor: "case_memory_store",
    action: "case_stored",
    patientId: caseData.patientId,
    details: { caseId: caseData.caseId, complaint: caseData.complaint },
  });
}

export async function findSimilarCases(query: string, topK = 5): Promise<SimilarCase[]> {
  const queryEmbedding = textToEmbedding(query);
  const results = await vectorSearch(queryEmbedding, topK);

  auditLog({
    actor: "case_memory_store",
    action: "similarity_search",
    details: { query: query.slice(0, 80), topK, found: results.length },
  });

  return results
    .filter((r) => r.data?.caseId)
    .map((r) => ({
      caseId: r.data.caseId as string,
      complaint: r.data.complaint as string,
      diagnosis: r.data.diagnosis as string | undefined,
      disposition: r.data.disposition as string | undefined,
      riskScore: r.data.riskScore as number | undefined,
      outcome: r.data.outcome as string | undefined,
      similarity: r.similarity,
    }));
}

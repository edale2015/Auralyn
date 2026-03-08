import { firestoreCaseStore } from "./firestoreCaseStore";

export interface ExportManifest {
  totalCases: number;
  exportedCases: number;
  pendingCases: number;
  manifests: { caseId: string; complaintId: string; status: string; exportedAt?: string }[];
}

export async function buildExportManifest(): Promise<ExportManifest> {
  const cases = await firestoreCaseStore.listCases({ limit: 200 });

  const manifests = cases.map((c) => ({
    caseId: c.caseId,
    complaintId: c.complaintId,
    status: c.exportedAt ? "exported" : c.status === "APPROVED" ? "ready" : "pending",
    exportedAt: c.exportedAt,
  }));

  return {
    totalCases: cases.length,
    exportedCases: manifests.filter((m) => m.status === "exported").length,
    pendingCases: manifests.filter((m) => m.status !== "exported").length,
    manifests,
  };
}

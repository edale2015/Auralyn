import fs from "fs";
import path from "path";
import { firestoreCaseStore } from "./firestoreCaseStore";
import { firestoreSignoffStore } from "./firestoreSignoffStore";
import { firestoreCaseEventsStore } from "./firestoreCaseEvents";
import { firestoreRuntimeMetricsStore } from "./firestoreRuntimeMetrics";
import { buildEcwExportJson, buildEcwExportText } from "../templates/ecwExportTemplates";

export interface EcwExportResult {
  caseId: string;
  exportDir: string;
  textPath: string;
  jsonPath: string;
}

function safeName(s: string): string {
  return (s || "unknown")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export class EcwSidecarExportService {
  async exportCase(caseId: string): Promise<EcwExportResult> {
    const caseRecord = await firestoreCaseStore.getCase(caseId);
    if (!caseRecord) throw new Error(`Case not found: ${caseId}`);

    const signoffs = await firestoreSignoffStore.listSignoffsForCase(caseId);
    const latest = signoffs.length ? signoffs[signoffs.length - 1] : null;

    const patientName = [
      caseRecord.patientContext?.firstName,
      caseRecord.patientContext?.lastName
    ].filter(Boolean).join(" ").trim() || undefined;

    const payload = {
      caseId,
      patientName,
      dob: caseRecord.patientContext?.dob,
      sex: caseRecord.patientContext?.sex,
      complaintLabel: caseRecord.complaintLabel || caseRecord.complaintId,
      noteDraft: caseRecord.noteDraft,
      physicianSummary: caseRecord.physicianSummary,
      engineDisposition: caseRecord.engineResult?.recommendedDisposition,
      finalDisposition: latest?.finalDisposition || latest?.engineDisposition || caseRecord.engineResult?.recommendedDisposition,
      dxCandidates: latest?.override?.dxCandidates || caseRecord.engineResult?.dxCandidates || [],
      triggeredRedFlags: caseRecord.engineResult?.triggeredRedFlags || [],
      returnPrecautions: latest?.override?.returnPrecautions || caseRecord.engineResult?.returnPrecautions || [],
      reviewerName: latest?.reviewerName,
      reviewerId: latest?.reviewerId,
      reviewerRationale: latest?.rationale,
      signoffStatus: latest?.status,
      createdAt: caseRecord.createdAt
    };

    const root = process.cwd();
    const exportDir = path.join(
      root,
      "data",
      "exports",
      "ecw_sidecar",
      `${safeName(caseId)}_${safeName(caseRecord.complaintId)}`
    );

    fs.mkdirSync(exportDir, { recursive: true });

    const textPath = path.join(exportDir, "encounter_export.txt");
    const jsonPath = path.join(exportDir, "encounter_export.json");

    fs.writeFileSync(textPath, buildEcwExportText(payload), "utf8");
    fs.writeFileSync(jsonPath, JSON.stringify(buildEcwExportJson(payload), null, 2) + "\n", "utf8");

    await firestoreCaseStore.markExportedToEcw(caseId);

    await firestoreCaseEventsStore.appendEvent({
      caseId,
      type: "EXPORTED_ECW",
      actorRole: "system",
      summary: "Generated eCW sidecar export",
      payload: { textPath, jsonPath }
    });

    await firestoreRuntimeMetricsStore.logMetric({
      type: "EXPORT_ECW",
      caseId,
      complaintId: caseRecord.complaintId,
      disposition: payload.finalDisposition
    });

    return { caseId, exportDir, textPath, jsonPath };
  }
}

export const ecwSidecarExportService = new EcwSidecarExportService();

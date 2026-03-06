import { buildFullDraftNote } from "../templates/noteTemplates";
import { firestoreCaseStore } from "./firestoreCaseStore";
import type { CaseRecord } from "../types/case";

export type GeneratedNoteResult = {
  caseId: string;
  noteDraft: string;
  sections: {
    chiefComplaint: string;
    hpi: string;
    assessment: string;
    plan: string;
  };
};

function extractPatientName(caseRecord: CaseRecord): string | undefined {
  const first = caseRecord.patientContext?.firstName?.trim();
  const last = caseRecord.patientContext?.lastName?.trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || undefined;
}

export class NoteGeneratorService {
  async generateForCase(caseId: string): Promise<GeneratedNoteResult> {
    const caseRecord = await firestoreCaseStore.getCase(caseId);
    if (!caseRecord) {
      throw new Error(`Case not found: ${caseId}`);
    }

    const engine = caseRecord.engineResult;

    const input = {
      patientName: extractPatientName(caseRecord),
      ageYears: caseRecord.patientContext?.ageYears,
      sex: caseRecord.patientContext?.sex,
      complaintLabel: caseRecord.complaintLabel || caseRecord.complaintId,
      answers: caseRecord.answers || {},
      dxCandidates: engine?.dxCandidates || [],
      triggeredRedFlags: engine?.triggeredRedFlags || [],
      recommendedDisposition: engine?.recommendedDisposition || "UNKNOWN",
      winningClusterId: engine?.winningClusterId,
      returnPrecautions: engine?.returnPrecautions || [],
      physicianSummary: caseRecord.physicianSummary
    };

    const full = buildFullDraftNote(input);

    const result: GeneratedNoteResult = {
      caseId,
      noteDraft: full,
      sections: {
        chiefComplaint: input.complaintLabel || "Unknown complaint",
        hpi: full.match(/HPI\n([\s\S]*?)\n\nASSESSMENT/)?.[1]?.trim() || "",
        assessment: full.match(/ASSESSMENT\n([\s\S]*?)\n\nPLAN/)?.[1]?.trim() || "",
        plan: full.match(/PLAN\n([\s\S]*)$/)?.[1]?.trim() || ""
      }
    };

    await firestoreCaseStore.patchCase(caseId, {
      noteDraft: result.noteDraft
    });

    return result;
  }
}

export const noteGeneratorService = new NoteGeneratorService();

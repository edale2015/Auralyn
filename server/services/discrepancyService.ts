import { firestoreCaseStore } from "./firestoreCaseStore";
import { firestoreCaseEventsStore } from "./firestoreCaseEvents";
import { firestoreSignoffStore } from "./firestoreSignoffStore";
import type { CaseEventRecord, CaseRecord } from "../types/case";
import type { SignoffRecord } from "../types/signoff";

export type DiscrepancyType =
  | "DISPOSITION_MISMATCH"
  | "DX_TOP_MISMATCH"
  | "RED_FLAG_OVERRIDE"
  | "REQUEST_MORE_INFO"
  | "NO_DISCREPANCY";

export interface CaseDiscrepancy {
  caseId: string;
  complaintId: string;
  complaintLabel?: string;
  discrepancyType: DiscrepancyType;
  engineDisposition?: string;
  finalDisposition?: string;
  engineTopDx?: string;
  reviewerTopDx?: string;
  triggeredRedFlags: string[];
  signoffStatus?: string;
  rationale?: string;
  reviewerId?: string;
  createdAt?: string;
}

export interface CaseTimelinePayload {
  caseRecord: CaseRecord | null;
  events: CaseEventRecord[];
  signoffs: SignoffRecord[];
}

export class DiscrepancyService {
  async getTimeline(caseId: string): Promise<CaseTimelinePayload> {
    const [caseRecord, events, signoffs] = await Promise.all([
      firestoreCaseStore.getCase(caseId),
      firestoreCaseEventsStore.listEventsForCase(caseId),
      firestoreSignoffStore.listSignoffsForCase(caseId)
    ]);

    return { caseRecord, events, signoffs };
  }

  async getCaseDiscrepancy(caseId: string): Promise<CaseDiscrepancy | null> {
    const caseRecord = await firestoreCaseStore.getCase(caseId);
    if (!caseRecord) return null;

    const signoffs = await firestoreSignoffStore.listSignoffsForCase(caseId);
    const latest = signoffs.length ? signoffs[signoffs.length - 1] : null;

    const engineDisposition = caseRecord.engineResult?.recommendedDisposition;
    const finalDisposition = latest?.finalDisposition ?? latest?.engineDisposition ?? engineDisposition;

    const engineTopDx =
      caseRecord.engineResult?.dxCandidates?.[0]?.label ||
      caseRecord.engineResult?.dxCandidates?.[0]?.dxId ||
      "";

    const reviewerTopDx =
      latest?.override?.dxCandidates?.[0]?.label ||
      latest?.override?.dxCandidates?.[0]?.dxId ||
      "";

    let discrepancyType: DiscrepancyType = "NO_DISCREPANCY";

    if (latest?.status === "REQUEST_MORE_INFO") {
      discrepancyType = "REQUEST_MORE_INFO";
    } else if (engineDisposition && finalDisposition && engineDisposition !== finalDisposition) {
      discrepancyType = "DISPOSITION_MISMATCH";
    } else if (engineTopDx && reviewerTopDx && engineTopDx !== reviewerTopDx) {
      discrepancyType = "DX_TOP_MISMATCH";
    } else if (
      (caseRecord.engineResult?.triggeredRedFlags?.length ?? 0) > 0 &&
      latest?.status === "APPROVED_WITH_EDITS"
    ) {
      discrepancyType = "RED_FLAG_OVERRIDE";
    }

    return {
      caseId,
      complaintId: caseRecord.complaintId,
      complaintLabel: caseRecord.complaintLabel,
      discrepancyType,
      engineDisposition,
      finalDisposition,
      engineTopDx,
      reviewerTopDx,
      triggeredRedFlags: caseRecord.engineResult?.triggeredRedFlags ?? [],
      signoffStatus: latest?.status,
      rationale: latest?.rationale,
      reviewerId: latest?.reviewerId,
      createdAt: latest?.createdAt ?? caseRecord.updatedAt
    };
  }

  async listRecentDiscrepancies(limit = 100): Promise<CaseDiscrepancy[]> {
    const cases = await firestoreCaseStore.listCases({ limit });
    const out: CaseDiscrepancy[] = [];

    for (const c of cases) {
      if (!c.caseId) continue;
      const d = await this.getCaseDiscrepancy(c.caseId);
      if (!d) continue;
      if (d.discrepancyType !== "NO_DISCREPANCY") out.push(d);
    }

    out.sort((a, b) => {
      const av = a.createdAt ?? "";
      const bv = b.createdAt ?? "";
      return bv.localeCompare(av);
    });

    return out.slice(0, limit);
  }
}

export const discrepancyService = new DiscrepancyService();

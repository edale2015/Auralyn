import { firestoreCaseStore } from "./firestoreCaseStore";
import { firestoreSignoffStore } from "./firestoreSignoffStore";
import { firestoreRuntimeMetricsStore } from "./firestoreRuntimeMetrics";
import { discrepancyService } from "./discrepancyService";

export interface ComplaintAnalyticsRow {
  complaintId: string;
  complaintLabel?: string;
  caseCount: number;
  redFlagCaseCount: number;
  signedOffCount: number;
  overrideCount: number;
  disagreementCount: number;
}

export interface DispositionAnalyticsRow {
  disposition: string;
  count: number;
}

export interface TopDisagreementRow {
  caseId: string;
  complaintId: string;
  complaintLabel?: string;
  discrepancyType: string;
  engineDisposition?: string;
  finalDisposition?: string;
  reviewerId?: string;
  createdAt?: string;
}

export interface RuntimeAnalyticsSummary {
  totalCases: number;
  totalSignedOff: number;
  totalOverrides: number;
  totalDiscrepancies: number;
}

export interface RuntimeAnalyticsPayload {
  summary: RuntimeAnalyticsSummary;
  complaintMetrics: ComplaintAnalyticsRow[];
  dispositionMetrics: DispositionAnalyticsRow[];
  topDisagreements: TopDisagreementRow[];
}

export class RuntimeAnalyticsService {
  async buildDashboard(limitCases = 500): Promise<RuntimeAnalyticsPayload> {
    const cases = await firestoreCaseStore.listCases({ limit: limitCases });

    const complaintMap = new Map<string, ComplaintAnalyticsRow>();
    const dispositionCounts = new Map<string, number>();

    let totalSignedOff = 0;
    let totalOverrides = 0;

    for (const c of cases) {
      const key = c.complaintId;
      const existing = complaintMap.get(key) ?? {
        complaintId: c.complaintId,
        complaintLabel: c.complaintLabel,
        caseCount: 0,
        redFlagCaseCount: 0,
        signedOffCount: 0,
        overrideCount: 0,
        disagreementCount: 0
      };

      existing.caseCount += 1;

      if ((c.engineResult?.triggeredRedFlags?.length ?? 0) > 0) {
        existing.redFlagCaseCount += 1;
      }

      if (c.reviewStatus === "APPROVED" || c.reviewStatus === "OVERRIDDEN") {
        existing.signedOffCount += 1;
        totalSignedOff += 1;
      }

      if (c.reviewStatus === "OVERRIDDEN") {
        existing.overrideCount += 1;
        totalOverrides += 1;
      }

      const disposition = c.engineResult?.recommendedDisposition || "UNKNOWN";
      dispositionCounts.set(disposition, (dispositionCounts.get(disposition) ?? 0) + 1);

      complaintMap.set(key, existing);
    }

    const discrepancies = await discrepancyService.listRecentDiscrepancies(limitCases);

    for (const d of discrepancies) {
      const row = complaintMap.get(d.complaintId);
      if (row) row.disagreementCount += 1;
    }

    const topDisagreements: TopDisagreementRow[] = discrepancies.slice(0, 50).map((d) => ({
      caseId: d.caseId,
      complaintId: d.complaintId,
      complaintLabel: d.complaintLabel,
      discrepancyType: d.discrepancyType,
      engineDisposition: d.engineDisposition,
      finalDisposition: d.finalDisposition,
      reviewerId: d.reviewerId,
      createdAt: d.createdAt
    }));

    const complaintMetrics = [...complaintMap.values()].sort((a, b) => b.caseCount - a.caseCount);

    const dispositionMetrics: DispositionAnalyticsRow[] = [...dispositionCounts.entries()]
      .map(([disposition, count]) => ({ disposition, count }))
      .sort((a, b) => b.count - a.count);

    const summary: RuntimeAnalyticsSummary = {
      totalCases: cases.length,
      totalSignedOff,
      totalOverrides,
      totalDiscrepancies: discrepancies.length
    };

    return { summary, complaintMetrics, dispositionMetrics, topDisagreements };
  }

  async getComplaintDetail(complaintId: string, limitCases = 200) {
    const allCases = await firestoreCaseStore.listCases({ complaintId, limit: limitCases });

    const signoffs = await Promise.all(
      allCases
        .filter((c) => c.signoffId)
        .map(async (c) => ({
          caseId: c.caseId,
          signoffs: await firestoreSignoffStore.listSignoffsForCase(c.caseId)
        }))
    );

    const metrics = await firestoreRuntimeMetricsStore.listMetricsByComplaint(complaintId, 500);

    return { complaintId, cases: allCases, signoffs, metrics };
  }
}

export const runtimeAnalyticsService = new RuntimeAnalyticsService();

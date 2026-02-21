import { getTable } from "../../data/registry";
import type { CaseState } from "../../../shared/agentTypes";

type Row = Record<string, any>;

export interface SpotInterventionResult {
  count: number;
  interventionIds: string[];
}

export async function addSpotInterventions(state: CaseState): Promise<SpotInterventionResult> {
  const s = state as any;
  const disp = String(s.disposition || "");
  if (!disp) return { count: 0, interventionIds: [] };

  if (!["urgent_care", "er_send"].includes(disp)) {
    return { count: 0, interventionIds: [] };
  }

  const cc = String(s.normalizedComplaint || "");
  const topCluster = String((s.activeClusters && s.activeClusters[0]) || "");

  const rows: Row[] = await getTable("URGENT_CARE_SPOT_INTERVENTIONS");

  const filtered = rows.filter(r => {
    const rCc = String(r.CC_ID || r.cc_id || "");
    const rDisp = String(r.DISPOSITION || r.Disposition || r.DISPOSITION_LEVEL || "");
    const rCluster = String(r.CLUSTER_ID || r.Cluster_ID || "");
    if (rCc && rCc !== cc) return false;
    if (rDisp && rDisp !== disp) return false;
    if (rCluster && topCluster && rCluster !== topCluster) return false;
    return true;
  }).slice(0, 3);

  const interventions = filtered.map(r => ({
    interventionId: String(r.INTERVENTION_ID || r.Intervention_ID || r.Id || ""),
    contextCondition: String(r.CONTEXT || r.Context_Condition || cc),
    actions: String(r.ACTIONS || "").split(";").map((x: string) => x.trim()).filter(Boolean),
    testsIfAvailable: String(r.TESTS_IF_AVAILABLE || "").split(";").map((x: string) => x.trim()).filter(Boolean),
    doNotDo: String(r.DO_NOT_DO || "").split(";").map((x: string) => x.trim()).filter(Boolean),
    referralWindow: r.REFERRAL_WINDOW ? String(r.REFERRAL_WINDOW) : undefined,
    safetyClass: "spot_intervention" as const,
  }));

  s.spotInterventions = [
    ...(s.spotInterventions || []),
    ...interventions.map(i => ({
      ...i,
      erTriggers: [],
      source: "COMPLAINT_PIPELINE",
    })),
  ];

  for (const i of interventions) {
    s.recommendedActions = s.recommendedActions || [];
    s.recommendedActions.push({
      type: "URGENT_CARE_SPOT_INTERVENTION",
      priority: "high",
    });
  }

  return {
    count: interventions.length,
    interventionIds: interventions.map(i => i.interventionId),
  };
}

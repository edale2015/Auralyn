import { getTable } from "../data/registry";
import type { CaseState } from "../../shared/agentTypes";

export interface ClusterScore {
  cluster: string;
  score: number;
  sources: string[];
}

export interface DispositionResult {
  activeClusters: string[];
  clusterScores: ClusterScore[];
  dispositionCandidate: string;
  dispositionReason: string[];
  workupSuggestions: string[];
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

export async function resolveClusterDisposition(
  state: CaseState,
  defaultCluster: string,
  triageUpgradeTarget?: string
): Promise<DispositionResult> {
  const clusterScores = new Map<string, ClusterScore>();

  function addCluster(cluster: string, score: number, source: string) {
    const key = cluster.toUpperCase().replace(/[\s-]+/g, "_");
    if (!key) return;
    const existing = clusterScores.get(key);
    if (existing) {
      existing.score += score;
      existing.sources.push(source);
    } else {
      clusterScores.set(key, { cluster: key, score, sources: [source] });
    }
  }

  if (defaultCluster) {
    addCluster(defaultCluster, 10, "router_default");
  }

  for (const cluster of state.activeClusters ?? []) {
    addCluster(cluster, 5, "state_active");
  }

  if (state.ruleTrace) {
    for (const rule of state.ruleTrace) {
      if (rule.action === "SET_CLUSTER" && rule.detail) {
        const clusterVal = rule.detail.match(/SET_CLUSTER\(([^)]+)\)/)?.[1];
        if (clusterVal) addCluster(clusterVal, 8, `rule:${rule.ruleId}`);
      }
    }
  }

  for (const dx of state.diagnosisClusterIds ?? []) {
    addCluster(dx, 3, "dx_match");
  }

  if (state.system === "NEURO") {
    try {
      const triageRows = await getTable("NEURO_GLOBAL_TRIAGE");
      for (const row of triageRows) {
        const cluster = norm(row.Cluster);
        if (cluster) addCluster(cluster, 2, "neuro_triage");
      }
    } catch {
      // triage table may not exist
    }
  }

  const sorted = [...clusterScores.values()].sort((a, b) => b.score - a.score);
  const topClusters = sorted.slice(0, 3).map(c => c.cluster);

  let dispositionCandidate = "routine";
  const dispositionReason: string[] = [];

  if (triageUpgradeTarget) {
    dispositionCandidate = triageUpgradeTarget;
    dispositionReason.push(`Triage upgrade to ${triageUpgradeTarget}`);
  } else if (state.redFlags.length > 0) {
    dispositionCandidate = "ED";
    dispositionReason.push("Red flags present");
  } else if (sorted.length > 0) {
    const topCluster = sorted[0];
    try {
      const system = state.system ?? "";
      const dxTab = `${system}_DIAGNOSIS_MASTER`;
      const dxRows = await getTable(dxTab);
      const matchingDx = dxRows.find(
        r => norm(r.Cluster).toUpperCase() === topCluster.cluster
      );
      if (matchingDx) {
        const urgency = norm(matchingDx.Urgency_Default).toLowerCase();
        if (urgency === "ed" || urgency === "er") {
          dispositionCandidate = "ED";
          dispositionReason.push(`Diagnosis urgency: ${urgency}`);
        } else if (urgency === "urgent_care" || urgency === "uc") {
          dispositionCandidate = "urgent_care";
          dispositionReason.push(`Diagnosis urgency: ${urgency}`);
        } else {
          dispositionCandidate = urgency || "routine";
          dispositionReason.push(`Diagnosis urgency default: ${urgency || "routine"}`);
        }
      }
    } catch {
      // diagnosis master may not exist for this system
    }
  }

  if (dispositionReason.length === 0) {
    dispositionReason.push("Default routine disposition");
  }

  const workupSuggestions: string[] = [];
  for (const cs of sorted.slice(0, 2)) {
    workupSuggestions.push(`Evaluate for ${cs.cluster}`);
  }

  return {
    activeClusters: topClusters,
    clusterScores: sorted,
    dispositionCandidate,
    dispositionReason,
    workupSuggestions,
  };
}

import { getTable } from "../data/registry";
import type { CaseState } from "../../shared/agentTypes";

export interface ClusterMasterRow {
  clusterId: string;
  clusterName: string;
  system: string;
  defaultDisposition: string;
  escalationTarget: string;
  redFlagCriteria: string;
  baseRiskLevel: string;
  erThreshold: string;
  ucThreshold: string;
  pcThreshold: string;
  followupPlan: string;
  notes: string;
}

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
  matchedClusterRows: Array<{
    clusterId: string;
    defaultDisposition: string;
    escalationTarget: string;
    erThreshold: string;
    ucThreshold: string;
  }>;
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

function normalizeClusterId(s: string): string {
  return s.toUpperCase().replace(/[\s-]+/g, "_");
}

function parseClusterMasterRow(row: Record<string, any>): ClusterMasterRow | null {
  const id = norm(row.Cluster_ID);
  if (!id) return null;
  return {
    clusterId: normalizeClusterId(id),
    clusterName: norm(row.Cluster_Name),
    system: norm(row.System),
    defaultDisposition: norm(row.Default_Disposition),
    escalationTarget: norm(row.Escalation_Target),
    redFlagCriteria: norm(row.Red_Flag_Criteria),
    baseRiskLevel: norm(row.Base_Risk_Level),
    erThreshold: norm(row.ER_Threshold),
    ucThreshold: norm(row.UC_Threshold),
    pcThreshold: norm(row.PC_Threshold),
    followupPlan: norm(row.Followup_Plan),
    notes: norm(row.Notes_Source_Draft),
  };
}

async function loadClusterMaster(): Promise<Map<string, ClusterMasterRow>> {
  const rows = await getTable("GLOBAL_CLUSTER_MASTER");
  const map = new Map<string, ClusterMasterRow>();
  for (const row of rows) {
    const parsed = parseClusterMasterRow(row);
    if (parsed) map.set(parsed.clusterId, parsed);
  }
  return map;
}

function findFuzzyMatches(
  clusterId: string,
  master: Map<string, ClusterMasterRow>
): ClusterMasterRow[] {
  const matches: ClusterMasterRow[] = [];
  const parts = clusterId.split("_").filter(Boolean);
  const system = parts[0];
  const conditionParts = parts.slice(1);
  if (conditionParts.length === 0) return matches;
  const conditionKey = conditionParts.join("_");

  for (const [key, row] of master) {
    if (key === clusterId) continue;
    if (!key.startsWith(system + "_")) continue;
    if (key.includes(conditionKey)) {
      matches.push(row);
    }
  }
  return matches;
}

function lookupCluster(
  clusterId: string,
  master: Map<string, ClusterMasterRow>
): ClusterMasterRow | null {
  const exact = master.get(clusterId);
  if (exact) return exact;

  const fuzzyMatches = findFuzzyMatches(clusterId, master);
  if (fuzzyMatches.length === 0) return null;
  if (fuzzyMatches.length === 1) return fuzzyMatches[0];

  const withDisp = fuzzyMatches.filter(r => r.defaultDisposition);
  if (withDisp.length > 0) return withDisp[0];
  return fuzzyMatches[0];
}

export async function resolveClusterDisposition(
  state: CaseState,
  defaultCluster: string,
  triageUpgradeTarget?: string
): Promise<DispositionResult> {
  const clusterScores = new Map<string, ClusterScore>();

  function addCluster(cluster: string, score: number, source: string) {
    const key = normalizeClusterId(cluster);
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

  const sorted = [...clusterScores.values()].sort((a, b) => b.score - a.score);
  const topClusters = sorted.slice(0, 3).map(c => c.cluster);

  const clusterMaster = await loadClusterMaster();

  let dispositionCandidate = "routine";
  const dispositionReason: string[] = [];
  const matchedClusterRows: DispositionResult["matchedClusterRows"] = [];

  if (triageUpgradeTarget) {
    dispositionCandidate = triageUpgradeTarget;
    dispositionReason.push(`Triage upgrade to ${triageUpgradeTarget}`);
  } else if (state.redFlags.length > 0) {
    dispositionCandidate = "ED";
    dispositionReason.push("Red flags present");
  } else if (sorted.length > 0) {
    for (const cs of sorted) {
      const masterRow = lookupCluster(cs.cluster, clusterMaster);
      if (masterRow) {
        matchedClusterRows.push({
          clusterId: masterRow.clusterId,
          defaultDisposition: masterRow.defaultDisposition,
          escalationTarget: masterRow.escalationTarget,
          erThreshold: masterRow.erThreshold,
          ucThreshold: masterRow.ucThreshold,
        });
      }
    }

    const topCluster = sorted[0];
    const topMaster = lookupCluster(topCluster.cluster, clusterMaster);

    if (topMaster && topMaster.defaultDisposition) {
      const disp = topMaster.defaultDisposition.toLowerCase();
      if (disp === "ed" || disp === "er" || disp === "emergency") {
        dispositionCandidate = "ED";
      } else if (disp === "urgent_care" || disp === "uc" || disp === "urgent care") {
        dispositionCandidate = "urgent_care";
      } else if (disp === "telehealth" || disp === "virtual") {
        dispositionCandidate = "telehealth";
      } else if (disp === "pc" || disp === "primary care" || disp === "primary_care") {
        dispositionCandidate = "primary_care";
      } else {
        dispositionCandidate = disp || "routine";
      }
      dispositionReason.push(
        `GLOBAL_CLUSTER_MASTER[${topMaster.clusterId}].Default_Disposition=${topMaster.defaultDisposition}`
      );

      const erThresh = parseInt(topMaster.erThreshold, 10);
      const ucThresh = parseInt(topMaster.ucThreshold, 10);
      if (!isNaN(erThresh) && topCluster.score >= erThresh) {
        if (dispositionCandidate !== "ED") {
          dispositionCandidate = "ED";
          dispositionReason.push(`Cluster score ${topCluster.score} >= ER_Threshold ${erThresh}`);
        }
      } else if (!isNaN(ucThresh) && topCluster.score >= ucThresh) {
        if (dispositionCandidate !== "ED") {
          dispositionCandidate = "urgent_care";
          dispositionReason.push(`Cluster score ${topCluster.score} >= UC_Threshold ${ucThresh}`);
        }
      }

      if (topMaster.escalationTarget && dispositionCandidate === "ED") {
        dispositionReason.push(`Escalation target: ${topMaster.escalationTarget}`);
      }
    } else {
      dispositionReason.push(
        topMaster
          ? `Cluster ${topCluster.cluster} has no Default_Disposition — defaulting routine`
          : `Cluster ${topCluster.cluster} not found in GLOBAL_CLUSTER_MASTER — defaulting routine`
      );
    }
  }

  if (dispositionReason.length === 0) {
    dispositionReason.push("Default routine disposition");
  }

  const workupSuggestions: string[] = [];
  for (const cs of sorted.slice(0, 2)) {
    const masterRow = lookupCluster(cs.cluster, clusterMaster);
    if (masterRow?.followupPlan) {
      workupSuggestions.push(masterRow.followupPlan);
    } else {
      workupSuggestions.push(`Evaluate for ${cs.cluster}`);
    }
  }

  return {
    activeClusters: topClusters,
    clusterScores: sorted,
    dispositionCandidate,
    dispositionReason,
    workupSuggestions,
    matchedClusterRows,
  };
}

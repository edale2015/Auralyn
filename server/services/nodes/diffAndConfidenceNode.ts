import { getTable } from "../../data/registry";
import type { CaseState } from "../../../shared/agentTypes";

type Row = Record<string, any>;

const boolish = (v: any): boolean | null => {
  if (v === true || v === "true" || v === "yes" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === "no" || v === 0 || v === "0") return false;
  return null;
};

const numish = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface DiffResult {
  updated: CaseState;
  outputs: Record<string, any>;
  ruleRefs: string[];
  confidence: string;
}

export async function runDiffAndConfidenceNode(state: CaseState): Promise<DiffResult> {
  const s = state as any;
  const cc = String(s.normalizedComplaint || "");
  const A: Record<string, any> = s.answers || {};
  const centor = numish(s.scores?.centor);

  const clusterRows: Row[] = await getTable("GLOBAL_CLUSTER_MASTER");
  const dxRows: Row[] = await getTable("CLUSTER_PRIMARY_DIAGNOSIS");

  const validClusters = new Set(
    clusterRows.map(r => String(r.Cluster_ID || r.CLUSTER_ID || "")).filter(Boolean)
  );

  const dxByCluster = new Map<string, Array<{ diagnosisId: string; diagnosisName: string }>>();
  for (const r of dxRows) {
    const clusterId = String(r.Cluster_ID || r.CLUSTER_ID || "");
    const diagnosisId = String(r.Diagnosis_ID || r.DIAGNOSIS_ID || "");
    const diagnosisName = String(r.Diagnosis_Name || r.DIAGNOSIS_NAME || r.Diagnosis_Name_SafeFill || "");
    if (!clusterId || !diagnosisId) continue;
    if (!dxByCluster.has(clusterId)) dxByCluster.set(clusterId, []);
    dxByCluster.get(clusterId)!.push({ diagnosisId, diagnosisName });
  }

  const score: Record<string, { points: number; evidence: string[] }> = {};
  const bump = (clusterId: string, pts: number, evidence: string) => {
    if (!validClusters.has(clusterId) || pts <= 0) return;
    if (!score[clusterId]) score[clusterId] = { points: 0, evidence: [] };
    score[clusterId].points += pts;
    score[clusterId].evidence.push(evidence);
  };

  if (cc === "sore_throat") {
    if (boolish(A.ST_COUGH) === true) bump("CL_ST_VIRAL_URI", 2, "answers.ST_COUGH");
    if (boolish(A.ST_RUNNY) === true) bump("CL_ST_VIRAL_URI", 2, "answers.ST_RUNNY");
    if (boolish(A.ST_HOARSE) === true) bump("CL_ST_VIRAL_URI", 1, "answers.ST_HOARSE");

    if (boolish(A.ST_FEVER) === true) bump("CL_ST_GAS", 1, "answers.ST_FEVER");
    if (boolish(A.ST_COUGH) === false) bump("CL_ST_GAS", 1, "answers.ST_COUGH");
    if (centor >= 2) bump("CL_ST_GAS", 2, "scores.centor");

    if (boolish(A.ST_MONO) === true) bump("CL_ST_MONO", 2, "answers.ST_MONO");
  } else if (cc === "earache") {
    const oeScore = numish(s.scores?.oe_score);
    const aomScore = numish(s.scores?.aom_score);
    const tmjScore = numish(s.scores?.tmj_score);
    const etdScore = numish(s.scores?.etd_score);

    if (oeScore > 0) bump("CL_EA_OE", oeScore, "scores.oe_score");
    if (aomScore > 0) bump("CL_EA_AOM", aomScore, "scores.aom_score");
    if (tmjScore > 0) bump("CL_EA_TMJ", tmjScore, "scores.tmj_score");
    if (etdScore > 0) bump("CL_EA_ETD", etdScore, "scores.etd_score");

    if (boolish(A.Q_EA_NECK_SWELLING) === true && boolish(A.Q_EA_SOUR_PAIN) === true) {
      bump("CL_EA_SALIVARY", 4, "answers.Q_EA_NECK_SWELLING+Q_EA_SOUR_PAIN");
    } else if (boolish(A.Q_EA_NECK_SWELLING) === true) {
      bump("CL_EA_SALIVARY", 2, "answers.Q_EA_NECK_SWELLING");
    }
  } else if (cc === "persistent_cough") {
    const peScore = numish(s.scores?.pe_score);
    const asthmaCopd = numish(s.scores?.asthma_copd_score);
    const infectionScore = numish(s.scores?.infection_score);

    if (peScore > 0) bump("CL_PULM_PE_OVERLAP", peScore, "scores.pe_score");
    if (asthmaCopd > 0) bump("CL_PULM_ASTHMA_COPD", asthmaCopd, "scores.asthma_copd_score");
    if (infectionScore > 0) bump("CL_PULM_INFECTION", infectionScore, "scores.infection_score");
  }

  const ranked = Object.entries(score)
    .map(([clusterId, v]) => ({ clusterId, points: v.points, evidence: v.evidence }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);

  s.clusterScores = Object.fromEntries(ranked.map(r => [r.clusterId, r.points]));
  s.clusterEvidence = Object.fromEntries(ranked.map(r => [r.clusterId, r.evidence]));
  s.activeClusters = ranked.map(r => r.clusterId);

  const dxCandidates: Array<{
    diagnosisId: string;
    diagnosisName: string;
    clusterId: string;
    confidence: "MODERATE" | "LOW";
  }> = [];

  ranked.forEach((r, idx) => {
    const dxs = (dxByCluster.get(r.clusterId) || []).slice(0, 2);
    const conf: "MODERATE" | "LOW" = idx === 0 ? "MODERATE" : "LOW";
    for (const d of dxs) {
      dxCandidates.push({ ...d, clusterId: r.clusterId, confidence: conf });
    }
  });
  s.diagnosisCandidates = dxCandidates.slice(0, 6);

  const missingRequired = (s.questionQueue || []).some((q: any) => q.required && !q.answered);
  const confidence =
    s.redFlagGate?.gateResult === "ER_SEND" ? "HIGH" :
    missingRequired ? "LOW" :
    ranked.length > 0 ? "MODERATE" : "LOW";
  s.caseConfidence = confidence;

  const ruleRefs = [
    ...s.activeClusters,
    ...(s.diagnosisCandidates || []).map((d: any) => d.diagnosisId),
  ];

  return {
    updated: state,
    confidence,
    ruleRefs,
    outputs: {
      rankedClusters: ranked,
      activeClusters: s.activeClusters,
      dxCount: (s.diagnosisCandidates || []).length,
    },
  };
}

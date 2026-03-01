import type { CaseState } from "../../shared/agentTypes";
import type { TraceEvent } from "../../shared/testingTypes";
import type {
  ComplaintConfig,
  ClusterScoringRule,
  RedFlagRule,
  DispositionRule,
  OutputTemplate,
} from "../services/complaintConfigLoader";
import { loadComplaintConfig } from "../services/complaintConfigLoader";
import { evaluateExpr } from "../services/exprEval";
import {
  runCoreQuestions,
  runRedFlagsComplaint,
  runDisposition,
  renderTemplate,
  findTemplate,
  type RedFlagResult,
  type DispositionResult,
} from "../services/complaintEngines";
import { getTable } from "../data/registry";
import type { GraphResult, NodeTrace } from "../services/complaintNodeRunner";

export interface GenericScoringResult {
  scores: Record<string, number>;
  evidence: Record<string, string[]>;
  topCluster: string;
  ranked: Array<{ clusterId: string; points: number; evidence: string[] }>;
  inputsUsed: string[];
}

export function computeScoresFromRules(
  rules: ClusterScoringRule[],
  state: CaseState
): GenericScoringResult {
  const clusterPoints: Record<string, number> = {};
  const clusterEvidence: Record<string, string[]> = {};
  const inputsUsed = new Set<string>();

  for (const rule of rules) {
    let fires: boolean;
    try {
      fires = !!evaluateExpr(rule.whenExpr, state);
    } catch {
      fires = false;
    }

    if (!fires) continue;

    if (!clusterPoints[rule.clusterId]) {
      clusterPoints[rule.clusterId] = 0;
      clusterEvidence[rule.clusterId] = [];
    }
    clusterPoints[rule.clusterId] += rule.points;
    clusterEvidence[rule.clusterId].push(rule.evidenceLabel);

    const qRefs = rule.whenExpr.match(/answers\.(Q_[A-Z0-9_]+)/g) ?? [];
    for (const ref of qRefs) {
      inputsUsed.add(ref.replace("answers.", ""));
    }
  }

  const ranked = Object.entries(clusterPoints)
    .map(([clusterId, points]) => ({
      clusterId,
      points,
      evidence: clusterEvidence[clusterId] ?? [],
    }))
    .sort((a, b) => b.points - a.points);

  const topCluster = ranked.length > 0 ? ranked[0].clusterId : "";

  const scores: Record<string, number> = {};
  for (const r of ranked) {
    const scoreKey = clusterIdToScoreKey(r.clusterId);
    scores[scoreKey] = r.points;
  }
  if (ranked.length > 0) {
    scores[compositeScoreKey(state.normalizedComplaint || "")] = ranked[0].points;
  }

  return {
    scores,
    evidence: clusterEvidence,
    topCluster,
    ranked,
    inputsUsed: Array.from(inputsUsed),
  };
}

function clusterIdToScoreKey(clusterId: string): string {
  return clusterId
    .replace(/^CL_/, "")
    .toLowerCase() + "_score";
}

function compositeScoreKey(ccId: string): string {
  const map: Record<string, string> = {
    gu_uti_symptoms: "uti_score",
    gu_testicular_pain_prostatitis: "testicular_pain_score",
    gyn_pelvic_pain: "pelvic_pain_score",
    neuro_headache: "headache_score",
    ent_sinus_pressure: "sinus_score",
    ent_sore_throat: "sore_throat_ent_score",
    ent_ear_pain: "ear_pain_score",
    ent_nasal_congestion: "nasal_congestion_score",
    ent_epistaxis: "epistaxis_score",
    pulm_cough: "pulm_cough_score",
    pulm_shortness_of_breath: "shortness_of_breath_score",
    pulm_wheezing: "wheezing_score",
    pulm_chest_tightness: "chest_tightness_score",
    pulm_hemoptysis: "hemoptysis_score",
    gi_abdominal_pain: "gi_abd_pain_score",
    gi_diarrhea: "gi_diarrhea_score",
    gi_vomiting: "gi_vomiting_score",
    gi_gi_bleeding: "gi_bleeding_score",
    gi_constipation: "gi_constipation_score",
    gi_jaundice: "gi_jaundice_score",
    gi_dysphagia: "gi_dysphagia_score",
    gi_acute_pancreatitis_like: "gi_pancreatitis_score",
    neuro_dizziness_vertigo: "neuro_dizziness_score",
    neuro_weakness_numbness: "neuro_weakness_score",
    neuro_seizure: "neuro_seizure_score",
    neuro_syncope: "neuro_syncope_score",
    neuro_confusion_ams: "neuro_ams_score",
    gu_dysuria_uti: "gu_dysuria_score",
    gu_flank_pain: "gu_flank_score",
    gu_testicular_pain: "gu_testicular_score",
    gu_hematuria: "gu_hematuria_score",
    gu_urinary_retention: "gu_retention_score",
    gu_sti_exposure_discharge: "gu_sti_score",
    gu_pelvic_pain_possible_ovarian_torsion: "gu_pelvic_torsion_score",
    gu_vaginal_bleeding: "gu_vaginal_bleed_score",
    sore_throat: "centor",
    earache: "earache_score",
    persistent_cough: "cough_score",
    chest_pain: "chest_pain_score",
    dizziness: "dizziness_score",
    abdominal_pain: "abd_pain_score",
  };
  return map[ccId] || ccId.replace(/[_-]/g, "_") + "_score";
}

export async function runGenericComplaintV1(
  state: CaseState,
  ccId: string,
  maxNodes: number = 25
): Promise<GraphResult> {
  const config = await loadComplaintConfig(ccId);
  if (!config) {
    return {
      state,
      events: [{ type: "COMPLAINT_GRAPH_ERROR", severity: "error", message: `No config for complaint: ${ccId}` }],
      nodeTraces: [],
      currentNode: "INIT_CASE",
      done: false,
    };
  }

  let updated = { ...state } as any;
  const events: TraceEvent[] = [];
  const nodeTraces: NodeTrace[] = [];

  updated.system = config.registry.system;
  updated.normalizedComplaint = config.registry.ccId;
  if (config.registry.defaultCluster && !updated.activeClusters.includes(config.registry.defaultCluster)) {
    updated.activeClusters = [...updated.activeClusters, config.registry.defaultCluster];
  }
  events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[GENERIC_V1:INIT] System=${config.registry.system}, cc=${config.registry.ccId}` });

  const qResult = runCoreQuestions(updated as CaseState, config);
  if (qResult.nextQuestion) {
    const questionQueue = config.coreQuestions.map(q => ({
      questionId: q.qId,
      bundleId: `CC_${config.registry.ccId}`,
      askOrder: q.askOrder,
      isRedFlag: false,
      questionText: q.questionText,
      answered: q.qId in (updated.answers ?? {}),
    }));
    updated.questionQueue = questionQueue;
    updated.requiredQuestionIdsMissing = qResult.requiredMissing;

    return {
      state: updated as CaseState,
      events,
      nodeTraces,
      currentNode: "CORE_QUESTIONS",
      pendingAction: {
        type: "ASK_QUESTION",
        questionId: qResult.nextQuestion.qId,
        prompt: qResult.nextQuestion.questionText,
      },
      done: false,
    };
  }
  events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[GENERIC_V1:QUESTIONS] All answered` });

  const rfResult = runRedFlagsComplaint(updated as CaseState, config.redFlagRules);
  updated.redFlagGate = {
    evaluated: true,
    flagsFound: rfResult.triggeredFlags.map(f => ({
      flagId: f.rfId,
      label: f.label,
      severity: f.severity,
      action: f.action,
      reasons: [f.rationale],
      immediateActions: f.immediateActions,
      source: "COMPLAINT_RED_FLAG_RULES",
    })),
    gateResult: rfResult.gateResult,
  };
  const rfSet = new Set(updated.redFlags.concat(rfResult.triggeredFlags.map(f => f.rfId)));
  updated.redFlags = Array.from(rfSet);
  events.push({ type: "COMPLAINT_GRAPH_NODE", severity: rfResult.gateResult === "PASS" ? "info" : "warn", message: `[GENERIC_V1:RED_FLAGS] ${rfResult.gateResult} — ${rfResult.triggeredFlags.length} flags` });

  if (rfResult.gateResult === "ER_SEND") {
    updated.routing = { ...updated.routing, state: "EMERGENT_ESCALATION" };
  }

  const scoringResult = computeScoresFromRules(config.clusterScoringRules, updated as CaseState);
  updated.scores = { ...updated.scores, ...scoringResult.scores };
  events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[GENERIC_V1:SCORING] ${Object.entries(scoringResult.scores).map(([k, v]) => `${k}=${v}`).join(", ")}` });

  const dispResult = runDisposition(updated as CaseState, config.dispositionRules);
  updated.disposition = dispResult.dispositionLevel;
  updated.dispositionReasonCodes = [
    ...updated.dispositionReasonCodes,
    dispResult.matchedRuleId,
  ];
  events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[GENERIC_V1:DISPOSITION] ${dispResult.dispositionLevel} (rule: ${dispResult.matchedRuleId})` });

  const topN = scoringResult.ranked.slice(0, 3);
  updated.clusterScores = Object.fromEntries(topN.map(r => [r.clusterId, r.points]));
  updated.clusterEvidence = Object.fromEntries(topN.map(r => [r.clusterId, r.evidence]));
  updated.activeClusters = topN.map(r => r.clusterId);

  const dxRows = await getTable("CLUSTER_PRIMARY_DIAGNOSIS");
  const dxByCluster = new Map<string, Array<{ diagnosisId: string; diagnosisName: string }>>();
  for (const r of dxRows) {
    const clusterId = String(r.Cluster_ID || r.CLUSTER_ID || "");
    const diagnosisId = String(r.Diagnosis_ID || r.DIAGNOSIS_ID || "");
    const diagnosisName = String(r.Diagnosis_Name || r.DIAGNOSIS_NAME || r.Diagnosis_Name_SafeFill || "");
    if (!clusterId || !diagnosisId) continue;
    if (!dxByCluster.has(clusterId)) dxByCluster.set(clusterId, []);
    dxByCluster.get(clusterId)!.push({ diagnosisId, diagnosisName });
  }

  const dxCandidates: Array<{
    diagnosisId: string;
    diagnosisName: string;
    clusterId: string;
    confidence: "MODERATE" | "LOW";
  }> = [];
  topN.forEach((r, idx) => {
    const dxs = (dxByCluster.get(r.clusterId) || []).slice(0, 2);
    const conf: "MODERATE" | "LOW" = idx === 0 ? "MODERATE" : "LOW";
    for (const d of dxs) {
      dxCandidates.push({ ...d, clusterId: r.clusterId, confidence: conf });
    }
  });
  updated.diagnosisCandidates = dxCandidates.slice(0, 6);

  const confidence =
    rfResult.gateResult === "ER_SEND" ? "HIGH" :
    topN.length > 0 ? "MODERATE" : "LOW";
  updated.caseConfidence = confidence;

  events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[GENERIC_V1:DIFF] clusters=${updated.activeClusters.join(",")}, confidence=${confidence}` });

  nodeTraces.push({
    nodeId: "SCORING",
    inputsUsed: scoringResult.inputsUsed,
    outputs: {
      scores: scoringResult.scores,
      rankedClusters: topN,
      disposition: dispResult.dispositionLevel,
      confidence,
    },
    ruleRefs: [
      ...topN.map(r => r.clusterId),
      dispResult.matchedRuleId,
    ],
    llmCalls: 0,
    confidence,
    durationMs: 0,
  });

  return {
    state: updated as CaseState,
    events,
    nodeTraces,
    currentNode: "DONE",
    done: true,
  };
}

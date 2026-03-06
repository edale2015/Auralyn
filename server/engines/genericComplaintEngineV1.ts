import type { CaseState } from "../../shared/agentTypes";
import type { TraceEvent } from "../../shared/testingTypes";
import type {
  ComplaintConfig,
  ClusterScoringRule,
  RedFlagRule,
  DispositionRule,
  OutputTemplate,
  DxCandidateRow,
} from "../services/complaintConfigLoader";
import { loadComplaintConfig } from "../services/complaintConfigLoader";
import { evaluateExpr } from "../services/exprEval";
import { loadCrossComplaintBoosts, applyCrossComplaintBoosts } from "./crossComplaintBoostEngine";
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
import { computeScoringSystems } from "./scoringSystemsEngine";
import type { GraphResult, NodeTrace } from "../services/complaintNodeRunner";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ANALYTICS_LOG_PATH = path.resolve(process.cwd(), "server/data/csv/CASE_ANALYTICS_LOG.csv");
const ANALYTICS_HEADERS = "TIMESTAMP,CASE_ID,CC_ID,DISPOSITION,TOP_DX,DX_SCORE,RED_FLAG_TRIGGERED,TOP_CLUSTER,ENGINE_VERSION";

function appendAnalyticsLog(entry: {
  ccId: string;
  caseId: string;
  disposition: string;
  topDx: string;
  dxScore: number;
  redFlagTriggered: boolean;
  topCluster: string;
}): void {
  try {
    if (!fs.existsSync(ANALYTICS_LOG_PATH)) {
      fs.writeFileSync(ANALYTICS_LOG_PATH, ANALYTICS_HEADERS + "\n", "utf8");
    }
    const row = [
      new Date().toISOString(),
      entry.caseId,
      entry.ccId,
      entry.disposition,
      entry.topDx,
      entry.dxScore.toFixed(2),
      String(entry.redFlagTriggered),
      entry.topCluster,
      "GENERIC_V1",
    ].join(",");
    fs.appendFileSync(ANALYTICS_LOG_PATH, row + "\n", "utf8");
  } catch {
  }
}

type DxPriorityMap = Map<string, Map<string, number>>;

let _dxPriorityCache: DxPriorityMap | null = null;

function resolveDxPriorityPath(): string {
  try {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(thisDir, "../data/csv/DX_PRIORITY.csv");
  } catch {
    return path.resolve(process.cwd(), "server/data/csv/DX_PRIORITY.csv");
  }
}

function loadDxPriority(): DxPriorityMap {
  if (_dxPriorityCache) return _dxPriorityCache;
  const csvPath = resolveDxPriorityPath();
  if (!fs.existsSync(csvPath)) {
    _dxPriorityCache = new Map();
    return _dxPriorityCache;
  }
  const text = fs.readFileSync(csvPath, "utf8").trim();
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const map: DxPriorityMap = new Map();
  for (const line of lines.slice(1)) {
    const [ccId, clusterId, priStr] = line.split(",").map(s => s.trim());
    if (!ccId || !clusterId) continue;
    const pri = Number(priStr ?? "0");
    if (!map.has(ccId)) map.set(ccId, new Map());
    map.get(ccId)!.set(clusterId, isNaN(pri) ? 0 : pri);
  }
  _dxPriorityCache = map;
  return map;
}

function getDxPriority(ccId: string, clusterId: string): number {
  const map = loadDxPriority();
  return map.get(ccId)?.get(clusterId) ?? 0;
}

export function resetDxPriorityCache(): void {
  _dxPriorityCache = null;
}

export interface FiredRule {
  ruleId: string;
  clusterId: string;
  points: number;
}

export interface ScoringExplanation {
  topRules: FiredRule[];
  topSuppressors: FiredRule[];
  rfTriggered: string[];
  tieBreak: "score" | "priority" | "dx_id" | "none";
  margin: number;
  confidence: "HIGH" | "MODERATE" | "LOW";
}

export interface GenericScoringResult {
  scores: Record<string, number>;
  evidence: Record<string, string[]>;
  topCluster: string;
  ranked: Array<{ clusterId: string; points: number; evidence: string[] }>;
  inputsUsed: string[];
  firedRules: FiredRule[];
  explanation: ScoringExplanation;
}

export function computeScoresFromRules(
  rules: ClusterScoringRule[],
  state: CaseState,
  ccId?: string
): GenericScoringResult {
  const clusterPoints: Record<string, number> = {};
  const clusterEvidence: Record<string, string[]> = {};
  const firedRules: FiredRule[] = [];
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
    firedRules.push({ ruleId: rule.ruleId, clusterId: rule.clusterId, points: rule.points });

    const qRefs = rule.whenExpr.match(/answers\.(Q_[A-Z0-9_]+)/g) ?? [];
    for (const ref of qRefs) {
      inputsUsed.add(ref.replace("answers.", ""));
    }
  }

  const complaintSlug = ccId || state.normalizedComplaint || "";
  const priMap = loadDxPriority();
  const hasPriority = priMap.has(complaintSlug);

  const ranked = Object.entries(clusterPoints)
    .map(([clusterId, points]) => ({
      clusterId,
      points,
      evidence: clusterEvidence[clusterId] ?? [],
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (hasPriority) {
        const priA = getDxPriority(complaintSlug, a.clusterId);
        const priB = getDxPriority(complaintSlug, b.clusterId);
        if (priB !== priA) return priB - priA;
        return a.clusterId.localeCompare(b.clusterId);
      }
      return 0;
    });

  const topCluster = ranked.length > 0 ? ranked[0].clusterId : "";

  const scores: Record<string, number> = {};
  for (const r of ranked) {
    const scoreKey = clusterIdToScoreKey(r.clusterId);
    scores[scoreKey] = r.points;
  }
  if (ranked.length > 0) {
    scores[compositeScoreKey(state.normalizedComplaint || "")] = ranked[0].points;
  }

  const topRules = firedRules.filter(r => r.points > 0).sort((a, b) => b.points - a.points).slice(0, 5);
  const topSuppressors = firedRules.filter(r => r.points < 0).sort((a, b) => a.points - b.points).slice(0, 5);

  const margin = ranked.length >= 2 ? ranked[0].points - ranked[1].points : (ranked.length === 1 ? ranked[0].points : 0);
  let tieBreak: ScoringExplanation["tieBreak"] = "none";
  if (ranked.length >= 2 && ranked[0].points === ranked[1].points) {
    const priA = getDxPriority(complaintSlug, ranked[0].clusterId);
    const priB = getDxPriority(complaintSlug, ranked[1].clusterId);
    tieBreak = priA !== priB ? "priority" : "dx_id";
  } else if (ranked.length >= 2) {
    tieBreak = "score";
  }

  const suppressorsHit = firedRules.filter(r => r.points < 0).length;
  const scoringConfidence: ScoringExplanation["confidence"] =
    margin >= 4 && suppressorsHit <= 1 ? "HIGH" :
    margin >= 2 ? "MODERATE" : "LOW";

  return {
    scores,
    evidence: clusterEvidence,
    topCluster,
    ranked,
    inputsUsed: Array.from(inputsUsed),
    firedRules,
    explanation: {
      topRules,
      topSuppressors,
      rfTriggered: [],
      tieBreak,
      margin,
      confidence: scoringConfidence,
    },
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
    cardio_chest_pain: "cardio_chest_pain_score",
    cardio_palpitations: "cardio_palpitations_score",
    cardio_leg_swelling: "cardio_leg_swelling_score",
    msk_back_pain: "msk_back_pain_score",
    msk_joint_pain: "msk_joint_pain_score",
    msk_sprain_injury: "msk_sprain_injury_score",
    derm_rash: "derm_rash_score",
    derm_cellulitis: "derm_cellulitis_score",
    derm_allergic_reaction: "derm_allergic_reaction_score",
    endo_hyperglycemia: "endo_hyperglycemia_score",
    endo_hypoglycemia: "endo_hypoglycemia_score",
    endo_thyroid_symptoms: "endo_thyroid_score",
    psych_anxiety_panic: "psych_anxiety_score",
    psych_depression_suicidal_ideation: "psych_depression_score",
    psych_agitation_psychosis: "psych_agitation_score",
    ophtho_vision_loss: "ophtho_vision_loss_score",
    ophtho_red_eye: "ophtho_red_eye_score",
    ophtho_eye_pain_foreign_body: "ophtho_eye_pain_score",
    id_fever: "id_fever_score",
    id_flu_like: "id_flu_like_score",
    id_animal_bite_wound_infection: "id_bite_wound_score",
    tox_overdose_intoxication: "tox_overdose_score",
    tox_withdrawal: "tox_withdrawal_score",
    tox_poisoning_exposure: "tox_poisoning_score",
    ortho_trauma_head_injury: "ortho_head_injury_score",
    ortho_trauma_fracture_dislocation: "ortho_fracture_score",
    ortho_trauma_laceration: "ortho_laceration_score",
    general_fatigue: "general_fatigue_score",
    general_generalized_weakness: "general_weakness_score",
    general_nausea_malaise: "general_nausea_score",
    sore_throat: "centor",
    earache: "earache_score",
    persistent_cough: "cough_score",
    chest_pain: "chest_pain_score",
    dizziness: "dizziness_score",
    abdominal_pain: "abd_pain_score",
  };
  return map[ccId] || ccId.replace(/[_-]/g, "_") + "_score";
}

function pickLikelyDxFromCandidates(cfg: ComplaintConfig, max = 5): Array<{ id: string; label: string; score: number }> {
  const cands = cfg.dxCandidates ?? [];
  return cands
    .slice(0, max)
    .map((c) => ({
      id: c.DX_ID,
      label: c.DX_LABEL,
      score: c.BASE_SCORE,
    }));
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
  if (qResult.requiredMissing.length > 0 && qResult.nextQuestion) {
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

  const scoringResult = computeScoresFromRules(config.clusterScoringRules, updated as CaseState, ccId);
  scoringResult.explanation.rfTriggered = rfResult.triggeredFlags.map(f => f.rfId);

  const crossBoostRules = loadCrossComplaintBoosts("server/data/csv/CROSS_COMPLAINT_BOOSTS.csv");
  if (crossBoostRules.length > 0) {
    const clusterScoreMap: Record<string, number> = {};
    for (const r of scoringResult.ranked) {
      clusterScoreMap[r.clusterId] = r.points;
    }
    const { scores: boostedScores, adjustments } = applyCrossComplaintBoosts({
      complaintSlug: ccId,
      anyAnswers: updated.answers ?? {},
      rules: crossBoostRules,
      scores: clusterScoreMap,
    });
    if (adjustments.length > 0) {
      for (const r of scoringResult.ranked) {
        if (boostedScores[r.clusterId] !== undefined) {
          r.points = boostedScores[r.clusterId];
        }
      }
      scoringResult.ranked.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const priA = getDxPriority(ccId, a.clusterId);
        const priB = getDxPriority(ccId, b.clusterId);
        if (priB !== priA) return priB - priA;
        return a.clusterId.localeCompare(b.clusterId);
      });
      (scoringResult as any).topCluster = scoringResult.ranked.length > 0 ? scoringResult.ranked[0].clusterId : "";
      for (const r of scoringResult.ranked) {
        scoringResult.scores[clusterIdToScoreKey(r.clusterId)] = r.points;
      }
      if (scoringResult.ranked.length > 0) {
        scoringResult.scores[compositeScoreKey(ccId)] = scoringResult.ranked[0].points;
      }
      (updated as any).crossComplaintAdjustments = adjustments;
      (updated as any).scoreAdjustmentsApplied = true;
      events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[GENERIC_V1:CROSS_BOOST] ${adjustments.length} adjustments applied: ${adjustments.map(a => `${a.ruleId}→${a.targetDxId}(+${a.points})`).join(", ")}` });
    }
  }

  updated.scores = { ...updated.scores, ...scoringResult.scores };
  events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[GENERIC_V1:SCORING] ${Object.entries(scoringResult.scores).map(([k, v]) => `${k}=${v}`).join(", ")}` });
  events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[GENERIC_V1:EXPLAIN] tieBreak=${scoringResult.explanation.tieBreak}, margin=${scoringResult.explanation.margin}, confidence=${scoringResult.explanation.confidence}` });

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

  const likelyDx = pickLikelyDxFromCandidates(config, 5);
  if (likelyDx.length > 0) {
    const totalScore = likelyDx.reduce((sum, d) => sum + (d.score || 0), 0);
    const withConfidence = likelyDx.map(d => ({
      ...d,
      confidence: totalScore > 0 ? Math.round((d.score / totalScore) * 100) : 0,
    }));
    updated.likelyDx = withConfidence;
    updated.dxListText = withConfidence
      .map(d => d.confidence > 0 ? `• ${d.label} (${d.confidence}%)` : `• ${d.label}`)
      .join("\n");
  }

  const confidence =
    rfResult.gateResult === "ER_SEND" ? "HIGH" :
    scoringResult.explanation.confidence;
  updated.caseConfidence = confidence;
  updated.scoringExplanation = scoringResult.explanation;

  const scoringSystemResults = await computeScoringSystems(ccId, updated as CaseState);
  if (scoringSystemResults.length > 0) {
    updated.scoringSystems = scoringSystemResults;
    for (const ss of scoringSystemResults) {
      updated.scores[`${ss.scoreId.toLowerCase()}_score`] = ss.total;
    }
    events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[GENERIC_V1:SCORING_SYSTEMS] ${scoringSystemResults.map(s => `${s.scoreId}=${s.total}(${s.category ?? "n/a"})`).join(", ")}` });
  }

  events.push({ type: "COMPLAINT_GRAPH_NODE", severity: "info", message: `[GENERIC_V1:DIFF] clusters=${updated.activeClusters.join(",")}, confidence=${confidence}, tieBreak=${scoringResult.explanation.tieBreak}` });

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

  if (!process.env.HARNESS_MODE) {
    appendAnalyticsLog({
      ccId,
      caseId: (updated as any).caseId ?? "unknown",
      disposition: dispResult.dispositionLevel,
      topDx: likelyDx.length > 0 ? likelyDx[0].id : "",
      dxScore: likelyDx.length > 0 ? likelyDx[0].score : 0,
      redFlagTriggered: rfResult.triggeredFlags.length > 0,
      topCluster: scoringResult.topCluster,
    });
  }

  return {
    state: updated as CaseState,
    events,
    nodeTraces,
    currentNode: "DONE",
    done: true,
  };
}

import { loadDataset, ClinicalCase } from "./clinicalDataset";
import { runSafetyCheck, SafetyCheckResult } from "./safetyLayer";
import { extractFeatures, extractFromCase, jaccardSimilarity } from "./featureExtractor";
import { globalProbEngine, ProbabilisticResult } from "./probabilisticEngine";
import OpenAI from "openai";

export interface SimilarCaseResult {
  case_id: string;
  complaint: string;
  top_diagnosis: string;
  expected_disposition: string;
  similarity: number;
  matched_features: string[];
  adversarial: boolean;
}

export interface HybridEvaluationResult {
  caseId: string;
  complaint: string;
  features: string[];
  age?: number;
  sex?: string;

  layer1_safety: SafetyCheckResult;
  layer2_similar_cases: SimilarCaseResult[];
  layer2_similarity_votes: Array<{ diagnosis: string; votes: number; pct: number }>;
  layer2_disposition_votes: Array<{ disposition: string; votes: number; pct: number }>;
  layer3_probabilistic: ProbabilisticResult;
  layer3_ensemble_differential: Array<{ diagnosis: string; combined_score: number; similarity_score: number; bayesian_score: number }>;

  disposition: string;
  confidence: number;
  need_more_info: boolean;
  next_question: string | null;

  layer4_explanation: string;
  explanation_generating: boolean;

  reasoning_path: string[];
  timestamp: string;
}

let _initialized = false;
let _caseFeatures: Map<string, ReturnType<typeof extractFromCase>> = new Map();
let _dataset: ClinicalCase[] = [];

async function ensureInitialized() {
  if (_initialized) return;
  _dataset = await loadDataset();

  for (const c of _dataset) {
    _caseFeatures.set(c.case_id, extractFromCase(c));
  }

  globalProbEngine.train(_dataset);
  _initialized = true;
}

function findSimilarCases(complaint: string, features: string[], age?: number, sex?: string, topK = 5): SimilarCaseResult[] {
  const queryFeatures = extractFeatures(complaint, features, age, sex);

  return _dataset
    .map(c => {
      const cf = _caseFeatures.get(c.case_id)!;
      const complaintBoost = c.complaint === complaint ? 0.15 : 0;
      const sim = Math.min(1, jaccardSimilarity(queryFeatures.raw, cf.raw) + complaintBoost);
      const matched = features.filter(f =>
        cf.raw.has(`symptom:${f.toLowerCase().replace(/\s+/g,"_")}`)
      );
      return { case_id: c.case_id, complaint: c.complaint, top_diagnosis: c.expected_differential[0], expected_disposition: c.expected_disposition, similarity: Math.round(sim * 100) / 100, matched_features: matched, adversarial: !!c.adversarial };
    })
    .filter(r => r.similarity > 0.05)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

function computeEnsemble(
  similarCases: SimilarCaseResult[],
  probResult: ProbabilisticResult,
  similarityWeight = 0.35,
  bayesianWeight = 0.65
): Array<{ diagnosis: string; combined_score: number; similarity_score: number; bayesian_score: number }> {
  const simScores: Record<string, number> = {};
  for (const s of similarCases) {
    simScores[s.top_diagnosis] = (simScores[s.top_diagnosis] ?? 0) + s.similarity;
  }
  const simTotal = Object.values(simScores).reduce((a, b) => a + b, 0.001);

  const allDx = new Set([
    ...Object.keys(simScores),
    ...probResult.probabilities.map(p => p.diagnosis),
  ]);

  return Array.from(allDx).map(dx => {
    const simS = (simScores[dx] ?? 0) / simTotal;
    const bayS = probResult.probabilities.find(p => p.diagnosis === dx)?.probability ?? 0;
    const combined = similarityWeight * simS + bayesianWeight * bayS;
    return {
      diagnosis: dx,
      combined_score: Math.round(combined * 1000) / 1000,
      similarity_score: Math.round(simS * 1000) / 1000,
      bayesian_score: Math.round(bayS * 1000) / 1000,
    };
  }).sort((a, b) => b.combined_score - a.combined_score).slice(0, 8);
}

function deriveDisposition(ensemble: ReturnType<typeof computeEnsemble>, probResult: ProbabilisticResult): { disposition: string; confidence: number } {
  const ER_DX = new Set(["acute_coronary_syndrome","STEMI","pulmonary_embolism","appendicitis","ectopic_pregnancy","subarachnoid_hemorrhage","bacterial_meningitis","meningococcemia","peritonsillar_abscess","aortic_dissection","sepsis","urosepsis","mastoiditis","orbital_cellulitis","cavernous_sinus_thrombosis"]);
  const URGENT_DX = new Set(["pneumonia","strep_pharyngitis","pyelonephritis","asthma","COPD_exacerbation","herpes_zoster","Ramsay_Hunt_syndrome","cholecystitis","nephrolithiasis"]);

  const top = ensemble[0]?.diagnosis ?? "";
  const confidence = ensemble[0]?.combined_score ?? 0;

  if (ER_DX.has(top)) return { disposition: "er_now", confidence };
  if (URGENT_DX.has(top)) return { disposition: "urgent_care", confidence };
  if (confidence < 0.15 || probResult.isUncertain) return { disposition: "uncertain", confidence };
  return { disposition: "home_care", confidence };
}

async function generateExplanation(
  complaint: string,
  features: string[],
  ensemble: Array<{ diagnosis: string; combined_score: number }>,
  safetyResult: SafetyCheckResult
): Promise<string> {
  try {
    const client = new OpenAI();
    const topDx = ensemble.slice(0, 3).map(e => `${e.diagnosis} (${(e.combined_score * 100).toFixed(0)}%)`).join(", ");

    const prompt = `You are a clinical reasoning assistant. Given a patient's presenting complaint and symptoms, explain briefly (2-3 sentences) why the top diagnoses are likely. Be concise and clinical.

Complaint: ${complaint.replace(/_/g," ")}
Symptoms: ${features.join(", ")}
${safetyResult.override ? `Safety flags triggered: ${safetyResult.triggered_flags.join(", ")}` : ""}
Top diagnoses: ${topDx}

Provide a brief clinical explanation for why these diagnoses are ranked in this order.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.3,
    });
    return response.choices[0]?.message?.content?.trim() ?? "Explanation unavailable.";
  } catch {
    return `The symptom pattern of ${features.slice(0, 3).join(", ")} associated with ${complaint.replace(/_/g," ")} is consistent with the ranked differential diagnoses based on clinical case memory and probabilistic inference.`;
  }
}

export async function evaluateCase(params: {
  caseId?: string;
  complaint: string;
  features: string[];
  age?: number;
  sex?: string;
  generateExplanation?: boolean;
}): Promise<HybridEvaluationResult> {
  await ensureInitialized();

  const { complaint, features, age, sex } = params;
  const caseId = params.caseId ?? `HC_${Date.now()}`;
  const reasoningPath: string[] = [];

  const layer1 = runSafetyCheck(complaint, features);
  reasoningPath.push(`L1 Safety: ${layer1.override ? `OVERRIDE → ${layer1.disposition}` : "Pass"}`);

  const similarCases = findSimilarCases(complaint, features, age, sex);
  const dxVotes: Record<string, number> = {};
  const dispVotes: Record<string, number> = {};
  for (const s of similarCases) {
    dxVotes[s.top_diagnosis] = (dxVotes[s.top_diagnosis] ?? 0) + 1;
    dispVotes[s.expected_disposition] = (dispVotes[s.expected_disposition] ?? 0) + 1;
  }
  const total = similarCases.length || 1;
  const similarityVotes = Object.entries(dxVotes).map(([diagnosis, votes]) => ({ diagnosis, votes, pct: Math.round(votes / total * 100) })).sort((a, b) => b.votes - a.votes);
  const dispositionVotes = Object.entries(dispVotes).map(([disposition, votes]) => ({ disposition, votes, pct: Math.round(votes / total * 100) })).sort((a, b) => b.votes - a.votes);
  reasoningPath.push(`L2 Similarity: ${similarCases.length} cases found, top Dx: ${similarityVotes[0]?.diagnosis ?? "none"}`);

  const probResult = globalProbEngine.evaluate(features, complaint);
  reasoningPath.push(`L3 Bayes: top Dx ${probResult.topDiagnosis} (${(probResult.topProbability * 100).toFixed(0)}%), entropy=${probResult.uncertaintyScore}`);

  if (layer1.override) {
    const explanation = params.generateExplanation !== false
      ? await generateExplanation(complaint, features, [{ diagnosis: "emergency_condition", combined_score: 1 }], layer1)
      : layer1.reason;

    return {
      caseId, complaint, features, age, sex,
      layer1_safety: layer1,
      layer2_similar_cases: similarCases,
      layer2_similarity_votes: similarityVotes,
      layer2_disposition_votes: dispositionVotes,
      layer3_probabilistic: probResult,
      layer3_ensemble_differential: [],
      disposition: "er_now",
      confidence: 1.0,
      need_more_info: false,
      next_question: null,
      layer4_explanation: `⚠ ${layer1.reason}`,
      explanation_generating: false,
      reasoning_path: [...reasoningPath, "Safety override applied → ER_NOW"],
      timestamp: new Date().toISOString(),
    };
  }

  if (probResult.isUncertain && probResult.nextBestQuestion) {
    reasoningPath.push(`Uncertain (entropy=${probResult.uncertaintyScore}) → requesting more info`);
    return {
      caseId, complaint, features, age, sex,
      layer1_safety: layer1,
      layer2_similar_cases: similarCases,
      layer2_similarity_votes: similarityVotes,
      layer2_disposition_votes: dispositionVotes,
      layer3_probabilistic: probResult,
      layer3_ensemble_differential: [],
      disposition: "need_more_info",
      confidence: probResult.topProbability,
      need_more_info: true,
      next_question: probResult.nextBestQuestion,
      layer4_explanation: "Diagnosis is uncertain. Please answer the next question to improve accuracy.",
      explanation_generating: false,
      reasoning_path: reasoningPath,
      timestamp: new Date().toISOString(),
    };
  }

  const ensemble = computeEnsemble(similarCases, probResult);
  reasoningPath.push(`Ensemble: top ${ensemble[0]?.diagnosis} (combined=${ensemble[0]?.combined_score?.toFixed(2)})`);

  const { disposition, confidence } = layer1.override
    ? { disposition: "er_now", confidence: 1.0 }
    : deriveDisposition(ensemble, probResult);
  reasoningPath.push(`Disposition: ${disposition} (confidence=${(confidence * 100).toFixed(0)}%)`);

  const explanation = params.generateExplanation !== false
    ? await generateExplanation(complaint, features, ensemble, layer1)
    : "Explanation skipped.";

  return {
    caseId, complaint, features, age, sex,
    layer1_safety: layer1,
    layer2_similar_cases: similarCases,
    layer2_similarity_votes: similarityVotes,
    layer2_disposition_votes: dispositionVotes,
    layer3_probabilistic: probResult,
    layer3_ensemble_differential: ensemble,
    disposition,
    confidence: Math.round(confidence * 100) / 100,
    need_more_info: false,
    next_question: null,
    layer4_explanation: explanation,
    explanation_generating: false,
    reasoning_path: reasoningPath,
    timestamp: new Date().toISOString(),
  };
}

export async function getHybridEngineStats() {
  await ensureInitialized();
  return {
    dataset_size: _dataset.length,
    probabilistic_trained: globalProbEngine.isTrained(),
    adversarial_cases: _dataset.filter(c => c.adversarial).length,
    complaints_covered: [...new Set(_dataset.map(c => c.complaint))].length,
  };
}

export function updateProbabilisticFromOutcome(symptoms: string[], finalDx: string): void {
  globalProbEngine.updateFromOutcome(symptoms, finalDx);
}

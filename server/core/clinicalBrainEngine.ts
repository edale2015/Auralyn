import { findSimilarCasesForState } from "../similarity/caseSimilarityService";
import { computeDifferentialProbabilities, type DifferentialCandidate } from "../services/diagnostic/differentialProbabilityEngine";
import { selectNextBestQuestion, type NextBestQuestionResult } from "../services/diagnostic/nextBestQuestionEngine";
import { detectRedFlags } from "../agent/safety/redFlags";
import { logBrainDecision } from "./brainAuditLog";
import { storeClinicalCase, findSimilarMemoryCases } from "./clinicalMemoryEngine";
import { normalizeSymptoms } from "./symptomNormalizationEngine";
import { safetyGuard } from "./clinicalSafetyGuard";
import { diagnosticEvidenceEngine, type EvidenceResult } from "./diagnosticEvidenceEngine";
import { computeUncertainty, type UncertaintyResult } from "./uncertaintyEngine";
import { getBulkRecommendations, type TreatmentRecommendation } from "./treatmentEngine";
import { prioritizeTests } from "./testRecommendationEngine";
import { generateBulkReturnPrecautions } from "./returnPrecautionEngine";
import { contradictionEngine, type ContradictionResult } from "./contradictionEngine";
import { evidenceAggregatorEngine, type AggregatedDifferential } from "./evidenceAggregatorEngine";
import { clinicalGovernanceEngine, type GovernanceOutput } from "./clinicalGovernanceEngine";
import { temporalProgressionEngine, type TemporalOutput } from "./temporalProgressionEngine";
import { riskStratificationEngine, type RiskOutput } from "./riskStratificationEngine";
import { guidelineAdherenceEngine, type GuidelineOutput } from "./guidelineAdherenceEngine";
import { physicianReviewPacketEngine, type PhysicianReviewPacket } from "./physicianReviewPacketEngine";
import { dispositionCalibrationEngine } from "./dispositionCalibrationEngine";
import { complaintCompletenessEngine } from "./complaintCompletenessEngine";
import { medicationSafetyEngine } from "./medicationSafetyEngine";
import { testYieldEngine } from "./testYieldEngine";
import { physicianFeedbackLearningEngine } from "./physicianFeedbackLearningEngine";

export interface BrainInput {
  complaint: string;
  answers: Record<string, any>;
  state: any;
  differentialCandidates: { clusterId: string; score: number }[];
  availableQuestions: string[];
}

export interface BrainOutput {
  // Core reasoning
  similarity?: any;
  memoryCases?: Array<{ case: any; score: number }>;
  differentials?: DifferentialCandidate[];
  evidenceResults?: EvidenceResult[];
  nextQuestion?: string | null;
  questionRankings?: NextBestQuestionResult["rankings"];
  redFlags?: string[];
  disposition?: string;

  // Uncertainty
  uncertainty?: UncertaintyResult;

  // Clinical recommendations
  treatments?: TreatmentRecommendation[];
  tests?: Array<{ test: string; priority: "urgent" | "routine"; supportingDx: string[] }>;
  returnPrecautions?: Array<{ diagnosis: string; precautions: string[] }>;

  // Safety guard
  safetyGuardTrigger?: string | null;
  normalizedSymptoms?: string[];

  // Contradiction engine
  contradictions?: ContradictionResult;

  // Aggregated final differential (Bayesian + similarity + graph merged)
  aggregatedDifferentials?: AggregatedDifferential[];

  // Clinical Governance (supervisor decision + audit tags)
  governance?: GovernanceOutput;

  // Temporal + Risk stratification
  temporal?: TemporalOutput;
  risk?: RiskOutput;

  // Guideline adherence
  guideline?: GuidelineOutput;

  // Physician handoff packet
  physicianPacket?: PhysicianReviewPacket;
}

export async function runClinicalBrain(input: BrainInput): Promise<BrainOutput> {
  const { state, answers, differentialCandidates, availableQuestions } = input;
  const result: BrainOutput = {};
  const timestamp = new Date().toISOString();

  // ─── 1. Symptom Normalization ───────────────────────────────────────────────
  const rawSymptoms = Object.keys(answers).filter((k) => answers[k] === true || answers[k] === "yes");
  const normalizedSyms = normalizeSymptoms(rawSymptoms);
  result.normalizedSymptoms = normalizedSyms;

  // ─── 2. Contradiction Engine — detect impossible symptom combos ────────────
  try {
    const contradictions = contradictionEngine(normalizedSyms);
    result.contradictions = contradictions;
    if (contradictions.hasErrors) {
      // Hard-error contradictions (e.g. male + pregnancy) route to physician review
      // before running probabilistic reasoning — we still continue so the brain
      // can flag contradictions in the audit log.
      logBrainDecision({
        disposition: "NEEDS_REVIEW",
        contradictions: contradictions.conflicts.map((c) => c.message),
      });
    }
  } catch (err) {
    console.warn("[Brain] Contradiction engine failed:", (err as Error).message);
  }

  // ─── 3. Clinical Safety Guard — hard overrides before any reasoning ────────
  try {
    const guard = safetyGuard(normalizedSyms);
    if (guard.disposition === "ER_NOW") {
      result.disposition = "ER_NOW";
      result.safetyGuardTrigger = guard.triggerRule;
      result.redFlags = guard.matchedSymptoms;
      logBrainDecision({ disposition: "ER_NOW", safetyRule: guard.triggerRule, symptoms: normalizedSyms });
      storeClinicalCase({
        complaint: input.complaint,
        answers,
        predictedDifferentials: [],
        predictedDisposition: "ER_NOW",
        timestamp,
      });
      return result;
    }
  } catch (err) {
    console.warn("[Brain] Safety guard failed:", (err as Error).message);
  }

  // ─── 3. Memory Retrieval — learn from past similar cases ──────────────────
  try {
    const memoryCases = findSimilarMemoryCases(input.complaint, answers, 5);
    result.memoryCases = memoryCases;
    if (memoryCases.length > 0) {
      state.memorySimilarCases = memoryCases;
    }
  } catch (err) {
    console.warn("[Brain] Memory retrieval failed:", (err as Error).message);
  }

  // ─── 4. Case Similarity Engine — vector-style case matching ───────────────
  try {
    const sim = await findSimilarCasesForState(state, 5);
    result.similarity = sim;
    if (sim.summary?.safetyWarnings?.length > 0) {
      state.safetyWarnings = sim.summary.safetyWarnings;
    }
  } catch (err) {
    console.warn("[Brain] Similarity engine failed:", (err as Error).message);
  }

  // ─── 5. Knowledge Graph Evidence Engine ───────────────────────────────────
  try {
    const evidenceResults = diagnosticEvidenceEngine(normalizedSyms, answers);
    result.evidenceResults = evidenceResults;
    // Augment differentialCandidates with graph results for Bayesian step
    for (const ev of evidenceResults) {
      if (!differentialCandidates.some((d) => d.clusterId === ev.diagnosis)) {
        differentialCandidates.push({ clusterId: ev.diagnosis, score: ev.graphScore });
      } else {
        const existing = differentialCandidates.find((d) => d.clusterId === ev.diagnosis)!;
        existing.score = Math.max(existing.score, ev.graphScore);
      }
    }
  } catch (err) {
    console.warn("[Brain] Evidence engine failed:", (err as Error).message);
  }

  // ─── 6. Bayesian Differential Engine ──────────────────────────────────────
  let differentials: DifferentialCandidate[] | undefined;
  try {
    differentials = computeDifferentialProbabilities(differentialCandidates, answers);
    result.differentials = differentials;
  } catch (err) {
    console.warn("[Brain] Differential engine failed:", (err as Error).message);
  }

  // ─── 6b. Evidence Aggregator — merge Bayesian + similarity + graph ─────────
  try {
    const bayesianScores = (differentials ?? []).map((d) => ({
      diagnosis: d.clusterId,
      score: d.posteriorProbability,
    }));
    const similarityScores = (result.similarity?.topMatches ?? []).map((m: any) => ({
      diagnosis: m.clusterId ?? m.complaint ?? "",
      score: m.score ?? 0,
    }));
    const graphScores = (result.evidenceResults ?? []).map((e) => ({
      diagnosis: e.diagnosis,
      score: e.combinedScore,
    }));
    result.aggregatedDifferentials = evidenceAggregatorEngine(
      bayesianScores,
      similarityScores,
      graphScores
    );
  } catch (err) {
    console.warn("[Brain] Evidence aggregator failed:", (err as Error).message);
  }

  // ─── 6c. Temporal Progression + Risk Stratification ──────────────────────
  //        Boost aggregated differentials with clinical context signals
  try {
    const temporal = temporalProgressionEngine({
      complaint:          input.complaint,
      normalizedSymptoms: result.normalizedSymptoms ?? [],
      answeredQuestions:  answers,
    });
    result.temporal = temporal;

    const risk = riskStratificationEngine({
      complaint:          input.complaint,
      normalizedSymptoms: result.normalizedSymptoms ?? [],
      answeredQuestions:  answers,
    });
    result.risk = risk;

    // Apply temporal + risk boosts to aggregated differentials (15 % each)
    if (result.aggregatedDifferentials?.length) {
      result.aggregatedDifferentials = result.aggregatedDifferentials
        .map((d) => ({
          ...d,
          score:
            d.score +
            (temporal.diagnosisBoosts[d.diagnosis] ?? 0) * 0.15 +
            (risk.diagnosisBoosts[d.diagnosis]    ?? 0) * 0.15,
        }))
        .sort((a, b) => b.score - a.score);
    }
  } catch (err) {
    console.warn("[Brain] Temporal/Risk engines failed:", (err as Error).message);
  }

  // ─── 7. Uncertainty Engine — decide if we need more information ────────────
  try {
    const uncertainty = computeUncertainty(differentials ?? []);
    result.uncertainty = uncertainty;
    state.clinicalUncertainty = uncertainty;
  } catch (err) {
    console.warn("[Brain] Uncertainty engine failed:", (err as Error).message);
  }

  // ─── 8. Red Flag Safety Layer (rule-based, using full state) ──────────────
  try {
    const flags = detectRedFlags(state);
    result.redFlags = flags;
    if (flags?.length > 0) {
      result.disposition = "ER_NOW";
      logBrainDecision({ differentials: result.differentials, disposition: "ER_NOW", redFlags: flags });
      storeClinicalCase({
        complaint: input.complaint,
        answers,
        predictedDifferentials: result.differentials ?? [],
        predictedDisposition: "ER_NOW",
        timestamp,
      });
      return result;
    }
  } catch (err) {
    console.warn("[Brain] Red flag engine failed:", (err as Error).message);
  }

  // ─── 9. Next-Best-Question Selector ───────────────────────────────────────
  try {
    // Only ask more questions if uncertain or no strong leading diagnosis
    const shouldAsk = result.uncertainty?.recommendation !== "confident";
    if (shouldAsk && availableQuestions.length > 0) {
      const nbq = selectNextBestQuestion(differentialCandidates, answers, availableQuestions);
      result.nextQuestion = nbq.bestQuestion;
      result.questionRankings = nbq.rankings;
    }
  } catch (err) {
    console.warn("[Brain] Next-question engine failed:", (err as Error).message);
  }

  // ─── 10. Disposition Logic ─────────────────────────────────────────────────
  if (differentials && differentials.length > 0) {
    const top = differentials[0];
    if (result.uncertainty?.recommendation === "ask_more") {
      result.disposition = "NEEDS_MORE_INFO";
    } else if (top.posteriorProbability > 0.6) {
      result.disposition = "LIKELY_OUTPATIENT";
    } else if (top.posteriorProbability > 0.3) {
      result.disposition = "URGENT_CARE";
    } else {
      result.disposition = "NEEDS_MORE_INFO";
    }
  }

  // ─── 10b. Guideline Adherence Check ───────────────────────────────────────
  try {
    const topDx     = result.aggregatedDifferentials?.[0]?.diagnosis
                   ?? result.differentials?.[0]?.clusterId;
    const testsList = (result.tests ?? []).map((t) => ({
      name:    t.test ?? "",
      urgency: (t.priority ?? "routine") as "urgent" | "routine",
    }));
    const guideline = guidelineAdherenceEngine({
      complaint:          input.complaint,
      normalizedSymptoms: result.normalizedSymptoms ?? [],
      answeredQuestions:  answers,
      topDiagnosis:       topDx,
      proposedDisposition: result.disposition,
      proposedTests:      testsList,
    });
    result.guideline = guideline;

    // Guideline violations escalate disposition
    if (!guideline.passed && result.disposition === "LIKELY_OUTPATIENT") {
      result.disposition = "NEEDS_PHYSICIAN_REVIEW";
    }
  } catch (err) {
    console.warn("[Brain] Guideline engine failed:", (err as Error).message);
  }

  // ─── 11. Complaint Completeness — gate soft-discharges on missing data ──────
  try {
    const completeness = complaintCompletenessEngine({
      complaint:          input.complaint,
      answeredQuestions:  answers,
      normalizedSymptoms: result.normalizedSymptoms ?? [],
    });
    result.completeness = completeness;
    if (!completeness.complete &&
        ["home_care", "routine_followup", "LIKELY_OUTPATIENT"].includes(result.disposition ?? "")) {
      result.disposition = "NEEDS_MORE_INFO";
    }
  } catch (err) {
    console.warn("[Brain] Completeness engine failed:", (err as Error).message);
  }

  // ─── 11b. Treatment & Test Recommendations ────────────────────────────────
  try {
    const topDx = (differentials ?? []).slice(0, 5);
    result.treatments = getBulkRecommendations(topDx);
    result.tests = prioritizeTests(topDx);
    result.returnPrecautions = generateBulkReturnPrecautions(topDx);
  } catch (err) {
    console.warn("[Brain] Recommendation engines failed:", (err as Error).message);
  }

  // ─── 11c. Test Yield Scoring ───────────────────────────────────────────────
  try {
    const rankedDx = (result.aggregatedDifferentials ?? []).map((d) => ({
      diagnosis: d.diagnosis,
      score:     d.score,
    }));
    const proposedTests = (result.tests ?? []).map((t) => ({
      name:    t.test ?? "",
      urgency: (t.priority ?? "routine") as "urgent" | "routine",
    }));
    result.testYield = testYieldEngine({
      complaint:       input.complaint,
      rankedDiagnoses: rankedDx,
      proposedTests,
    });
  } catch (err) {
    console.warn("[Brain] Test yield engine failed:", (err as Error).message);
  }

  // ─── 11d. Medication Safety Screening ─────────────────────────────────────
  try {
    const candidates = (result.treatments ?? []).map((t) => ({ name: t.treatmentName ?? "" }));
    const medSafety = medicationSafetyEngine({
      complaint:            input.complaint,
      topDiagnoses:         (result.aggregatedDifferentials ?? []).slice(0, 3).map((d) => d.diagnosis),
      candidateMedications: candidates,
      answeredQuestions:    answers,
      allergies:            answers?.allergies ?? [],
    });
    result.medicationSafety = medSafety;
  } catch (err) {
    console.warn("[Brain] Medication safety engine failed:", (err as Error).message);
  }

  // ─── 12. Clinical Governance — supervisor decision + audit tags ───────────
  try {
    const topBayesian = (result.differentials ?? []).map((d) => ({
      diagnosis: d.clusterId,
      probability: d.posteriorProbability,
    }));
    const topGraph = (result.evidenceResults ?? []).map((e) => ({
      diagnosis: e.diagnosis,
      score: e.combinedScore,
    }));
    const combined = (result.aggregatedDifferentials ?? []).map((a) => ({
      diagnosis: a.diagnosis,
      score: a.score,
    }));
    const treatmentNames = (result.treatments ?? []).map((t) => t.treatmentName ?? "");
    const testsList = (result.tests ?? []).map((t) => ({
      name: t.test ?? "",
      urgency: t.priority ?? "routine",
    }));
    const precautionsList = (result.returnPrecautions ?? []).flatMap(
      (r) => r.precautions ?? []
    );

    const governance = clinicalGovernanceEngine({
      caseId: state?.sessionId ?? undefined,
      complaint: input.complaint,
      normalizedSymptoms: result.normalizedSymptoms ?? [],
      answeredQuestions: answers,
      unansweredQuestions: availableQuestions,
      graphDifferential: topGraph,
      bayesianDifferential: topBayesian,
      combinedDifferential: combined,
      treatments: treatmentNames,
      tests: testsList,
      returnPrecautions: precautionsList,
      safetyOverride: result.safetyGuardTrigger
        ? { triggered: true, ruleId: result.safetyGuardTrigger }
        : null,
      redFlags: result.redFlags ?? [],
      entropy: result.uncertainty?.entropy,
      disposition: result.disposition,
    });

    result.governance = governance;

    // Generate physician review packet now that all signals are available
    try {
      result.physicianPacket = physicianReviewPacketEngine({
        caseId:                 state?.sessionId,
        complaint:              input.complaint,
        normalizedSymptoms:     result.normalizedSymptoms ?? [],
        answeredQuestions:      answers,
        contradiction:          result.contradictions ?? null,
        safetyOverride:         result.safetyGuardTrigger
          ? { triggered: true, ruleId: result.safetyGuardTrigger }
          : null,
        risk:                   result.risk,
        temporal:               result.temporal,
        aggregatedDifferentials: result.aggregatedDifferentials,
        tests:                  (result.tests ?? []).map((t) => ({
          name: t.test ?? "",
          urgency: (t.priority ?? "routine") as "urgent" | "routine",
        })),
        treatments:             (result.treatments ?? []).map((t) => t.treatmentName ?? ""),
        returnPrecautions:      (result.returnPrecautions ?? []).flatMap((r) => r.precautions ?? []),
        supervisor:             governance,
        guideline:              result.guideline,
      });
    } catch (pkgErr) {
      console.warn("[Brain] Physician packet failed:", (pkgErr as Error).message);
    }

    // Let governance override disposition when it escalates
    if (
      governance.supervisorDecision === "ER_NOW" &&
      result.disposition !== "ER_NOW"
    ) {
      result.disposition = "ER_NOW";
    } else if (
      governance.supervisorDecision === "NEEDS_PHYSICIAN_REVIEW" &&
      !result.disposition?.startsWith("ER")
    ) {
      result.disposition = "NEEDS_PHYSICIAN_REVIEW";
    }
  } catch (err) {
    console.warn("[Brain] Governance engine failed:", (err as Error).message);
  }

  // ─── 12b. Disposition Calibration — final arbiter of disposition ──────────
  try {
    const calibration = dispositionCalibrationEngine({
      complaint:               input.complaint,
      proposedDisposition:     result.disposition ?? "needs_workup",
      aggregatedDifferentials: (result.aggregatedDifferentials ?? []).map((d) => ({
        diagnosis: d.diagnosis,
        score:     d.score,
      })),
      entropy:                 result.uncertainty?.entropy,
      redFlags:                result.redFlags ?? [],
      supervisorDecision:      result.governance?.supervisorDecision,
      riskLevel:               result.risk?.overallRisk,
      guidelinePassed:         result.guideline?.passed,
      contradictionHasErrors:  result.contradictions?.hasErrors,
    });
    result.calibration   = calibration;
    result.disposition   = calibration.finalDisposition;
  } catch (err) {
    console.warn("[Brain] Calibration engine failed:", (err as Error).message);
  }

  // ─── 12c. Physician Feedback Learning Stats (async, dashboard only) ────────
  try {
    result.feedbackStats = physicianFeedbackLearningEngine();
  } catch {
    // non-critical — silently ignore
  }

  // ─── 13. Store in Clinical Memory ─────────────────────────────────────────
  try {
    storeClinicalCase({
      complaint: input.complaint,
      answers,
      predictedDifferentials: result.differentials ?? [],
      predictedDisposition: result.disposition ?? "UNKNOWN",
      timestamp,
    });
  } catch (err) {
    console.warn("[Brain] Memory store failed:", (err as Error).message);
  }

  logBrainDecision({
    differentials: result.differentials?.slice(0, 3),
    disposition: result.disposition,
    uncertainty: result.uncertainty?.entropy,
    safetyGuardTrigger: result.safetyGuardTrigger,
  });

  return result;
}

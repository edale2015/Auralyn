import { getClinicalState, setClinicalState } from "../../state/clinicalStateStore";
import { emitClinicalEvent } from "../../state/clinicalEventBus";
import { evaluateCase } from "../../hybrid-reasoning/hybridController";
import { runExtractionConfidence } from "../../hybrid-reasoning/extractionConfidence";
import { checkLockedRules } from "../../hybrid-reasoning/lockedSafetyRegistry";
import { getNextQuestion } from "../../hybrid-reasoning/followUpEngine";
import { executeCarePathway } from "../../pathways/pathwayExecutor";

export interface WorkerResult {
  caseId: string;
  status: "complete" | "blocked" | "error";
  disposition?: string;
  topDiagnosis?: string;
  confidence?: number;
  followUpQuestion?: string;
  error?: string;
}

const runningWorkers = new Set<string>();

export function isWorkerRunning(caseId: string): boolean {
  return runningWorkers.has(caseId);
}

export async function runReasoningWorker(caseId: string): Promise<WorkerResult> {
  if (runningWorkers.has(caseId)) {
    return { caseId, status: "complete", disposition: getClinicalState(caseId).disposition ?? "processing" };
  }

  runningWorkers.add(caseId);

  try {
    const state = getClinicalState(caseId);
    if (!state.symptoms) {
      runningWorkers.delete(caseId);
      return { caseId, status: "blocked", error: "No symptoms recorded" };
    }

    const extraction = runExtractionConfidence(state.symptoms, state.patient?.age, state.patient?.sex);

    if (!extraction.canProceed) {
      emitClinicalEvent(caseId, "UNCERTAINTY_DETECTED", {
        nextQuestion: extraction.nextQuestion,
        entropy: 99,
        blockReason: extraction.blockReason,
        extractionConfidence: extraction.confidence,
      });
      setClinicalState(caseId, { disposition: "need_more_info" as any, followUpQuestions: [extraction.nextQuestion] });
      runningWorkers.delete(caseId);
      return { caseId, status: "blocked", followUpQuestion: extraction.nextQuestion };
    }

    const complaint = extraction.complaint !== "unknown" ? extraction.complaint : (state.complaint ?? "unknown");
    const features = extraction.features;

    const lockedCheck = await checkLockedRules(complaint, features);
    if (lockedCheck.triggered) {
      emitClinicalEvent(caseId, "RED_FLAG_DETECTED", { flags: lockedCheck.rules.map(r => r.id), source: "locked_safety_registry" });
      emitClinicalEvent(caseId, "ALERTS_UPDATED", { alerts: lockedCheck.rules.map(r => `🔒 ${r.rationale}`) });
      emitClinicalEvent(caseId, "DISPOSITION_SET", { disposition: "er_now" });

      const pathwayResult = executeCarePathway(complaint, "er_now", caseId);
      if (pathwayResult) {
        emitClinicalEvent(caseId, "CARE_PATHWAY_STARTED" as any, { complaint, disposition: "er_now", pathway: pathwayResult.pathway });
        emitClinicalEvent(caseId, "PATHWAY_EXECUTED", { result: pathwayResult });
      }

      runningWorkers.delete(caseId);
      return { caseId, status: "complete", disposition: "er_now", confidence: 1.0 };
    }

    const hybrid = await evaluateCase({ caseId, complaint, features, age: state.patient?.age, sex: state.patient?.sex as any, generateExplanation: true });

    const hybridSummary = {
      disposition: hybrid.disposition,
      confidence: hybrid.confidence,
      topDiagnosis: hybrid.layer3_ensemble_differential?.[0]?.diagnosis ?? hybrid.layer3_probabilistic.topDiagnosis,
      uncertaintyScore: hybrid.layer3_probabilistic.uncertaintyScore,
      triggered_flags: hybrid.layer1_safety.triggered_flags,
      explanation: hybrid.layer4_explanation,
      reasoning_path: hybrid.reasoning_path,
      extractionConfidence: extraction.confidence,
      featuresExtracted: features.length,
    };

    emitClinicalEvent(caseId, "HYBRID_REASONING_COMPLETE", { result: hybridSummary, timestamp: new Date().toISOString() });

    if (hybrid.layer1_safety.override && hybrid.layer1_safety.triggered_flags.length > 0) {
      emitClinicalEvent(caseId, "RED_FLAG_DETECTED", { flags: hybrid.layer1_safety.triggered_flags });
      emitClinicalEvent(caseId, "ALERTS_UPDATED", { alerts: hybrid.layer1_safety.triggered_flags.map((f: string) => `⚠ ${f.replace(/_/g, " ")}`) });
    }

    if (hybrid.layer3_ensemble_differential?.length) {
      emitClinicalEvent(caseId, "DIFFERENTIAL_UPDATED", {
        differential: hybrid.layer3_ensemble_differential.slice(0, 6).map((e: any) => ({ diagnosis: e.diagnosis, confidence: e.combined_score })),
      });
    }

    const answeredIds: string[] = (state as any).answeredQuestionIds ?? [];
    const followUpResult = getNextQuestion(complaint, answeredIds, features);

    if (hybrid.need_more_info && followUpResult.hasQuestion) {
      emitClinicalEvent(caseId, "FOLLOWUP_QUESTION_SUGGESTED" as any, {
        question: followUpResult.question,
        questionsRemaining: followUpResult.questionsRemaining,
        questionsAsked: followUpResult.questionsAsked,
      });
      setClinicalState(caseId, {
        disposition: "need_more_info" as any,
        followUpQuestions: [(followUpResult.question!.text)],
        orchestratorRunAt: new Date().toISOString(),
      });
      runningWorkers.delete(caseId);
      return { caseId, status: "complete", disposition: "need_more_info", followUpQuestion: followUpResult.question!.text };
    }

    if (hybrid.disposition && hybrid.disposition !== "need_more_info") {
      emitClinicalEvent(caseId, "DISPOSITION_SET", { disposition: hybrid.disposition });

      const pathwayResult = executeCarePathway(complaint, hybrid.disposition, caseId);
      if (pathwayResult) {
        emitClinicalEvent(caseId, "CARE_PATHWAY_STARTED" as any, { complaint, disposition: hybrid.disposition, pathway: pathwayResult.pathway });
        emitClinicalEvent(caseId, "PATHWAY_EXECUTED", { result: pathwayResult });
      }
    }

    const note = buildSimpleNote(getClinicalState(caseId));
    emitClinicalEvent(caseId, "NOTE_READY", { note });
    emitClinicalEvent(caseId, "DISCHARGE_READY", { text: buildDischargeText(getClinicalState(caseId)) });
    setClinicalState(caseId, { orchestratorRunAt: new Date().toISOString() });

    runningWorkers.delete(caseId);
    return {
      caseId,
      status: "complete",
      disposition: hybrid.disposition,
      topDiagnosis: hybridSummary.topDiagnosis,
      confidence: hybrid.confidence,
    };
  } catch (err: any) {
    runningWorkers.delete(caseId);
    return { caseId, status: "error", error: err.message };
  }
}

function buildSimpleNote(state: any): string {
  const lines: string[] = [`VISIT NOTE — ${new Date().toLocaleDateString()}`];
  if (state.patient?.age) lines.push(`Patient: ${state.patient.age}yo ${state.patient.sex ?? ""}`);
  if (state.complaint) lines.push(`Chief Complaint: ${state.complaint.replace(/_/g, " ")}`);
  if (state.symptoms) lines.push(`\nSubjective:\n${state.symptoms}`);
  if (state.redFlags?.length) lines.push(`\nRed Flags: ${state.redFlags.join(", ")}`);
  if (state.differential?.length) {
    lines.push(`\nDifferential Diagnosis:`);
    state.differential.slice(0, 5).forEach((d: any, i: number) => {
      lines.push(`  ${i + 1}. ${d.diagnosis?.replace(/_/g, " ")} (${Math.round((d.confidence ?? 0) * 100)}%)`);
    });
  }
  if (state.disposition) lines.push(`\nDisposition: ${state.disposition.replace(/_/g, " ").toUpperCase()}`);
  if (state.hybridResult?.explanation) lines.push(`\nClinical Reasoning:\n${state.hybridResult.explanation}`);
  return lines.join("\n");
}

function buildDischargeText(state: any): string {
  const disp = state.disposition ?? "uncertain";
  const msgs: Record<string, string> = {
    er_now: "⚠ EMERGENCY: Go to the nearest Emergency Room or call 911 immediately.",
    urgent_care: "Please visit an Urgent Care clinic within the next 2-4 hours.",
    routine: "Please follow up with your primary care physician within 2-3 days.",
    home_care: "Your symptoms can be managed at home. Rest and monitor your symptoms.",
    need_more_info: "Please provide the requested information to complete your triage.",
    uncertain: "Please consult with a healthcare provider for proper evaluation.",
  };
  return ["DISCHARGE INSTRUCTIONS", "", msgs[disp] ?? msgs.uncertain, "", "RETURN PRECAUTIONS:", "• Chest pain or severe difficulty breathing", "• High fever (>39°C / 102°F)", "• Confusion, severe headache, or stiff neck", "• Severe worsening of any symptom"].join("\n");
}

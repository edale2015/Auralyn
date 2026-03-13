import { getClinicalState, setClinicalState, type ClinicalState } from "../../state/clinicalStateStore";
import { emitClinicalEvent } from "../../state/clinicalEventBus";
import { evaluateCase } from "../../hybrid-reasoning/hybridController";
import { runExtractionConfidence } from "../../hybrid-reasoning/extractionConfidence";
import { checkLockedRules } from "../../hybrid-reasoning/lockedSafetyRegistry";
import { getNextQuestion } from "../../hybrid-reasoning/followUpEngine";
import { executeCarePathway } from "../../pathways/pathwayExecutor";
import { recordVisit, recordAlert, recordDisposition, recordConfidence, recordFollowUpQuestion, recordCarePathway } from "../../core/monitoring/metrics";

const COMPLAINT_KEYWORDS: Record<string, string[]> = {
  chest_pain:     ["chest pain","chest tightness","chest pressure","palpitations","heart pain"],
  sore_throat:    ["sore throat","throat pain","throat","tonsil","swallowing hurts"],
  cough:          ["cough","coughing","phlegm","sputum","bronchitis","whooping"],
  abdominal_pain: ["abdominal","stomach pain","belly","nausea","vomiting","diarrhea","bowel","gut pain"],
  fever:          ["fever","temperature","hot","chills","rigors","sweating","night sweat","febrile"],
  uti:            ["burning urine","frequency","dysuria","urinary","bladder","urine pain","pee hurts"],
  ear_pain:       ["ear pain","earache","ear discharge","hearing loss","ear hurts","ringing in ear"],
  rash:           ["rash","itching","hives","skin lesion","red spots","blotches","lesion"],
  sinus_pressure: ["sinus","nasal","congestion","stuffed","facial pressure","runny nose","stuffy"],
  headache:       ["headache","migraine","head pain","head pressure","head hurts"],
  dizziness:      ["dizziness","dizzy","vertigo","lightheaded","spinning","unsteady"],
  back_pain:      ["back pain","back ache","lumbar","spine","sciatica","lower back"],
  anxiety:        ["anxiety","panic","anxious","nervous","stress","worry","panic attack"],
  syncope:        ["fainted","passed out","blackout","syncope","loss of consciousness"],
  edema:          ["swelling","swollen","edema","puffy","swollen ankles","bloated legs"],
  shortness_of_breath: ["short of breath","can't breathe","breathless","difficulty breathing"],
  palpitations:   ["palpitations","heart racing","fast heart","irregular heartbeat"],
  vomiting:       ["vomiting","throwing up","puking","emesis","retching"],
  eye_pain:       ["eye pain","eye red","vision","blurry vision","eye discharge"],
  toothache:      ["tooth pain","toothache","jaw pain","dental","gum pain"],
};

const SYMPTOM_KEYWORDS: Record<string, string[]> = {
  fever:               ["fever","high temperature","hot","burning up","febrile"],
  cough:               ["cough","coughing","whooping"],
  shortness_of_breath: ["short of breath","trouble breathing","breathless","can't breathe","wheezing"],
  chest_tightness:     ["tightness","pressure in chest","chest tight","squeezing"],
  radiates_left_arm:   ["arm pain","radiates to arm","left arm","jaw pain"],
  diaphoresis:         ["sweating","drenched","diaphoresis","clammy","soaking"],
  drooling:            ["drooling","can't swallow saliva","excess saliva"],
  muffled_voice:       ["muffled","hot potato voice","voice changed","hoarse"],
  neck_stiffness:      ["stiff neck","neck stiffness","can't bend neck","neck pain"],
  confusion:           ["confused","disoriented","not making sense","altered","delirious"],
  vomiting:            ["vomiting","throwing up","nausea","puking"],
  diarrhea:            ["diarrhea","loose stool","watery stool"],
  rash:                ["rash","red spots","skin lesion","hives"],
  petechiae:           ["petechiae","non-blanching","purple dots"],
  worst_headache:      ["worst headache","thunderclap","sudden severe headache","worst of my life"],
  vision_changes:      ["blurry vision","double vision","vision loss","visual"],
  tachycardia:         ["fast heart","racing heart","palpitations","rapid pulse"],
  hypoxia:             ["low oxygen","oxygen level","fingertips blue","bluish"],
  abdominal_rigidity:  ["rigid","board-like","guarding","rebound"],
  positive_pregnancy_test: ["pregnant","pregnancy test positive","could be pregnant"],
  vaginal_bleeding:    ["vaginal bleeding","spotting","abnormal bleeding"],
  productive_cough:    ["productive cough","yellow phlegm","green phlegm","sputum"],
  pleuritic_pain:      ["worse with breathing","sharp on inhale","pleuritic"],
  recent_immobility:   ["long flight","bed rest","immobile","didn't move","sitting for hours"],
  unilateral_leg_swelling: ["leg swelling","one leg swollen","swollen calf"],
};

function detectComplaint(symptoms: string): string {
  const lower = symptoms.toLowerCase();
  let best = "unknown";
  let bestScore = 0;
  for (const [complaint, keywords] of Object.entries(COMPLAINT_KEYWORDS)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = complaint; }
  }
  return best;
}

function extractFeatures(symptoms: string): string[] {
  const lower = symptoms.toLowerCase();
  return Object.entries(SYMPTOM_KEYWORDS)
    .filter(([, keywords]) => keywords.some(k => lower.includes(k)))
    .map(([feature]) => feature);
}

function buildSimpleNote(state: ClinicalState): string {
  const lines: string[] = [];
  const d = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  lines.push(`VISIT NOTE — ${d}`);
  if (state.patient?.age) lines.push(`Patient: ${state.patient.age}yo ${state.patient.sex ?? ""}`);
  if (state.complaint) lines.push(`Chief Complaint: ${state.complaint.replace(/_/g," ")}`);
  if (state.symptoms) lines.push(`\nSubjective:\n${state.symptoms}`);
  if (state.redFlags?.length) lines.push(`\nRed Flags Detected: ${state.redFlags.join(", ")}`);
  if (state.differential?.length) {
    lines.push(`\nDifferential Diagnosis:`);
    state.differential.slice(0, 5).forEach((d: any, i: number) => {
      lines.push(`  ${i + 1}. ${d.diagnosis?.replace(/_/g," ")} (${Math.round((d.confidence ?? 0) * 100)}%)`);
    });
  }
  if (state.disposition) lines.push(`\nDisposition: ${state.disposition.replace(/_/g," ").toUpperCase()}`);
  if (state.hybridResult?.explanation) lines.push(`\nClinical Reasoning:\n${state.hybridResult.explanation}`);
  return lines.join("\n");
}

function buildDischargeText(state: ClinicalState): string {
  const disp = state.disposition ?? "uncertain";
  const dispMessages: Record<string, string> = {
    er_now: "⚠ EMERGENCY: Go to the nearest Emergency Room or call 911 immediately. Do not delay.",
    urgent_care: "Please visit an Urgent Care clinic within the next 2-4 hours.",
    routine: "Please follow up with your primary care physician within 2-3 days.",
    home_care: "Your symptoms can be managed at home. Rest, stay hydrated, and take OTC medications as needed.",
    need_more_info: "Please provide the requested information so we can complete your triage assessment.",
    uncertain: "Please consult with a healthcare provider for proper evaluation.",
  };
  const lines = [
    "DISCHARGE INSTRUCTIONS",
    "",
    dispMessages[disp] ?? dispMessages.uncertain,
    "",
    "RETURN PRECAUTIONS — Return to care immediately if you develop:",
    "• Chest pain or severe difficulty breathing",
    "• High fever (>39°C / 102°F)",
    "• Confusion, severe headache, or stiff neck",
    "• Severe worsening of any symptom",
    "",
    "This assessment is for triage guidance only and does not replace in-person medical evaluation.",
  ];
  return lines.join("\n");
}

export async function runClinicalOrchestrator(
  caseId: string,
  message?: string
): Promise<ClinicalState & { _meta?: Record<string, unknown> }> {
  if (message) {
    emitClinicalEvent(caseId, "PATIENT_MESSAGE", { message });
  }

  const state = getClinicalState(caseId);
  if (!state.symptoms) return state;
  recordVisit();

  const extraction = runExtractionConfidence(
    state.symptoms,
    state.patient?.age,
    state.patient?.sex
  );

  const registeredComplaint = state.complaint;
  const resolvedComplaint = extraction.complaint !== "unknown"
    ? extraction.complaint
    : registeredComplaint ?? detectComplaint(state.symptoms);

  const canProceed = extraction.canProceed || (resolvedComplaint !== "unknown");

  if (!canProceed) {
    const answeredIds: string[] = (state as any).answeredQuestionIds ?? [];
    const fallbackQ = getNextQuestion(resolvedComplaint, answeredIds, extraction.features);
    const questionText = fallbackQ.hasQuestion ? fallbackQ.question!.text : extraction.nextQuestion;

    if (fallbackQ.hasQuestion) {
      emitClinicalEvent(caseId, "FOLLOWUP_QUESTION_SUGGESTED" as any, {
        question: fallbackQ.question,
        questionsRemaining: fallbackQ.questionsRemaining,
        questionsAsked: fallbackQ.questionsAsked,
      });
      setClinicalState(caseId, {
        pendingQuestion: fallbackQ.question as any,
        disposition: "need_more_info" as any,
        orchestratorRunAt: new Date().toISOString(),
      });
    } else {
      emitClinicalEvent(caseId, "UNCERTAINTY_DETECTED", {
        nextQuestion: questionText,
        entropy: 99,
        blockReason: extraction.blockReason,
        missingFields: extraction.missingFields,
        extractionConfidence: extraction.confidence,
      });
      setClinicalState(caseId, {
        disposition: "need_more_info" as any,
        followUpQuestions: [questionText],
        orchestratorRunAt: new Date().toISOString(),
      });
    }
    return {
      ...getClinicalState(caseId),
      _meta: {
        extractionBlocked: true,
        confidence: extraction.confidence,
        missingFields: extraction.missingFields,
        blockReason: extraction.blockReason,
        nextQuestion: questionText,
      },
    };
  }

  const complaint = resolvedComplaint;

  if (complaint !== "unknown" && !state.complaint) {
    emitClinicalEvent(caseId, "COMPLAINT_IDENTIFIED", { complaint });
  }
  const activeComplaint = state.complaint ?? complaint;

  const features = extraction.features.length > 0
    ? extraction.features
    : extractFeatures(state.symptoms);

  const lockedCheck = await checkLockedRules(activeComplaint, features);
  if (lockedCheck.triggered) {
    emitClinicalEvent(caseId, "RED_FLAG_DETECTED", {
      flags: lockedCheck.rules.map(r => r.id),
      source: "locked_safety_registry",
    });
    emitClinicalEvent(caseId, "ALERTS_UPDATED", {
      alerts: lockedCheck.rules.map(r => `🔒 [${r.id}] ${r.rationale}`),
    });
    emitClinicalEvent(caseId, "DISPOSITION_SET", { disposition: "er_now" });
    recordAlert(); recordDisposition("er_now");
    const pathwayResult = executeCarePathway(activeComplaint, "er_now", caseId);
    if (pathwayResult) {
      emitClinicalEvent(caseId, "CARE_PATHWAY_STARTED" as any, { complaint: activeComplaint, disposition: "er_now", pathway: pathwayResult.pathway });
      emitClinicalEvent(caseId, "PATHWAY_EXECUTED", { result: pathwayResult });
      recordCarePathway();
    }
    const note = buildSimpleNote({ ...getClinicalState(caseId), disposition: "er_now" as any, redFlags: lockedCheck.rules.map(r => r.id) });
    emitClinicalEvent(caseId, "NOTE_READY", { note });
    emitClinicalEvent(caseId, "DISCHARGE_READY", { text: buildDischargeText({ ...getClinicalState(caseId), disposition: "er_now" as any }) });
    setClinicalState(caseId, { orchestratorRunAt: new Date().toISOString() });
    return {
      ...getClinicalState(caseId),
      _meta: {
        lockedRulesTriggered: true,
        rules: lockedCheck.rules.map(r => r.id),
        extractionConfidence: extraction.confidence,
      },
    };
  }

  const hybrid = await evaluateCase({
    caseId,
    complaint: activeComplaint,
    features,
    age: state.patient?.age,
    sex: state.patient?.sex as any,
    generateExplanation: true,
  });

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
    missingFields: extraction.missingFields,
  };

  emitClinicalEvent(caseId, "HYBRID_REASONING_COMPLETE", {
    result: hybridSummary,
    timestamp: new Date().toISOString(),
  });

  if (hybrid.layer1_safety.override && hybrid.layer1_safety.triggered_flags.length > 0) {
    emitClinicalEvent(caseId, "RED_FLAG_DETECTED", {
      flags: hybrid.layer1_safety.triggered_flags,
    });
    emitClinicalEvent(caseId, "ALERTS_UPDATED", {
      alerts: hybrid.layer1_safety.triggered_flags.map(f => `⚠ Safety flag: ${f.replace(/_/g," ")}`),
    });
  }

  if (hybrid.layer3_ensemble_differential?.length) {
    emitClinicalEvent(caseId, "DIFFERENTIAL_UPDATED", {
      differential: hybrid.layer3_ensemble_differential.slice(0, 6).map(e => ({
        diagnosis: e.diagnosis,
        confidence: e.combined_score,
      })),
    });
  }

  const needsInterview = hybrid.need_more_info || hybrid.disposition === "uncertain" || hybrid.disposition === "need_more_info";

  if (needsInterview) {
    const answeredIds: string[] = (state as any).answeredQuestionIds ?? [];
    const existingFeatures = Object.keys((state as any).structuredFacts ?? {});
    const allFeatures = [...new Set([...features, ...existingFeatures])];
    const followUpResult = getNextQuestion(activeComplaint, answeredIds, allFeatures);

    if (followUpResult.hasQuestion) {
      emitClinicalEvent(caseId, "FOLLOWUP_QUESTION_SUGGESTED" as any, {
        question: followUpResult.question,
        questionsRemaining: followUpResult.questionsRemaining,
        questionsAsked: followUpResult.questionsAsked,
      });
      setClinicalState(caseId, {
        pendingQuestion: followUpResult.question as any,
        disposition: "need_more_info" as any,
        interviewComplete: false,
      });
    } else if (!followUpResult.hasQuestion && followUpResult.interviewComplete) {
      setClinicalState(caseId, { interviewComplete: true, pendingQuestion: null });
      emitClinicalEvent(caseId, "UNCERTAINTY_DETECTED", {
        nextQuestion: hybrid.next_question ?? "Please describe any other symptoms you have.",
        entropy: hybrid.layer3_probabilistic.uncertaintyScore,
        interviewComplete: true,
      });
    } else if (hybrid.next_question) {
      emitClinicalEvent(caseId, "UNCERTAINTY_DETECTED", {
        nextQuestion: hybrid.next_question,
        entropy: hybrid.layer3_probabilistic.uncertaintyScore,
      });
    }
  } else if (hybrid.disposition && hybrid.disposition !== "need_more_info" && hybrid.disposition !== "uncertain") {
    emitClinicalEvent(caseId, "DISPOSITION_SET", { disposition: hybrid.disposition });
    recordDisposition(hybrid.disposition);
    recordConfidence(hybrid.confidence ?? 0);
    const pathwayResult = executeCarePathway(activeComplaint, hybrid.disposition, caseId);
    if (pathwayResult) {
      emitClinicalEvent(caseId, "CARE_PATHWAY_STARTED" as any, { complaint: activeComplaint, disposition: hybrid.disposition, pathway: pathwayResult.pathway });
      emitClinicalEvent(caseId, "PATHWAY_EXECUTED", { result: pathwayResult });
      recordCarePathway();
    }
  }

  const note = buildSimpleNote(getClinicalState(caseId));
  emitClinicalEvent(caseId, "NOTE_READY", { note });

  const discharge = buildDischargeText(getClinicalState(caseId));
  emitClinicalEvent(caseId, "DISCHARGE_READY", { text: discharge });

  setClinicalState(caseId, { orchestratorRunAt: new Date().toISOString() });

  return {
    ...getClinicalState(caseId),
    _meta: {
      extractionConfidence: extraction.confidence,
      featuresExtracted: features.length,
      missingFields: extraction.missingFields,
      lockedRulesTriggered: false,
    },
  };
}

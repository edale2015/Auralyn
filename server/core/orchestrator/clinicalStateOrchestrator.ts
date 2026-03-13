import { getClinicalState, setClinicalState, type ClinicalState } from "../../state/clinicalStateStore";
import { emitClinicalEvent } from "../../state/clinicalEventBus";
import { evaluateCase } from "../../hybrid-reasoning/hybridController";

const COMPLAINT_KEYWORDS: Record<string, string[]> = {
  chest_pain:     ["chest pain","chest tightness","chest pressure","palpitations","heart"],
  sore_throat:    ["sore throat","throat pain","throat","swallowing","tonsil"],
  cough:          ["cough","coughing","phlegm","sputum","bronchitis"],
  abdominal_pain: ["abdominal","stomach pain","belly","nausea","vomiting","diarrhea","bowel"],
  fever:          ["fever","temperature","hot","chills","rigors","sweating","night sweat"],
  uti:            ["burning urine","frequency","dysuria","urinary","bladder","urine pain"],
  ear_pain:       ["ear pain","earache","ear discharge","hearing loss","ear"],
  rash:           ["rash","itching","hives","skin lesion","red spots","blotches"],
  sinus_pressure: ["sinus","nasal","congestion","stuffed","facial pressure","runny nose"],
  headache:       ["headache","migraine","head pain","head pressure"],
  dizziness:      ["dizziness","dizzy","vertigo","lightheaded","spinning"],
  back_pain:      ["back pain","back ache","lumbar","spine","sciatica"],
  anxiety:        ["anxiety","panic","anxious","nervous","stress","worry"],
};

const SYMPTOM_KEYWORDS: Record<string, string[]> = {
  fever:          ["fever","high temperature","hot","burning up"],
  cough:          ["cough","coughing"],
  shortness_of_breath: ["short of breath","trouble breathing","breathless","can't breathe","wheezing"],
  chest_tightness:["tightness","pressure in chest","chest tight"],
  radiates_left_arm: ["arm pain","radiates to arm","left arm"],
  diaphoresis:    ["sweating","drenched","diaphoresis","clammy"],
  drooling:       ["drooling","can't swallow saliva"],
  muffled_voice:  ["muffled","hot potato voice","voice changed"],
  neck_stiffness: ["stiff neck","neck stiffness","can't bend neck"],
  confusion:      ["confused","disoriented","not making sense","altered"],
  vomiting:       ["vomiting","throwing up","nausea"],
  diarrhea:       ["diarrhea","loose stool","watery stool"],
  rash:           ["rash","red spots","skin lesion"],
  petechiae:      ["petechiae","non-blanching","purple dots"],
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
  const found: string[] = [];
  for (const [feature, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) found.push(feature);
  }
  return found;
}

function buildSimpleNote(state: ClinicalState): string {
  const lines: string[] = [
    `TELEMEDICINE CLINICAL NOTE`,
    `Case ID: ${state.caseId}`,
    `Date: ${new Date().toISOString().split("T")[0]}`,
    ``,
    `CHIEF COMPLAINT: ${state.complaint?.replace(/_/g," ") ?? "Not identified"}`,
    ``,
    `HISTORY OF PRESENT ILLNESS:`,
    state.symptoms ?? "Patient symptoms not recorded.",
    ``,
    `ASSESSMENT:`,
  ];

  if (state.hybridResult) {
    lines.push(`Top diagnosis: ${state.hybridResult.topDiagnosis.replace(/_/g," ")}`);
    lines.push(`Confidence: ${Math.round(state.hybridResult.confidence * 100)}%`);
    lines.push(`Reasoning: ${state.hybridResult.explanation}`);
  }

  if (state.differential?.length) {
    lines.push(`\nDIFFERENTIAL DIAGNOSIS:`);
    for (const d of state.differential.slice(0, 5)) {
      lines.push(`  - ${d.diagnosis.replace(/_/g," ")} (${Math.round(d.confidence * 100)}%)`);
    }
  }

  if (state.redFlags?.length) {
    lines.push(`\nRED FLAGS: ${state.redFlags.join(", ")}`);
  }

  lines.push(`\nDISPOSITION: ${state.disposition?.replace(/_/g," ").toUpperCase() ?? "Pending"}`);

  return lines.join("\n");
}

function buildDischargeText(state: ClinicalState): string {
  const disp = state.disposition ?? "home_care";
  const complaint = state.complaint?.replace(/_/g," ") ?? "your complaint";

  const instructions: Record<string, string> = {
    er_now:       `IMPORTANT: Please go to the Emergency Room immediately. Do not delay. Call 911 if you cannot get there safely.`,
    urgent_care:  `Please visit an Urgent Care clinic within the next 2–4 hours. Bring this summary with you.`,
    routine:      `Please schedule a follow-up with your primary care physician within 2–3 days.`,
    home_care:    `You may manage your ${complaint} at home. Rest, stay hydrated, and take over-the-counter medications as appropriate.`,
    uncertain:    `Your symptoms require further evaluation. Please contact your physician for guidance.`,
  };

  return [
    `DISCHARGE INSTRUCTIONS`,
    `─────────────────────`,
    instructions[disp] ?? instructions.home_care,
    ``,
    `RETURN PRECAUTIONS — Come back or call 911 if you develop:`,
    `  • Chest pain or difficulty breathing`,
    `  • High fever (>39°C / 102°F)`,
    `  • Confusion or cannot be woken`,
    `  • Severe worsening of any symptom`,
    ``,
    `This summary was generated by an AI assistant and reviewed by the clinical system.`,
  ].join("\n");
}

export async function runClinicalOrchestrator(
  caseId: string,
  message?: string
): Promise<ClinicalState> {
  if (message) {
    emitClinicalEvent(caseId, "PATIENT_MESSAGE", { message });
  }

  const state = getClinicalState(caseId);

  if (!state.symptoms) return state;

  const complaint = detectComplaint(state.symptoms);
  if (complaint !== "unknown" && !state.complaint) {
    emitClinicalEvent(caseId, "COMPLAINT_IDENTIFIED", { complaint });
  }
  const activeComplaint = state.complaint ?? complaint;

  const features = extractFeatures(state.symptoms);

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

  if (hybrid.need_more_info && hybrid.next_question) {
    emitClinicalEvent(caseId, "UNCERTAINTY_DETECTED", {
      nextQuestion: hybrid.next_question,
      entropy: hybrid.layer3_probabilistic.uncertaintyScore,
    });
  } else if (hybrid.disposition && hybrid.disposition !== "need_more_info") {
    emitClinicalEvent(caseId, "DISPOSITION_SET", { disposition: hybrid.disposition });
  }

  const note = buildSimpleNote(getClinicalState(caseId));
  emitClinicalEvent(caseId, "NOTE_READY", { note });

  const discharge = buildDischargeText(getClinicalState(caseId));
  emitClinicalEvent(caseId, "DISCHARGE_READY", { text: discharge });

  setClinicalState(caseId, { orchestratorRunAt: new Date().toISOString() });

  return getClinicalState(caseId);
}

/**
 * AURALYN — Human Factors Layer
 *
 * Detects when a patient is not engaging well with the dialogue and
 * adapts the response. Handles: distress, confusion, disengagement,
 * cognitive concern, language barriers, severe pain, proxy responders.
 *
 * File: server/dialogue/HumanFactorsLayer.ts
 */

import OpenAI from "openai";
import { applyPHIGuard } from "../safety/PHIGuard";

const openai = new OpenAI({
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type HumanFactorSignal =
  | "distress"
  | "confusion"
  | "disengagement"
  | "cognitive_concern"
  | "language_barrier"
  | "severe_pain"
  | "pediatric_proxy"
  | "caregiver_proxy"
  | "none";

export interface HumanFactorsAssessment {
  signal:             HumanFactorSignal;
  confidence:         number;
  indicators:         string[];
  adaptedResponse:    string;
  clinicalNote:       string;
  shouldPauseIntake:  boolean;
  shouldAlertStaff:   boolean;
  escalationMessage:  string | null;
}

export interface ConversationHealthMetrics {
  averageResponseLength:    number;
  shortResponseCount:       number;
  unknownAnswerCount:       number;
  repetitionCount:          number;
  distressWordCount:        number;
  turnsCompleted:           number;
  lastFiveResponseLengths:  number[];
  responseTimeTrend:        "stable" | "declining" | "improving";
  coherenceScore:           number;
}

// ─── Pattern matchers ─────────────────────────────────────────────────────────

const DISTRESS_PATTERNS = [
  /\b(scared|terrified|afraid|frightened|panic|panicking)\b/i,
  /\b(crying|sobbing|can'?t stop crying)\b/i,
  /\b(dying|going to die|am i dying)\b/i,
  /\b(help me|please help|somebody help)\b/i,
  /\b(worst|never felt this bad|unbearable)\b/i,
  /can'?t (breathe|stand|take) (the )?pain/i,
  /\b(really scared|so scared|very scared)\b/i,
];

const CONFUSION_PATTERNS = [
  /\b(don'?t understand|confused|what do you mean|huh\?|what\?)\b/i,
  /\b(say that again|can you repeat|i'?m lost)\b/i,
  /\b(what is (that|this)|i don'?t know what that means)\b/i,
  /^\?+$/,
  /^(huh|what|eh|um+|uh+)\.?\??$/i,
];

const DISENGAGEMENT_PATTERNS = [
  /^(ok|okay|sure|yes|no|yeah|nope|fine|idk|k)\.?$/i,
  /^(\.{1,3}|-+|n\/a)$/,
  /\b(just (get|give) me the doctor|i want to see the doctor)\b/i,
  /\b(this is taking too long|hurry up|just skip this)\b/i,
];

const COGNITIVE_PATTERNS = [
  /\b(i forget|can'?t remember|don'?t remember)\b/i,
  /\b(my (son|daughter|wife|husband|caregiver) (knows|can tell you))\b/i,
  /\b(what day is it|where am i|who are you)\b/i,
];

const LANGUAGE_PATTERNS = [
  /^[^\x00-\x7F]+$/,
  /\b(no (english|speak english|no hablo|habla))\b/i,
  /\b(translator|traduccion|interprete)\b/i,
  /[^\x00-\x7F]{5,}/,
];

const SEVERE_PAIN_PATTERNS = [
  /\b(can'?t (talk|type|think|focus))\b/i,
  /\b(pain is (10|10\/10|a 10))\b/i,
  /\b(agony|excruciating|torture)\b/i,
  /^(ow+|oww+|ahhh+|ugh+)\.?$/i,
];

// ─── Adapted responses ────────────────────────────────────────────────────────

const SIGNAL_RESPONSES: Record<HumanFactorSignal, {
  adaptedResponse: string;
  clinicalNote: string;
  shouldPauseIntake: boolean;
  shouldAlertStaff: boolean;
  escalationMessage: string | null;
}> = {
  distress: {
    adaptedResponse: "I can hear that you're really worried right now, and that makes complete sense. You don't need to answer any more questions. Someone from our team will come to you very shortly. If you are in immediate danger, please call 911.",
    clinicalNote: "Patient expressed distress during intake. Intake paused. Physician or nurse should make personal contact before proceeding.",
    shouldPauseIntake: true,
    shouldAlertStaff: true,
    escalationMessage: "Patient expressed significant distress during intake questionnaire. Please make personal contact immediately.",
  },
  confusion: {
    adaptedResponse: "I'm sorry — that question wasn't clear. Let me ask differently: in your own words, what is bothering you most right now?",
    clinicalNote: "Patient confused by intake questions. Simplified re-phrasing applied. If confusion persists, consider cognitive assessment.",
    shouldPauseIntake: false,
    shouldAlertStaff: false,
    escalationMessage: null,
  },
  disengagement: {
    adaptedResponse: "I know this feels like a lot of questions. You're almost done — just a couple more things and then the doctor will have everything they need. Is there anything making this hard right now?",
    clinicalNote: "Patient showing disengagement — short responses, possible frustration. Physician should be aware intake may be incomplete.",
    shouldPauseIntake: false,
    shouldAlertStaff: false,
    escalationMessage: null,
  },
  cognitive_concern: {
    adaptedResponse: "That's completely fine — you don't need to remember everything. Is there a family member with you today who might help answer a few questions? Or we can have the doctor ask you directly.",
    clinicalNote: "COGNITIVE CONCERN: Patient unable to answer multiple questions. Physician should perform brief cognitive assessment (MMSE or similar).",
    shouldPauseIntake: true,
    shouldAlertStaff: true,
    escalationMessage: "Patient showed possible cognitive impairment during intake. Please assess mental status before proceeding.",
  },
  language_barrier: {
    adaptedResponse: "I want to make sure I understand you correctly. Do you need assistance in another language? Para español, por favor diga 'español'. 请说'中文' for Chinese.",
    clinicalNote: "Language barrier detected. Medical interpreter may be required. Do not proceed with clinical decisions based on this intake.",
    shouldPauseIntake: true,
    shouldAlertStaff: true,
    escalationMessage: "Patient may require medical interpreter. Please assess language needs before clinical intake.",
  },
  severe_pain: {
    adaptedResponse: "It sounds like you're in a lot of pain right now. Please don't try to answer more questions — our team will be with you as soon as possible. If you need emergency help right now, call 911.",
    clinicalNote: "Patient reporting severe pain interfering with communication. Intake paused. Immediate clinical assessment needed.",
    shouldPauseIntake: true,
    shouldAlertStaff: true,
    escalationMessage: "Patient reporting severe pain and unable to complete intake. Please assess immediately.",
  },
  pediatric_proxy: {
    adaptedResponse: "Thank you for helping with these questions. Just to confirm — are you the parent or guardian answering on behalf of the child? That helps us keep the records correct.",
    clinicalNote: "Pediatric proxy respondent detected. Parent/guardian answering on behalf of child. Verify guardian relationship.",
    shouldPauseIntake: false,
    shouldAlertStaff: false,
    escalationMessage: null,
  },
  caregiver_proxy: {
    adaptedResponse: "Thank you for helping. Are you a family member or caregiver for this patient? That helps us understand who we're speaking with.",
    clinicalNote: "Caregiver proxy respondent detected. Third party answering on behalf of patient. Verify relationship and consent.",
    shouldPauseIntake: false,
    shouldAlertStaff: false,
    escalationMessage: null,
  },
  none: {
    adaptedResponse: "",
    clinicalNote: "",
    shouldPauseIntake: false,
    shouldAlertStaff: false,
    escalationMessage: null,
  },
};

// ─── Fast rule-based detection ────────────────────────────────────────────────

function detectFastSignal(
  response: string,
  metrics: ConversationHealthMetrics
): HumanFactorsAssessment {
  const text = response.trim();

  if (DISTRESS_PATTERNS.some(p => p.test(text))) {
    return buildAssessment("distress", 0.95, [`Patient used distress language: ${text.substring(0, 60)}`]);
  }
  if (SEVERE_PAIN_PATTERNS.some(p => p.test(text))) {
    return buildAssessment("severe_pain", 0.9, ["Patient indicated severe pain interfering with communication"]);
  }
  if (LANGUAGE_PATTERNS.some(p => p.test(text))) {
    return buildAssessment("language_barrier", 0.9, ["Non-English response or explicit language barrier indicated"]);
  }
  if (CONFUSION_PATTERNS.some(p => p.test(text))) {
    return buildAssessment("confusion", 0.8, ["Response indicates patient did not understand question"]);
  }
  if (DISENGAGEMENT_PATTERNS.some(p => p.test(text)) && metrics.shortResponseCount >= 3) {
    return buildAssessment("disengagement", 0.85, [
      "Short/evasive response pattern detected across multiple turns",
      `Short response count: ${metrics.shortResponseCount}`,
    ]);
  }
  if (metrics.responseTimeTrend === "declining" && metrics.averageResponseLength < 15 && metrics.turnsCompleted >= 5) {
    return buildAssessment("disengagement", 0.75, [
      "Response length declining across conversation",
      `Average response: ${metrics.averageResponseLength} chars`,
    ]);
  }
  if (metrics.unknownAnswerCount >= 4) {
    return buildAssessment("cognitive_concern", 0.7, [
      `Patient said "don't know" or similar ${metrics.unknownAnswerCount} times`,
    ]);
  }
  if (COGNITIVE_PATTERNS.some(p => p.test(text))) {
    return buildAssessment("cognitive_concern", 0.75, ["Cognitive concern keyword detected"]);
  }

  return buildAssessment("none", 1.0, []);
}

function buildAssessment(
  signal: HumanFactorSignal,
  confidence: number,
  indicators: string[]
): HumanFactorsAssessment {
  const cfg = SIGNAL_RESPONSES[signal];
  return { signal, confidence, indicators, ...cfg };
}

// ─── LLM-based nuanced detection ─────────────────────────────────────────────

async function detectWithLLM(
  latestResponse: string,
  history: string,
  lastQuestion: string,
  metrics: ConversationHealthMetrics
): Promise<HumanFactorsAssessment> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 250,
      messages: [
        {
          role: "system",
          content: `You assess patient communication patterns in a medical intake system.
Identify if the patient shows signs of: distress, confusion, disengagement,
cognitive_concern, language_barrier, severe_pain, pediatric_proxy, caregiver_proxy, or none.
Return JSON only:
{"signal":"distress|confusion|disengagement|cognitive_concern|language_barrier|severe_pain|pediatric_proxy|caregiver_proxy|none","confidence":0-1,"indicators":["brief explanation"]}`,
        },
        {
          role: "user",
          content: `Last question: "${lastQuestion}"\nPatient response: "${latestResponse}"\nRecent history:\n${history}\nMetrics: avg response length ${metrics.averageResponseLength} chars, ${metrics.shortResponseCount} short responses, ${metrics.unknownAnswerCount} unknown answers`,
        },
      ],
    });

    const text   = res.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return buildAssessment(parsed.signal ?? "none", parsed.confidence ?? 0.5, parsed.indicators ?? []);
  } catch {
    return buildAssessment("none", 0, []);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function assessHumanFactors(
  latestResponse:      string,
  metrics:             ConversationHealthMetrics,
  lastQuestion:        string,
  conversationHistory: string[]
): Promise<HumanFactorsAssessment> {
  const fastSignal = detectFastSignal(latestResponse, metrics);
  if (fastSignal.signal !== "none" && fastSignal.confidence >= 0.85) {
    return fastSignal;
  }

  const guardedHistory  = applyPHIGuard(conversationHistory.slice(-6).join("\n"));
  const guardedResponse = applyPHIGuard(latestResponse);
  const llm = await detectWithLLM(guardedResponse, guardedHistory, lastQuestion, metrics);

  return llm.confidence > fastSignal.confidence ? llm : fastSignal;
}

/**
 * Incrementally update health metrics given one new patient response.
 * Use this on each turn instead of rebuilding from the full log.
 */
export function updateMetrics(
  existing: ConversationHealthMetrics,
  newResponse: string
): ConversationHealthMetrics {
  const newLen      = newResponse.trim().length;
  const totalTurns  = existing.turnsCompleted + 1;
  const newAvg      = Math.round(
    (existing.averageResponseLength * existing.turnsCompleted + newLen) / totalTurns
  );

  const isShort    = newLen < 10;
  const isUnknown  = /\b(i don'?t know|idk|not sure|can'?t remember)\b/i.test(newResponse);
  const isDistress = DISTRESS_PATTERNS.some(p => p.test(newResponse));

  const last5 = [...existing.lastFiveResponseLengths.slice(-4), newLen];
  const half        = Math.floor(last5.length / 2);
  const firstHalf   = last5.slice(0, half);
  const secondHalf  = last5.slice(half);
  const avgFirst    = firstHalf.length  ? firstHalf.reduce((a, b)  => a + b, 0) / firstHalf.length  : newAvg;
  const avgSecond   = secondHalf.length ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : newAvg;
  const trend: "stable" | "declining" | "improving" =
    avgSecond < avgFirst * 0.7 ? "declining" :
    avgSecond > avgFirst * 1.3 ? "improving" : "stable";

  const newUnknownCount = existing.unknownAnswerCount + (isUnknown ? 1 : 0);

  return {
    averageResponseLength:   newAvg,
    shortResponseCount:      existing.shortResponseCount + (isShort ? 1 : 0),
    unknownAnswerCount:      newUnknownCount,
    repetitionCount:         existing.repetitionCount,
    distressWordCount:       existing.distressWordCount + (isDistress ? 1 : 0),
    turnsCompleted:          totalTurns,
    lastFiveResponseLengths: last5,
    responseTimeTrend:       trend,
    coherenceScore:          1 - (newUnknownCount / Math.max(totalTurns, 1)),
  };
}

/**
 * Build health metrics from a turn log (answer log from dialogue session).
 */
export function buildHealthMetrics(answerLog: Array<{ answer: string }>): ConversationHealthMetrics {
  const responses  = answerLog.map(a => a.answer ?? "");
  const lengths    = responses.map(r => r.length);
  const shortCount = lengths.filter(l => l < 10).length;
  const unknownCount = responses.filter(r =>
    /\b(i don'?t know|idk|not sure|can'?t remember)\b/i.test(r)
  ).length;
  const distressCount = responses.filter(r =>
    DISTRESS_PATTERNS.some(p => p.test(r))
  ).length;
  const avg = lengths.length > 0 ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0;

  const last5 = lengths.slice(-5);
  const firstHalf  = last5.slice(0, Math.floor(last5.length / 2));
  const secondHalf = last5.slice(Math.floor(last5.length / 2));
  const avgFirst   = firstHalf.length  ? firstHalf.reduce((a,b)  => a+b, 0) / firstHalf.length  : avg;
  const avgSecond  = secondHalf.length ? secondHalf.reduce((a,b) => a+b, 0) / secondHalf.length : avg;
  const trend: "stable" | "declining" | "improving" =
    avgSecond < avgFirst * 0.7 ? "declining" :
    avgSecond > avgFirst * 1.3 ? "improving" :
    "stable";

  return {
    averageResponseLength:   avg,
    shortResponseCount:      shortCount,
    unknownAnswerCount:      unknownCount,
    repetitionCount:         0,
    distressWordCount:       distressCount,
    turnsCompleted:          answerLog.length,
    lastFiveResponseLengths: last5,
    responseTimeTrend:       trend,
    coherenceScore:          1 - (unknownCount / Math.max(answerLog.length, 1)),
  };
}

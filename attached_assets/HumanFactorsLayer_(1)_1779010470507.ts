/**
 * AURALYN — Human Factors Layer
 *
 * Detects when a patient is not engaging well with the dialogue and
 * adapts the response. Clinical questions assume a cooperative, coherent
 * patient. Real patients are often frightened, confused, in pain,
 * cognitively impaired, or simply overwhelmed.
 *
 * Detection categories:
 *   DISTRESS     — patient is frightened, crying, expressing fear
 *   CONFUSION    — patient does not understand questions
 *   DISENGAGEMENT — short/evasive answers, dropping out
 *   COGNITIVE    — possible cognitive impairment, dementia, AMS
 *   LANGUAGE     — non-English, limited English, translation needed
 *   PAIN         — patient is in too much pain to complete intake
 *   PEDIATRIC    — parent answering for child, child speaking
 *   CAREGIVER    — someone else answering on patient's behalf
 *
 * File: server/dialogue/HumanFactorsLayer.ts
 */

import OpenAI from "openai";
import { applyPHIGuard } from "../safety/PHIGuard";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── TYPES ────────────────────────────────────────────────────────────────

export type HumanFactorSignal =
  | "distress"
  | "confusion"
  | "disengagement"
  | "cognitive_concern"
  | "language_barrier"
  | "severe_pain"
  | "pediatric_proxy"    // parent answering for child
  | "caregiver_proxy"    // caregiver answering for adult patient
  | "none";

export interface HumanFactorsAssessment {
  signal: HumanFactorSignal;
  confidence: number;           // 0-1
  indicators: string[];         // what triggered this
  adaptedResponse: string;      // what Auralyn should say instead
  clinicalNote: string;         // what to flag for physician
  shouldPauseIntake: boolean;   // stop asking questions for now
  shouldAlertStaff: boolean;    // someone needs to intervene in person
  escalationMessage: string | null; // what to send to staff if alerting
}

export interface ConversationHealthMetrics {
  averageResponseLength: number;   // chars per response
  shortResponseCount: number;      // responses under 10 chars
  unknownAnswerCount: number;      // "i don't know", "?", etc.
  repetitionCount: number;         // patient asked same thing twice
  distressWordCount: number;       // scared, hurts, crying, etc.
  turnsCompleted: number;
  lastFiveResponseLengths: number[];
  responseTimeTrend: "stable" | "declining" | "improving";
  coherenceScore: number;          // 0-1, derived from answer relevance
}

// ─── PATTERN DETECTORS ────────────────────────────────────────────────────

// Words and phrases that signal distress
const DISTRESS_PATTERNS = [
  /\b(scared|terrified|afraid|frightened|panic|panicking)\b/i,
  /\b(crying|sobbing|can't stop crying)\b/i,
  /\b(dying|going to die|am i dying)\b/i,
  /\b(help me|please help|somebody help)\b/i,
  /\b(worst|never felt this bad|unbearable)\b/i,
  /can'?t (breathe|stand|take) (the )?pain/i,
  /\b(really scared|so scared|very scared)\b/i,
];

// Words and phrases that signal confusion
const CONFUSION_PATTERNS = [
  /\b(don'?t understand|confused|what do you mean|huh\?|what\?)\b/i,
  /\b(say that again|can you repeat|i'?m lost)\b/i,
  /\b(what is (that|this)|i don'?t know what that means)\b/i,
  /^\?+$/, // just question marks
  /^(huh|what|eh|um+|uh+)\.?\??$/i,
];

// Disengagement signals
const DISENGAGEMENT_PATTERNS = [
  /^(ok|okay|sure|yes|no|yeah|nope|fine|idk|k)\.?$/i,
  /^(\.{1,3}|-+|n\/a)$/,
  /\b(just (get|give) me the doctor|i want to see the doctor)\b/i,
  /\b(this is taking too long|hurry up|just skip this)\b/i,
];

// Cognitive concern signals
const COGNITIVE_PATTERNS = [
  /\b(i forget|can'?t remember|don'?t remember)\b/i,
  /\b(my (son|daughter|wife|husband|caregiver) (knows|can tell you))\b/i,
  /\b(what day is it|where am i|who are you)\b/i,
  // Answers that don't relate to the question at all
];

// Language barrier signals
const LANGUAGE_PATTERNS = [
  /^[^\x00-\x7F]+$/, // non-ASCII characters (non-English)
  /\b(no (english|speak english|hablo|habla))\b/i,
  /\b(translator|traduccion|interprete|需要|翻译)\b/i,
];

// Severe pain signals
const SEVERE_PAIN_PATTERNS = [
  /\b(can'?t (talk|type|think|focus))\b/i,
  /\b(pain is (10|10\/10|a 10))\b/i,
  /\b(agony|excruciating|torture)\b/i,
  /^(ow+|oww+|ahhh+|ugh+)\.?$/i,
];

// ─── MAIN ASSESSMENT FUNCTION ─────────────────────────────────────────────

export async function assessHumanFactors(
  latestResponse: string,
  metrics: ConversationHealthMetrics,
  lastQuestion: string,
  conversationHistory: string[]
): Promise<HumanFactorsAssessment> {

  // ── Rule-based fast detection (no LLM, immediate) ────────────────────
  const fastSignal = detectFastSignal(latestResponse, metrics);

  if (fastSignal.signal !== "none" && fastSignal.confidence >= 0.85) {
    // High confidence — return immediately without LLM
    return fastSignal;
  }

  // ── LLM-based nuanced detection (for ambiguous cases) ────────────────
  const guardedHistory = applyPHIGuard(conversationHistory.slice(-6).join("\n"));
  const guardedResponse = applyPHIGuard(latestResponse);

  const llmAssessment = await detectWithLLM(
    guardedResponse,
    guardedHistory,
    lastQuestion,
    metrics
  );

  // Merge: take the higher confidence signal
  if (llmAssessment.confidence > fastSignal.confidence) {
    return llmAssessment;
  }
  return fastSignal;
}

function detectFastSignal(
  response: string,
  metrics: ConversationHealthMetrics
): HumanFactorsAssessment {
  const text = response.trim();

  // Distress
  if (DISTRESS_PATTERNS.some(p => p.test(text))) {
    return buildAssessment("distress", 0.95, [
      "Patient used distress language: " + text.substring(0, 60),
    ], metrics);
  }

  // Severe pain
  if (SEVERE_PAIN_PATTERNS.some(p => p.test(text))) {
    return buildAssessment("severe_pain", 0.9, [
      "Patient indicated severe pain interfering with communication",
    ], metrics);
  }

  // Language barrier
  if (LANGUAGE_PATTERNS.some(p => p.test(text))) {
    return buildAssessment("language_barrier", 0.9, [
      "Non-English response or explicit language barrier indicated",
    ], metrics);
  }

  // Confusion (single response)
  if (CONFUSION_PATTERNS.some(p => p.test(text))) {
    return buildAssessment("confusion", 0.8, [
      "Response indicates patient did not understand question",
    ], metrics);
  }

  // Disengagement pattern
  if (DISENGAGEMENT_PATTERNS.some(p => p.test(text)) &&
      metrics.shortResponseCount >= 3) {
    return buildAssessment("disengagement", 0.85, [
      "Short/evasive response pattern detected across multiple turns",
      `Short response count: ${metrics.shortResponseCount}`,
    ], metrics);
  }

  // Declining response length trend
  if (metrics.responseTimeTrend === "declining" &&
      metrics.averageResponseLength < 15 &&
      metrics.turnsCompleted >= 5) {
    return buildAssessment("disengagement", 0.75, [
      "Response length declining across conversation",
      `Average response: ${metrics.averageResponseLength} chars`,
    ], metrics);
  }

  // Unknown answers accumulating
  if (metrics.unknownAnswerCount >= 4) {
    return buildAssessment("cognitive_concern", 0.7, [
      `Patient said "don't know" or similar ${metrics.unknownAnswerCount} times`,
    ], metrics);
  }

  return {
    signal: "none",
    confidence: 1.0,
    indicators: [],
    adaptedResponse: "",
    clinicalNote: "",
    shouldPauseIntake: false,
    shouldAlertStaff: false,
    escalationMessage: null,
  };
}

async function detectWithLLM(
  latestResponse: string,
  history: string,
  lastQuestion: string,
  metrics: ConversationHealthMetrics
): Promise<HumanFactorsAssessment> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You assess patient communication patterns in a medical intake system.
Identify if the patient shows signs of: distress, confusion, disengagement,
cognitive_concern, language_barrier, severe_pain, pediatric_proxy, caregiver_proxy, or none.

Return JSON only:
{
  "signal": "distress|confusion|disengagement|cognitive_concern|language_barrier|severe_pain|pediatric_proxy|caregiver_proxy|none",
  "confidence": 0-1,
  "indicators": ["brief explanation"],
  "requiresImmediateAttention": boolean
}`
        },
        {
          role: "user",
          content: `Last question: "${lastQuestion}"
Patient response: "${latestResponse}"
Recent history:
${history}
Metrics: avg response length ${metrics.averageResponseLength} chars, ${metrics.shortResponseCount} short responses, ${metrics.unknownAnswerCount} unknown answers`
        }
      ]
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const clean = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return buildAssessment(
      parsed.signal || "none",
      parsed.confidence || 0.5,
      parsed.indicators || [],
      metrics
    );
  } catch {
    return { signal: "none", confidence: 0, indicators: [], adaptedResponse: "", clinicalNote: "", shouldPauseIntake: false, shouldAlertStaff: false, escalationMessage: null };
  }
}

// ─── RESPONSE ADAPTER ────────────────────────────────────────────────────
// Generates the right response for each human factor signal

function buildAssessment(
  signal: HumanFactorSignal,
  confidence: number,
  indicators: string[],
  metrics: ConversationHealthMetrics
): HumanFactorsAssessment {

  const responses: Record<HumanFactorSignal, {
    adaptedResponse: string;
    clinicalNote: string;
    shouldPauseIntake: boolean;
    shouldAlertStaff: boolean;
    escalationMessage: string | null;
  }> = {
    distress: {
      adaptedResponse: "I can hear that you're really worried right now, and that makes complete sense. You don't need to answer any more questions right now. Someone from our team is going to come to you very shortly. If you are in immediate danger, please call 911. You are not alone.",
      clinicalNote: "Patient expressed distress during intake. Intake paused. Physician or nurse should make personal contact before proceeding with clinical questions.",
      shouldPauseIntake: true,
      shouldAlertStaff: true,
      escalationMessage: "Patient expressed significant distress during intake questionnaire. Please make personal contact immediately.",
    },
    confusion: {
      adaptedResponse: "I'm sorry — that question wasn't clear. Let me ask it differently. Just tell me in your own words: what is bothering you most right now?",
      clinicalNote: "Patient confused by intake questions. Simplified re-phrasing applied. If confusion persists, consider cognitive assessment.",
      shouldPauseIntake: false,
      shouldAlertStaff: false,
      escalationMessage: null,
    },
    disengagement: {
      adaptedResponse: "I know this feels like a lot of questions. You're almost done — just a couple more things and then the doctor will have everything they need. Is there anything making this hard right now?",
      clinicalNote: "Patient showing signs of disengagement. Short responses, possible frustration. Physician should be aware intake may be incomplete.",
      shouldPauseIntake: false,
      shouldAlertStaff: false,
      escalationMessage: null,
    },
    cognitive_concern: {
      adaptedResponse: "That's completely fine — you don't need to remember everything. Is there a family member or someone with you today who might be able to help answer a few of these questions? Or we can just have the doctor ask you directly.",
      clinicalNote: "COGNITIVE CONCERN: Patient unable to answer multiple questions, possible cognitive impairment or altered mental status. Physician should perform brief cognitive assessment (MMSE or similar).",
      shouldPauseIntake: true,
      shouldAlertStaff: true,
      escalationMessage: "Patient showed possible cognitive impairment during intake — unable to answer multiple questions. Please assess mental status before proceeding.",
    },
    language_barrier: {
      adaptedResponse: "No problem at all. We want to make sure you get the right care. Please let the front desk know what language you prefer and we will get an interpreter for you right away. ¿Prefiere hablar en español? 您需要翻译吗？",
      clinicalNote: "Language barrier detected. Interpreter needed before clinical intake can proceed. Document preferred language.",
      shouldPauseIntake: true,
      shouldAlertStaff: true,
      escalationMessage: "Patient requires interpreter. Intake paused. Please arrange language assistance before proceeding.",
    },
    severe_pain: {
      adaptedResponse: "Please don't try to type right now — I can see you're in a lot of pain. Tell a staff member you need help right now, or if you're alone, call 911. We can get the rest of the information from you after we help with your pain.",
      clinicalNote: "Patient indicated severe pain interfering with ability to complete intake. Pain management should be addressed before continuing history.",
      shouldPauseIntake: true,
      shouldAlertStaff: true,
      escalationMessage: "Patient in severe pain — unable to complete intake. Immediate pain assessment needed.",
    },
    pediatric_proxy: {
      adaptedResponse: "Thank you for helping with this. Are you the parent or guardian? Just a few questions and then the doctor will see your child. How old is your child, and what is worrying you most about them today?",
      clinicalNote: "Parent/guardian completing intake on behalf of pediatric patient. Verify relationship and obtain weight for pediatric dosing.",
      shouldPauseIntake: false,
      shouldAlertStaff: false,
      escalationMessage: null,
    },
    caregiver_proxy: {
      adaptedResponse: "Thank you for helping. Can you tell me your relationship to the patient? And is the patient with you right now, or are you calling on their behalf?",
      clinicalNote: "Caregiver completing intake on behalf of adult patient. Verify proxy authority. Confirm patient location and condition.",
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

  const config = responses[signal];
  return { signal, confidence, indicators, ...config };
}

// ─── METRICS TRACKER ─────────────────────────────────────────────────────

export function updateMetrics(
  current: ConversationHealthMetrics,
  newResponse: string
): ConversationHealthMetrics {
  const len = newResponse.trim().length;
  const isShort = len < 10;
  const isUnknown = /\b(i don'?t know|idk|not sure|no idea|\?+)\b/i.test(newResponse);

  const lastFive = [...current.lastFiveResponseLengths.slice(-4), len];
  const trend = lastFive.length >= 3
    ? lastFive[lastFive.length - 1] < lastFive[0] * 0.5 ? "declining"
    : lastFive[lastFive.length - 1] > lastFive[0] * 1.5 ? "improving"
    : "stable"
    : "stable";

  const distressWordCount = current.distressWordCount +
    (DISTRESS_PATTERNS.some(p => p.test(newResponse)) ? 1 : 0);

  return {
    averageResponseLength: Math.round(
      (current.averageResponseLength * current.turnsCompleted + len) /
      (current.turnsCompleted + 1)
    ),
    shortResponseCount: current.shortResponseCount + (isShort ? 1 : 0),
    unknownAnswerCount: current.unknownAnswerCount + (isUnknown ? 1 : 0),
    repetitionCount: current.repetitionCount,
    distressWordCount,
    turnsCompleted: current.turnsCompleted + 1,
    lastFiveResponseLengths: lastFive,
    responseTimeTrend: trend,
    coherenceScore: current.coherenceScore, // updated by LLM assessment
  };
}

export function initialMetrics(): ConversationHealthMetrics {
  return {
    averageResponseLength: 0,
    shortResponseCount: 0,
    unknownAnswerCount: 0,
    repetitionCount: 0,
    distressWordCount: 0,
    turnsCompleted: 0,
    lastFiveResponseLengths: [],
    responseTimeTrend: "stable",
    coherenceScore: 1.0,
  };
}

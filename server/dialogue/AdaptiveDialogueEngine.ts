/**
 * AdaptiveDialogueEngine.ts
 * Phase-driven, complaint-aware conversation engine.
 * Manages dialogue sessions stored in dialogue_sessions DB table.
 * Uses complaint packs to drive question selection; OpenAI for natural language wrapping.
 */

import OpenAI from "openai";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { extractClinicalState, mergeClinicalStateDelta } from "../kb/ClinicalStateExtractor";
import { getComplaintPack, type ExtractedClinicalState, type AnswerEntry } from "../kb/complaintPacks/index";
import type { DialogueQuestion, QuestionSet } from "../kb/complaintPacks/types";
import { applyPHIGuard } from "../safety/PHIGuard";

const openai = new OpenAI({
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type DialoguePhase = "greeting" | "hpi" | "ros" | "pmh" | "safety" | "complete";

export interface DialogueTurn {
  turnIndex:     number;
  phase:         DialoguePhase;
  questionId:    string;
  questionText:  string;
  promptText:    string;   // LLM-wrapped natural language version
  respondedAt?:  string;
  answer?:       string;
}

export interface DialogueSession {
  id:                 string;
  encounterId:        string;
  patientId:          string;
  channel:            string;
  phase:              DialoguePhase;
  startedAt:          string;
  completedAt?:       string;
  turns:              DialogueTurn[];
  answerLog:          AnswerEntry[];
  clinicalState:      ExtractedClinicalState | null;
  safetyAlerts:       string[];
  isComplete:         boolean;
}

export interface ProcessResponseResult {
  sessionId:          string;
  phase:              DialoguePhase;
  nextPrompt?:        string;
  nextQuestionId?:    string;
  safetyAlert?:       string;
  isComplete:         boolean;
  triageSummary?:     any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHASE_ORDER: DialoguePhase[] = ["greeting", "hpi", "ros", "pmh", "safety", "complete"];

function nextPhase(current: DialoguePhase): DialoguePhase {
  const idx = PHASE_ORDER.indexOf(current);
  return PHASE_ORDER[Math.min(idx + 1, PHASE_ORDER.length - 1)] as DialoguePhase;
}

function getQuestionsForPhase(
  pack: ReturnType<typeof getComplaintPack>,
  phase: DialoguePhase,
  state: ExtractedClinicalState
): DialogueQuestion[] {
  if (!pack || phase === "greeting" || phase === "complete") return [];
  const set: QuestionSet | undefined = pack.questionSets.find(qs => qs.phase === phase);
  if (!set) return [];
  return set.questions.filter(q => !q.condition || q.condition(state));
}

function findNextUnansweredQuestion(
  questions: DialogueQuestion[],
  answeredIds: Set<string>
): DialogueQuestion | null {
  return questions.find(q => !answeredIds.has(q.id)) ?? null;
}

async function wrapQuestionNaturally(
  questionText: string,
  phase: DialoguePhase,
  chiefComplaint: string,
  turnIndex: number
): Promise<string> {
  if (turnIndex === 0 && phase === "hpi") {
    return questionText; // First question is delivered as-is for speed
  }
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 100,
      messages: [
        {
          role: "system",
          content: `You are a compassionate medical intake assistant. Rephrase the following clinical question in warm, conversational language for a patient presenting with ${chiefComplaint}. Keep it to 1-2 sentences. Do NOT add medical disclaimers. Do NOT change the meaning.`,
        },
        { role: "user", content: questionText },
      ],
    });
    return res.choices[0]?.message?.content?.trim() ?? questionText;
  } catch {
    return questionText;
  }
}

async function checkSafetyAlerts(
  state: ExtractedClinicalState,
  pack: ReturnType<typeof getComplaintPack>
): Promise<string[]> {
  if (!pack) return [];
  const critical = pack.redFlags.filter(rf => rf.severity === "critical" && rf.match(state));
  return critical.map(rf => rf.label);
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function loadSession(sessionId: string): Promise<DialogueSession | null> {
  const rows = await db.execute(sql`
    SELECT * FROM dialogue_sessions WHERE id = ${sessionId} LIMIT 1
  `);
  if (!rows.rows.length) return null;
  const row = rows.rows[0] as any;
  return {
    id:            row.id,
    encounterId:   row.encounter_id,
    patientId:     row.patient_id,
    channel:       row.channel,
    phase:         row.phase as DialoguePhase,
    startedAt:     row.started_at,
    completedAt:   row.completed_at,
    turns:         typeof row.turns_json === "string" ? JSON.parse(row.turns_json) : (row.turns_json ?? []),
    answerLog:     typeof row.answer_log_json === "string" ? JSON.parse(row.answer_log_json) : (row.answer_log_json ?? []),
    clinicalState: typeof row.clinical_state_json === "string" ? JSON.parse(row.clinical_state_json) : (row.clinical_state_json ?? null),
    safetyAlerts:  typeof row.safety_alerts === "string" ? JSON.parse(row.safety_alerts) : (row.safety_alerts ?? []),
    isComplete:    row.is_complete ?? false,
  };
}

async function saveSession(session: DialogueSession): Promise<void> {
  const turnsJson   = JSON.stringify(session.turns);
  const answerJson  = JSON.stringify(session.answerLog);
  const stateJson   = JSON.stringify(session.clinicalState ?? {});
  const alertsJson  = JSON.stringify(session.safetyAlerts);

  await db.execute(sql`
    UPDATE dialogue_sessions SET
      phase               = ${session.phase},
      completed_at        = ${session.completedAt ?? null},
      turns_json          = ${turnsJson}::jsonb,
      answer_log_json     = ${answerJson}::jsonb,
      clinical_state_json = ${stateJson}::jsonb,
      safety_alerts       = ${alertsJson}::jsonb,
      is_complete         = ${session.isComplete}
    WHERE id = ${session.id}
  `);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface StartSessionOptions {
  encounterId:    string;
  patientId:      string;
  complaintId:    string;
  chiefComplaint: string;
  channel?:       string;
  ageYears?:      number;
  sex?:           "male" | "female" | "other";
}

/**
 * Start a new dialogue session.
 * Returns the session ID and first prompt.
 */
export async function startSession(opts: StartSessionOptions): Promise<{ sessionId: string; firstPrompt: string }> {
  const pack = getComplaintPack(opts.complaintId);

  // Create DB row
  const res = await db.execute(sql`
    INSERT INTO dialogue_sessions (encounter_id, patient_id, channel, phase, clinical_state_json)
    VALUES (
      ${opts.encounterId}::uuid,
      ${opts.patientId}::uuid,
      ${opts.channel ?? "web_chat"},
      'hpi',
      ${JSON.stringify({ complaintId: opts.complaintId, chiefComplaint: opts.chiefComplaint })}::jsonb
    )
    RETURNING id
  `);
  const sessionId = (res.rows[0] as any).id as string;

  // Build initial state shell
  const initState = extractClinicalState({
    complaintId:    opts.complaintId,
    chiefComplaint: opts.chiefComplaint,
    ageYears:       opts.ageYears,
    sex:            opts.sex,
    answerLog:      [],
  });

  // Get first question
  const questions = pack ? getQuestionsForPhase(pack, "hpi", initState) : [];
  const firstQ    = questions[0];

  let firstPrompt = firstQ
    ? `Thanks for reaching out. I'm going to ask you a few questions about ${opts.chiefComplaint}.\n\n${firstQ.text}`
    : `Thanks for reaching out. I'm here to help with your ${opts.chiefComplaint}. Please describe what you're experiencing.`;

  // Save initial state
  await db.execute(sql`
    UPDATE dialogue_sessions SET
      clinical_state_json = ${JSON.stringify(initState)}::jsonb,
      turns_json = ${JSON.stringify([{
        turnIndex: 0, phase: "hpi",
        questionId: firstQ?.id ?? "open_001",
        questionText: firstQ?.text ?? "Describe your symptoms",
        promptText: firstPrompt,
      }])}::jsonb
    WHERE id = ${sessionId}
  `);

  return { sessionId, firstPrompt };
}

/**
 * Process a patient response. Advance state, return next prompt or completion.
 */
export async function processResponse(
  sessionId: string,
  patientAnswer: string
): Promise<ProcessResponseResult> {
  const session = await loadSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (session.isComplete) return { sessionId, phase: "complete", isComplete: true };

  const safAnswer = applyPHIGuard(patientAnswer);

  // Record answer against last unanswered turn
  const lastTurn = session.turns[session.turns.length - 1];
  if (lastTurn && !lastTurn.answer) {
    lastTurn.answer      = safAnswer;
    lastTurn.respondedAt = new Date().toISOString();

    // Add to answer log
    session.answerLog.push({
      questionId:   lastTurn.questionId,
      questionText: lastTurn.questionText,
      answer:       safAnswer,
      answeredAt:   lastTurn.respondedAt,
      extractKey:   (lastTurn as any).extractKey,
    } as AnswerEntry & { extractKey?: string });
  }

  // Rebuild clinical state from full answer log
  const clinicalState: ExtractedClinicalState = session.clinicalState
    ? mergeClinicalStateDelta(session.clinicalState, [session.answerLog[session.answerLog.length - 1]])
    : extractClinicalState({
        complaintId:    session.clinicalState?.complaintId ?? "unknown",
        chiefComplaint: session.clinicalState?.chiefComplaint ?? "",
        answerLog:      session.answerLog,
      });

  session.clinicalState = clinicalState;

  // Check safety alerts
  const pack          = getComplaintPack(clinicalState.complaintId);
  const alerts        = await checkSafetyAlerts(clinicalState, pack);
  session.safetyAlerts = [...new Set([...session.safetyAlerts, ...alerts])];

  // If critical safety alert, escalate immediately
  if (alerts.length > 0) {
    session.phase     = "complete";
    session.isComplete = true;
    session.completedAt = new Date().toISOString();
    await saveSession(session);

    return {
      sessionId,
      phase: "complete",
      isComplete: true,
      safetyAlert: `⚠️ ${alerts[0]}. Please call 911 or go to the nearest emergency room immediately.`,
      triageSummary: pack?.computeTriage(clinicalState),
    };
  }

  // Find next question in current phase
  const answeredIds = new Set(session.answerLog.map(a => a.questionId));
  let   nextQ: DialogueQuestion | null = null;

  if (pack) {
    const phaseQs = getQuestionsForPhase(pack, session.phase as DialoguePhase, clinicalState);
    nextQ = findNextUnansweredQuestion(phaseQs, answeredIds);
  }

  // Advance phase if no more questions in current phase
  if (!nextQ) {
    const next = nextPhase(session.phase);
    if (next === "complete") {
      session.phase      = "complete";
      session.isComplete = true;
      session.completedAt = new Date().toISOString();
      await saveSession(session);

      const triageResult = pack?.computeTriage(clinicalState);
      return { sessionId, phase: "complete", isComplete: true, triageSummary: triageResult };
    }

    session.phase = next;
    if (pack) {
      const nextPhaseQs = getQuestionsForPhase(pack, next, clinicalState);
      nextQ = findNextUnansweredQuestion(nextPhaseQs, answeredIds);
    }
  }

  if (!nextQ) {
    // No more questions — mark complete
    session.phase       = "complete";
    session.isComplete  = true;
    session.completedAt = new Date().toISOString();
    await saveSession(session);
    return { sessionId, phase: "complete", isComplete: true, triageSummary: pack?.computeTriage(clinicalState) };
  }

  // Wrap question naturally
  const promptText = await wrapQuestionNaturally(
    nextQ.text,
    session.phase,
    clinicalState.chiefComplaint,
    session.turns.length
  );

  // Record new turn
  const newTurn: DialogueTurn = {
    turnIndex:    session.turns.length,
    phase:        session.phase,
    questionId:   nextQ.id,
    questionText: nextQ.text,
    promptText,
    ...(nextQ as any).extractKey ? { extractKey: (nextQ as any).extractKey } : {},
  } as DialogueTurn;
  session.turns.push(newTurn);

  await saveSession(session);

  return {
    sessionId,
    phase:           session.phase,
    nextPrompt:      promptText,
    nextQuestionId:  nextQ.id,
    isComplete:      false,
  };
}

/**
 * Get current session state (for polling / display).
 */
export async function getSession(sessionId: string): Promise<DialogueSession | null> {
  return loadSession(sessionId);
}

/**
 * Generate a physician briefing card from a completed session.
 * Uses GPT-4o to synthesize the clinical state into a concise brief.
 */
export async function generatePhysicianBriefing(sessionId: string): Promise<any> {
  const session = await loadSession(sessionId);
  if (!session?.clinicalState) throw new Error("Session not found or clinical state missing");

  const pack   = getComplaintPack(session.clinicalState.complaintId);
  const triage = pack?.computeTriage(session.clinicalState);

  const narrative = session.clinicalState.narrativeScrubbed ?? "";

  let llmBriefing: any = {};
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: `You are a clinical intake AI preparing a physician briefing card. Based on the patient intake, produce a JSON with these fields:
{
  "one_liner": "1-sentence clinical summary (age, sex, chief complaint, key findings)",
  "urgency_signal": "routine|elevated|urgent|critical",
  "preliminary_disposition": "e.g. Urgent Care Same-Day",
  "story_flags": ["any concerning historical features"],
  "suggested_first_words": "suggested opening line for physician"
}
Return ONLY valid JSON. No markdown.`,
        },
        {
          role: "user",
          content: `Chief complaint: ${session.clinicalState.chiefComplaint}\n\nIntake Q&A:\n${narrative.slice(0, 2000)}`,
        },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim() ?? "{}";
    llmBriefing = JSON.parse(text);
  } catch {
    llmBriefing = {
      one_liner: `${session.clinicalState.chiefComplaint} — see intake notes`,
      urgency_signal: "routine",
      preliminary_disposition: triage?.disposition ?? "PRIMARY_CARE_48H",
    };
  }

  const briefing = {
    encounter_id:             session.encounterId,
    one_liner:                llmBriefing.one_liner,
    urgency_signal:           llmBriefing.urgency_signal ?? triage?.dispositionColor ?? "routine",
    preliminary_disposition:  llmBriefing.preliminary_disposition ?? triage?.disposition,
    top_differential:         JSON.stringify(triage?.topDifferentials?.slice(0, 3) ?? []),
    critical_gaps:            JSON.stringify(triage?.criticalGaps ?? []),
    important_gaps:           JSON.stringify([]),
    story_flags:              JSON.stringify(llmBriefing.story_flags ?? []),
    medication_flags:         JSON.stringify([]),
    suggested_first_words:    llmBriefing.suggested_first_words ?? null,
  };

  // Upsert briefing card
  await db.execute(sql`
    INSERT INTO physician_briefing_cards
      (encounter_id, one_liner, urgency_signal, preliminary_disposition,
       top_differential, critical_gaps, important_gaps, story_flags, medication_flags, suggested_first_words)
    VALUES (
      ${briefing.encounter_id}::uuid,
      ${briefing.one_liner},
      ${briefing.urgency_signal},
      ${briefing.preliminary_disposition},
      ${briefing.top_differential}::jsonb,
      ${briefing.critical_gaps}::jsonb,
      ${briefing.important_gaps}::jsonb,
      ${briefing.story_flags}::jsonb,
      ${briefing.medication_flags}::jsonb,
      ${briefing.suggested_first_words}
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `);

  return { ...briefing, triage };
}

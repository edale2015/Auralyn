import { sendWhatsAppMessage } from "./send";
import {
  createCase,
  appendMessage,
  mergeAnswers,
  setTriage,
  setCaseState,
} from "../services/caseService";
import { matchComplaintFromText, listEnabledComplaints } from "../services/complaintMatchService";
import {
  type QRow,
  isSafetyCriticalQuestion,
  getNextRequiredQuestion,
  getRequiredQuestions,
} from "../services/questionFlowService";
import { runOrchestratorTriage } from "../services/orchestratorTriageAdapter";
import { executePipeline, type PipelineResult } from "../clinical/ruleExecutionEngine";
import {
  logInteraction,
  startSession,
  incrementMessageCount,
  endSession,
  recordCsat,
  recordNps,
} from "../services/interactionAuditService";
import { analyzeMood, buildTonePrefix } from "../services/moodToneService";
import {
  setSurveyState,
  getSurveyState,
  clearSurveyState,
} from "../services/surveyStateService";
import { sha256Hex } from "../services/hash";

// ── In-memory hot session store ────────────────────────────────────────────────
// Eliminates ~38s of Firestore round-trips from the patient-facing hot path.
// Firestore writes are fire-and-forget background persistence — patient reply
// is never gated on them.  On server restart, the Firestore fallback in
// getActiveCaseId restores any in-progress sessions automatically.
interface HotSession {
  caseId:    string;
  complaint: { slug: string; display: string };
  answers:   Record<string, any>;
  state:     string;
  createdAt: number;   // ms epoch — used for 4-hour expiry
}

const hotSessions = new Map<string, HotSession>();

function hotKey(threadId: string): string {
  return `whatsapp:${threadId}`;
}

function hotGet(threadId: string): HotSession | null {
  return hotSessions.get(hotKey(threadId)) ?? null;
}

function hotSet(threadId: string, session: HotSession): void {
  hotSessions.set(hotKey(threadId), session);
}

function hotDel(threadId: string): void {
  hotSessions.delete(hotKey(threadId));
}

// Firestore fallback — used only on first message after server restart
async function firestoreLookup(threadId: string): Promise<HotSession | null> {
  try {
    const { getActiveCaseId } = await import("../services/channelThreadService");
    const caseId = await (getActiveCaseId as any)({ channel: "whatsapp", threadId });
    if (!caseId) return null;
    const { getCase } = await import("../services/caseService");
    const doc = await getCase(caseId);
    if (!doc || doc.state === "CLOSED" || doc.state === "TRIAGED") return null;
    const session: HotSession = {
      caseId,
      complaint: { slug: doc.complaint.slug, display: doc.complaint.display },
      answers:   (doc.answers?.structured ?? {}) as Record<string, any>,
      state:     doc.state,
      createdAt: Date.now(),
    };
    hotSet(threadId, session);        // warm the cache for future messages
    return session;
  } catch {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapMasterDisposition(disp: string | null): string | null {
  if (!disp) return null;
  const d = disp.toUpperCase();
  if (["ER_NOW", "ED_NOW", "CALL_911", "911"].includes(d)) return "er_send";
  if (["URGENT_CARE", "UC"].includes(d))                     return "urgent_care";
  if (["PCP", "ROUTINE", "PRIMARY_CARE"].includes(d))        return "pcp";
  if (["HOME_CARE", "SELF_CARE", "TELEHEALTH"].includes(d))  return "self_care";
  return null;
}

function formatQuestion(q: QRow): string {
  if (q.ANSWER_TYPE === "number") {
    return `${q.QUESTION_TEXT}\n\n1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣  6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟\n_Reply with a number_`;
  }
  return `${q.QUESTION_TEXT}\n\n_1 = Yes   2 = No_`;
}

function parseWhatsAppAnswer(text: string, answerType: string): string | number | null {
  const t = text.trim().toLowerCase();
  if (answerType === "number") {
    const n = Number(t.replace(/[^0-9]/g, ""));
    return isNaN(n) || n < 1 || n > 10 ? null : n;
  }
  if (t === "1" || ["yes", "y", "true", "yep", "yeah", "si"].includes(t)) return "yes";
  if (t === "2" || ["no", "n", "false", "nope", "nah"].includes(t)) return "no";
  return null;
}

function formatTriageResult(triage: any, masterResult?: PipelineResult | null): string {
  const emoji: Record<string, string> = {
    er_send: "🔴", urgent_care: "🟠", pcp: "🟡", self_care: "🟢",
  };
  const label: Record<string, string> = {
    er_send: "Emergency — Go to ER immediately",
    urgent_care: "Go to Urgent Care today",
    pcp: "See Your Doctor this week",
    self_care: "Self-Care at Home",
  };
  const e = emoji[triage.disposition] ?? "🔵";
  const l = label[triage.disposition] ?? triage.disposition;

  const lines = [
    `✅ *Assessment complete*`, ``,
    `${e} *${l}*`,
    `📋 Top finding: ${triage.topCluster ?? "—"}`,
    `📊 Confidence: ${triage.confidence}`,
  ];

  if (masterResult?.hardStop && masterResult.hardStopReason) {
    const flagName = masterResult.hardStopReason.split(":")[0].trim();
    lines.push(``, `🚨 *Critical alert: ${flagName}*`, `_Seek emergency care immediately._`);
  } else if ((triage.rfTriggered?.length ?? 0) > 0) {
    lines.push(``, `⚠️ *Red flag(s) noted — seek care promptly.*`);
  }

  if (masterResult && masterResult.totalRulesFired > 0) {
    const rfCount = masterResult.criticalFlagsHit?.length ?? 0;
    lines.push(``, `🧠 *${masterResult.totalRulesFired} clinical rules evaluated*${rfCount > 0 ? ` · ${rfCount} critical flag(s)` : ""}`);
  }

  lines.push(``, `_AI-assisted decision support only. Not a substitute for physician evaluation._`);
  return lines.join("\n");
}

// ── Safety escalation ──────────────────────────────────────────────────────────
// Sent and session closed the moment ANY answer triggers a critical disposition.
const EMERGENCY_MESSAGE =
  `🚨 *Based on your symptoms, you need emergency care immediately.*\n\n` +
  `Please call 911 or go to your nearest emergency room right now.\n\n` +
  `Do not wait. If you cannot get there safely, call 911 and they will come to you.\n\n` +
  `_Stay safe — Auralyn_`;

function isCriticalPipelineResult(result: PipelineResult): boolean {
  if (result.hardStop) return true;
  const d = (result.finalDisposition ?? "").toUpperCase();
  return ["ER_NOW", "ED_NOW", "CALL_911", "911", "AMBULANCE_NOW", "AMBULANCE"].includes(d);
}

// Instant keyword-based fallback: if the rule engine has no rule for this
// complaint/question, critical safety questions with a "yes" still escalate.
function isInstantKeywordEscalation(q: QRow, answer: string | number): boolean {
  if (answer !== "yes") return false;
  const text = q.QUESTION_TEXT.toLowerCase();
  const CRITICAL_KEYWORDS = [
    "thunderclap", "worst headache", "worst pain of", "worst of your life",
    "worst of his life", "worst of her life",
    "facial droop", "arm weakness", "leg weakness", "slurred speech",
    "cannot breathe", "can't breathe", "unable to breathe",
    "coughing blood", "vomiting blood", "unconscious", "loss of consciousness",
  ];
  return CRITICAL_KEYWORDS.some((kw) => text.includes(kw));
}

async function checkEscalation(
  complaintSlug: string,
  answers: Record<string, any>
): Promise<boolean> {
  try {
    const result = await executePipeline(
      complaintSlug,
      answers as Record<string, string | number | boolean>
    );
    return isCriticalPipelineResult(result);
  } catch {
    return false; // never block a patient on engine error
  }
}

function buildComplaintMenu(): string {
  const complaints = (listEnabledComplaints() as any[]).slice(0, 20);
  const numbered = complaints.map((c, i) => `${i + 1}. ${c.LABEL}`).join("\n");
  return `👋 Welcome to Auralyn Triage.\n\nWhat's your main symptom? Type it or reply with a number:\n\n${numbered}\n\n_Or just describe your symptom in your own words._`;
}

function buildTriageFromPipeline(p: PipelineResult): Record<string, any> {
  const disposition = mapMasterDisposition(p.finalDisposition) ?? "urgent_care";
  let confidence: string;
  if (p.hardStop)               confidence = "HIGH";
  else if (p.totalRulesFired >= 8) confidence = "MODERATE";
  else                          confidence = "LOW";
  const dxStep    = p.steps.find(s => s.ruleType === "diagnosis");
  const topDx     = dxStep?.rulesFired?.[0]?.rule_name ?? null;
  const topCluster = p.hardStop
    ? (p.hardStopReason?.split(":")[0]?.trim() ?? "Critical red flag")
    : (topDx ?? p.complaint_id.replace(/_/g, " "));
  return {
    disposition, confidence, topCluster,
    rfTriggered: p.criticalFlagsHit ?? [],
    consistencyFlags: [],
  };
}

// ── Triage runner (zero LLM — pure rule engine) ────────────────────────────────
async function runTriageAndSend(params: {
  caseId: string;
  complaintSlug: string;
  answers: Record<string, any>;
  to: string;
  threadId: string;
}) {
  const t0 = Date.now();
  const masterResult = await executePipeline(
    params.complaintSlug,
    params.answers as Record<string, string | number | boolean>
  ).catch((e: any) => {
    console.error("[WhatsApp] executePipeline error:", e?.message);
    return null as PipelineResult | null;
  });

  const triage = masterResult
    ? buildTriageFromPipeline(masterResult)
    : { disposition: "urgent_care", confidence: "LOW", topCluster: "—", rfTriggered: [], consistencyFlags: [] };

  const needsReview =
    triage.confidence === "LOW"           ||
    (triage.rfTriggered?.length ?? 0) > 0 ||
    masterResult?.hardStop === true;

  const resultText = formatTriageResult(triage, masterResult);

  // Patient gets result — Firestore write is background
  await sendWhatsAppMessage(params.to, resultText);
  console.log(`[WhatsApp] ⚡ ${Date.now() - t0}ms total — disp=${triage.disposition} rules=${masterResult?.totalRulesFired ?? 0} hardStop=${masterResult?.hardStop ?? false}`);

  // ── Background persistence (fire-and-forget) ──────────────────────────────
  setImmediate(() => {
    setTriage(params.caseId, triage as any, (needsReview ? "NEEDS_REVIEW" : "TRIAGED") as any).catch(() => {});
    endSession(params.caseId, triage.disposition as any).catch(() => {});
    logInteraction({
      sessionId: params.caseId, caseId: params.caseId, channel: "whatsapp",
      direction: "outbound", skillName: "triage_result", messageText: resultText,
      responseText: `disposition=${triage.disposition}|confidence=${triage.confidence}|rules=${masterResult?.totalRulesFired ?? 0}`,
    }).catch(() => {});

    // LLM enrichment for physician review packet — never blocks patient
    runOrchestratorTriage({
      complaintSlug: params.complaintSlug,
      answers: params.answers,
      sessionId: params.caseId,
      caseId: params.caseId,
      channel: "whatsapp",
    }).catch((e: any) =>
      console.warn("[WhatsApp] Async orchestrator (non-blocking):", e?.message)
    );
  });

  // Clear hot session
  hotDel(params.threadId);

  setTimeout(async () => {
    const surveyText = `📋 *Quick feedback*\n\nHow would you rate your experience today?\n\n5️⃣ Excellent  4️⃣ Good  3️⃣ Okay  2️⃣ Poor  1️⃣ Very poor\n\nReply 1–5`;
    await sendWhatsAppMessage(params.to, surveyText);
    await setSurveyState("whatsapp", params.threadId, params.caseId, "csat");
    logInteraction({ sessionId: params.caseId, channel: "whatsapp", direction: "outbound", skillName: "csat_survey", messageText: surveyText }).catch(() => {});
  }, 2000);
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function handleWhatsAppKBIntake(params: {
  from: string;
  text: string;
  messageSid: string;
}): Promise<boolean> {
  console.log('[T1] handleWhatsAppKBIntake started', Date.now());
  const { from, text } = params;
  const threadId  = from.replace(/^whatsapp:/, "").replace(/^\+/, "");
  const cleanFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  const rawText   = text.trim();
  const mood      = analyzeMood(rawText);

  // ── /start / hello ──────────────────────────────────────────────────────────
  if (rawText.toLowerCase() === "/start" || rawText.toLowerCase() === "hi" || rawText.toLowerCase() === "hello") {
    const existing = hotGet(threadId);
    if (existing) {
      // Background: close old Firestore case
      setImmediate(() => setCaseState(existing.caseId, "CLOSED").catch(() => {}));
    }
    hotDel(threadId);
    clearSurveyState("whatsapp", threadId).catch(() => {});
    await sendWhatsAppMessage(cleanFrom, buildComplaintMenu());
    return true;
  }

  // ── /reset ──────────────────────────────────────────────────────────────────
  if (rawText.toLowerCase() === "/reset") {
    const existing = hotGet(threadId);
    if (existing) {
      setImmediate(() => setCaseState(existing.caseId, "CLOSED").catch(() => {}));
    }
    hotDel(threadId);
    clearSurveyState("whatsapp", threadId).catch(() => {});
    await sendWhatsAppMessage(cleanFrom, "Session cleared. Send your symptom or 'hi' to start again.");
    return true;
  }

  // ── Survey replies ──────────────────────────────────────────────────────────
  // FIX 1 + FIX 3: Only check survey state for numeric messages (CSAT 1-5, NPS 0-10).
  // Symptom text ("chest pain", "yes", "no") skips the Redis fetch entirely — zero latency.
  // Numeric replies get a 500ms hard timeout so a slow/unreachable Upstash never blocks.
  const looksNumeric = /^\d+$/.test(rawText.trim());
  const survey = looksNumeric
    ? await Promise.race([
        getSurveyState("whatsapp", threadId),
        new Promise<null>(r => setTimeout(() => r(null), 500)),
      ])
    : null;
  if (survey) {
    const n = parseInt(rawText.trim());
    if (survey.phase === "csat" && !isNaN(n) && n >= 1 && n <= 5) {
      recordCsat(survey.sessionId, n).catch(() => {});
      logInteraction({ sessionId: survey.sessionId, channel: "whatsapp", direction: "inbound", skillName: "csat_reply", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
      await setSurveyState("whatsapp", threadId, survey.sessionId, "nps");
      const npsText = `Thanks! One more — how likely are you to recommend Auralyn to someone you know?\n\n0 = Not at all   10 = Absolutely yes\n\nReply 0–10`;
      await sendWhatsAppMessage(cleanFrom, npsText);
      logInteraction({ sessionId: survey.sessionId, channel: "whatsapp", direction: "outbound", skillName: "nps_survey", messageText: npsText }).catch(() => {});
      return true;
    }
    if (survey.phase === "nps" && !isNaN(n) && n >= 0 && n <= 10) {
      recordNps(survey.sessionId, n).catch(() => {});
      clearSurveyState("whatsapp", threadId).catch(() => {});
      logInteraction({ sessionId: survey.sessionId, channel: "whatsapp", direction: "inbound", skillName: "nps_reply", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
      await sendWhatsAppMessage(cleanFrom, `🙏 Thank you! Your feedback helps us improve care. Stay well.`);
      return true;
    }
  }

  console.log('[T2] getSurveyState done', Date.now());

  // ── Look up existing session ────────────────────────────────────────────────
  // 1. Hot cache (in-memory, instant)
  // 2. Firestore fallback with 2s hard timeout (only on first message after restart)
  let session = hotGet(threadId);
  if (!session) session = await Promise.race([
    firestoreLookup(threadId),
    new Promise<null>(r => setTimeout(() => r(null), 2000)),
  ]);
  console.log('[T3] firestoreLookup done', Date.now(), session ? `caseId=${session.caseId}` : "no session");

  // ── Bug 1 fix: expire stale sessions and detect new chief complaint ─────────
  const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
  if (session) {
    const isExpired = Date.now() - (session.createdAt ?? 0) > SESSION_MAX_AGE_MS;
    const incomingMatch = matchComplaintFromText(rawText);
    const complaintMismatch =
      incomingMatch !== null &&
      incomingMatch.slug !== session.complaint.slug;
    if (isExpired || complaintMismatch) {
      const reason = isExpired ? "expired (>4h)" : `complaint mismatch (was ${session.complaint.slug}, incoming ${incomingMatch!.slug})`;
      console.log(`[Session] Closing stale session: ${reason}`);
      setImmediate(() => setCaseState(session!.caseId, "CLOSED").catch(() => {}));
      hotDel(threadId);
      session = null;
    }
  }

  // ── New session — complaint selection ───────────────────────────────────────
  if (!session) {
    const complaints = (listEnabledComplaints() as any[]).slice(0, 20);
    const byNumber = Number(rawText.trim()) - 1;
    let match: { slug: string; display: string } | null = null;

    if (!isNaN(byNumber) && byNumber >= 0 && byNumber < complaints.length) {
      const c = complaints[byNumber];
      match = { slug: c.CC_ID, display: c.LABEL };
    } else {
      match = matchComplaintFromText(rawText);
    }

    if (!match) {
      const tonePrefix = buildTonePrefix(mood.mood);
      await sendWhatsAppMessage(cleanFrom, tonePrefix + buildComplaintMenu());
      return true;
    }

    // ── Create session in memory immediately (instant) ──────────────────────
    const nowIso = new Date().toISOString();
    const caseId = `CASE_${nowIso.replace(/[-:.TZ]/g, "")}_${Math.random().toString(16).slice(2, 8)}`;
    session = { caseId, complaint: match, answers: {}, state: "DRAFT", createdAt: Date.now() };
    hotSet(threadId, session);

    // ── Background: persist to Firestore + audit (never blocks patient) ──────
    setImmediate(() => {
      createCase({
        channel: "whatsapp", threadId, userId: threadId,
        complaintSlug: match!.slug, complaintDisplay: match!.display,
        engine: "GENERIC_V1",
      }).catch(() => {});

      // channelThreadService uses "telegram" type but works for whatsapp via dynamic import
      import("../services/channelThreadService").then(({ setActiveCaseId }) =>
        (setActiveCaseId as any)({ channel: "whatsapp", threadId, activeCaseId: caseId }).catch(() => {})
      ).catch(() => {});

      startSession(caseId, caseId, "whatsapp").catch(() => {});
      incrementMessageCount(caseId).catch(() => {});
      appendMessage(caseId, { ts: nowIso, dir: "in", channel: "whatsapp", text: rawText }).catch(() => {});
      logInteraction({ sessionId: caseId, caseId, channel: "whatsapp", direction: "inbound", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
    });

    // ── Get first question (sync — ~0ms from warm cache) ───────────────────
    const firstQ = getNextRequiredQuestion({ complaintSlug: match.slug, answers: {} });
    console.log('[T4] getNextRequiredQuestion done', Date.now());

    if (!firstQ) {
      await sendWhatsAppMessage(cleanFrom, `Got it — *${match.display}*. Processing…`);
      await runTriageAndSend({ caseId, complaintSlug: match.slug, answers: {}, to: cleanFrom, threadId });
      return true;
    }

    await sendWhatsAppMessage(
      cleanFrom,
      `Got it — *${match.display}*. A few quick questions:\n\n` + formatQuestion(firstQ)
    );
    console.log('[T5] sendWhatsAppMessage done', Date.now());
    return true;
  }

  // ── Existing session — answer handling ─────────────────────────────────────
  const { caseId, complaint, answers } = session;

  // Background audit writes
  setImmediate(() => {
    incrementMessageCount(caseId).catch(() => {});
    appendMessage(caseId, { ts: new Date().toISOString(), dir: "in", channel: "whatsapp", text: rawText }).catch(() => {});
    logInteraction({ sessionId: caseId, caseId, channel: "whatsapp", direction: "inbound", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
  });

  // ── Get the current unanswered question ────────────────────────────────────
  const nextQ = getNextRequiredQuestion({ complaintSlug: complaint.slug, answers });
  console.log('[T4] getNextRequiredQuestion done', Date.now());

  if (!nextQ) {
    await runTriageAndSend({ caseId, complaintSlug: complaint.slug, answers, to: cleanFrom, threadId });
    return true;
  }

  // ── Helper: escalate and close session ────────────────────────────────────
  async function doEscalation(updatedAns: Record<string, any>, trigger: string, qId: string) {
    setImmediate(() => {
      const answerHash = sha256Hex(JSON.stringify(updatedAns));
      import("../firebase").then(({ getFirestore }) => {
        getFirestore().collection("cases").doc(caseId).update({
          updatedAt: new Date().toISOString(),
          "answers.structured": updatedAns,
          "answers.answerHash": answerHash,
        }).catch(() => {});
      }).catch(() => {});
      setTriage(caseId, { disposition: "er_send", confidence: "HIGH", topCluster: "Critical red flag — auto-escalated", rfTriggered: ["ESCALATION"], consistencyFlags: [] } as any, "CLOSED" as any).catch(() => {});
      endSession(caseId, "er_send" as any).catch(() => {});
      logInteraction({ sessionId: caseId, caseId, channel: "whatsapp", direction: "outbound", skillName: "safety_escalation", messageText: EMERGENCY_MESSAGE, responseText: `escalated=true|trigger=${trigger}|q=${qId}` }).catch(() => {});
    });
    await sendWhatsAppMessage(cleanFrom, EMERGENCY_MESSAGE);
    hotDel(threadId);
  }

  // ── Helper: persist answers in background ─────────────────────────────────
  function persistAnswers(ans: Record<string, any>) {
    setImmediate(() => {
      const answerHash = sha256Hex(JSON.stringify(ans));
      import("../firebase").then(({ getFirestore }) => {
        getFirestore().collection("cases").doc(caseId).update({
          updatedAt: new Date().toISOString(),
          "answers.structured": ans,
          "answers.answerHash": answerHash,
        }).catch(() => {});
      }).catch(() => {});
    });
  }

  // ── Detect free-text vs structured answer ──────────────────────────────────
  // Free-text = more than 4 words, or anything that isn't 1/2/yes/no/a number
  const wordCount  = rawText.trim().split(/\s+/).length;
  const isShortAns = wordCount <= 4 &&
    (["1","2"].includes(rawText.trim()) ||
     ["yes","no","y","n","yeah","yep","nope","nah","si"].includes(rawText.trim().toLowerCase()) ||
     !isNaN(Number(rawText.trim())));

  if (!isShortAns) {
    // Fix 5: Immediate ack before async GPT processing
    await sendWhatsAppMessage(cleanFrom, "Got it…");

    // Fix 2+4: Extract answers + generate adaptive follow-up
    const { extractAndAdapt } = await import("./freeTextExtractor");
    const allUnanswered = getRequiredQuestions(complaint.slug).filter(q => answers[q.Q_ID] === undefined);

    const extraction = await extractAndAdapt({
      patientText:          rawText,
      complaintDisplay:     complaint.display,
      unansweredQuestions:  allUnanswered.slice(0, 6),
    });

    // Apply extracted answers
    let updatedAnswers: Record<string, any> = { ...answers };
    for (const [qId, val] of Object.entries(extraction.extractedAnswers)) {
      if (val !== undefined && val !== null) updatedAnswers[qId] = val;
    }
    // Direct parse of current question in case GPT missed it
    const directParsed = parseWhatsAppAnswer(rawText, nextQ.ANSWER_TYPE);
    if (directParsed !== null && updatedAnswers[nextQ.Q_ID] === undefined) {
      updatedAnswers[nextQ.Q_ID] = directParsed;
    }
    session.answers = updatedAnswers;
    persistAnswers(updatedAnswers);

    // Safety check on extracted answers
    const shouldEscalate = await checkEscalation(complaint.slug, updatedAnswers);
    if (shouldEscalate) {
      await doEscalation(updatedAnswers, "engine", nextQ.Q_ID);
      return true;
    }
    if (isInstantKeywordEscalation(nextQ, updatedAnswers[nextQ.Q_ID])) {
      await doEscalation(updatedAnswers, "keyword", nextQ.Q_ID);
      return true;
    }

    // Next unanswered question after extraction
    const nextAfterExtraction = getNextRequiredQuestion({ complaintSlug: complaint.slug, answers: updatedAnswers });
    if (!nextAfterExtraction) {
      await runTriageAndSend({ caseId, complaintSlug: complaint.slug, answers: updatedAnswers, to: cleanFrom, threadId });
      return true;
    }

    // Build adaptive response: GPT ack + next question
    const ackText  = extraction.acknowledgment ?? "";
    const nextText = extraction.nextQuestionText || nextAfterExtraction.QUESTION_TEXT;
    const hint     = nextAfterExtraction.ANSWER_TYPE === "number"
      ? "\n\n_Reply with a number_"
      : "\n\n_1 = Yes   2 = No_";

    await sendWhatsAppMessage(
      cleanFrom,
      ackText ? `${ackText}\n\n${nextText}${hint}` : `${nextText}${hint}`
    );
    console.log('[T5] sendWhatsAppMessage done', Date.now());
    return true;
  }

  // ── Structured short answer (1, 2, yes, no, single number) ────────────────
  const parsed = parseWhatsAppAnswer(rawText, nextQ.ANSWER_TYPE);

  if (parsed === null) {
    // Couldn't parse — re-ask the same question
    await sendWhatsAppMessage(cleanFrom, formatQuestion(nextQ));
    console.log('[T5] sendWhatsAppMessage done (re-ask)', Date.now());
    return true;
  }

  const updatedAnswers = { ...answers, [nextQ.Q_ID]: parsed };
  session.answers = updatedAnswers;

  // Two-layer safety check: keyword (instant) + rule engine
  const keywordHit = isInstantKeywordEscalation(nextQ, parsed);
  const engineHit  = keywordHit ? false : await checkEscalation(complaint.slug, updatedAnswers);

  if (keywordHit || engineHit) {
    console.log(`[WhatsApp] 🚨 Safety escalation: ${keywordHit ? "keyword" : "engine"} hit on Q_ID=${nextQ.Q_ID}`);
    await doEscalation(updatedAnswers, keywordHit ? "keyword" : "engine", nextQ.Q_ID);
    return true;
  }

  persistAnswers(updatedAnswers);

  // Ask next question or finish
  const next = getNextRequiredQuestion({ complaintSlug: complaint.slug, answers: updatedAnswers });
  if (next) {
    await sendWhatsAppMessage(cleanFrom, formatQuestion(next));
  } else {
    await sendWhatsAppMessage(cleanFrom, "Thanks — processing your assessment now…");
    await runTriageAndSend({ caseId, complaintSlug: complaint.slug, answers: updatedAnswers, to: cleanFrom, threadId });
  }
  console.log('[T5] sendWhatsAppMessage done', Date.now());
  return true;
}

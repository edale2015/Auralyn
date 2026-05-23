import { sendWhatsAppMessage } from "./send";
import {
  createCase,
  appendMessage,
  mergeAnswers,
  setTriage,
  setCaseState,
} from "../services/caseService";
import { matchComplaintFromText, listEnabledComplaints } from "../services/complaintMatchService";
import { getNextRequiredQuestion } from "../services/questionFlowService";
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

function formatQuestionAsMenu(q: { Q_ID: string; QUESTION_TEXT: string; ANSWER_TYPE: string }, progress: string): string {
  if (q.ANSWER_TYPE === "number") {
    return `${progress}\n\n${q.QUESTION_TEXT}\n\n1️⃣ 1  2️⃣ 2  3️⃣ 3  4️⃣ 4  5️⃣ 5\n6️⃣ 6  7️⃣ 7  8️⃣ 8  9️⃣ 9  🔟 10\n\n_(1 = mild, 10 = most severe)_\nReply with a number.`;
  }
  return `${progress}\n\n${q.QUESTION_TEXT}\n\n1️⃣ Yes\n2️⃣ No\n\nReply 1 or 2.`;
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
  console.log("[T2] handleWhatsAppKBIntake started", Date.now());
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

  // ── Look up existing session ────────────────────────────────────────────────
  // 1. Hot cache (in-memory, instant)
  // 2. Firestore fallback (only on first message after restart)
  console.log("[T2a] session lookup started", Date.now());
  let session = hotGet(threadId);
  // FIX 2: 2s hard timeout on Firestore fallback — cold-start never blocks patient
  if (!session) session = await Promise.race([
    firestoreLookup(threadId),
    new Promise<null>(r => setTimeout(() => r(null), 2000)),
  ]);
  console.log("[T2a] session lookup finished", Date.now(), session ? `caseId=${session.caseId}` : "no session");

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
    session = { caseId, complaint: match, answers: {}, state: "DRAFT" };
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

    // ── Get first question (sync — ~0ms) ────────────────────────────────────
    console.log("[T3] getNextRequiredQuestion started", Date.now());
    const firstQ = getNextRequiredQuestion({ complaintSlug: match.slug, answers: {} });
    console.log("[T4] getNextRequiredQuestion finished", Date.now());

    if (!firstQ) {
      await sendWhatsAppMessage(cleanFrom, `Got it — *${match.display}*. Processing…`);
      await runTriageAndSend({ caseId, complaintSlug: match.slug, answers: {}, to: cleanFrom, threadId });
      return true;
    }

    await sendWhatsAppMessage(cleanFrom, `Got it — *${match.display}*. I'll ask a few quick questions.\n\n` + formatQuestionAsMenu(firstQ, "📋 Question 1"));
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

  console.log("[T3] getNextRequiredQuestion started", Date.now());
  const nextQ = getNextRequiredQuestion({ complaintSlug: complaint.slug, answers });
  console.log("[T4] getNextRequiredQuestion finished", Date.now());

  if (!nextQ) {
    await runTriageAndSend({ caseId, complaintSlug: complaint.slug, answers, to: cleanFrom, threadId });
    return true;
  }

  const parsed = parseWhatsAppAnswer(rawText, nextQ.ANSWER_TYPE);
  if (parsed === null) {
    const answeredCount = Object.keys(answers).length;
    await sendWhatsAppMessage(cleanFrom, `Please reply with ${nextQ.ANSWER_TYPE === "number" ? "a number 1–10" : "1 for Yes or 2 for No"}.\n\n` + formatQuestionAsMenu(nextQ, `📋 Question ${answeredCount + 1}`));
    return true;
  }

  // ── Merge answer in memory (instant) + background Firestore ─────────────────
  const updatedAnswers = { ...answers, [nextQ.Q_ID]: parsed };
  session.answers = updatedAnswers;    // mutate hot session in place
  const answeredCount = Object.keys(updatedAnswers).length;

  setImmediate(() => {
    // Firestore merge (background — patient already has next question)
    const answerHash = sha256Hex(JSON.stringify(updatedAnswers));
    import("../firebase").then(({ getFirestore }) => {
      getFirestore().collection("cases").doc(caseId).update({
        updatedAt: new Date().toISOString(),
        "answers.structured": updatedAnswers,
        "answers.answerHash": answerHash,
      }).catch(() => {});
    }).catch(() => {});
  });

  const next2 = getNextRequiredQuestion({ complaintSlug: complaint.slug, answers: updatedAnswers });

  if (next2) {
    await sendWhatsAppMessage(cleanFrom, formatQuestionAsMenu(next2, `📋 Question ${answeredCount + 1}`));
  } else {
    await sendWhatsAppMessage(cleanFrom, "Thanks — processing your assessment now…");
    await runTriageAndSend({ caseId, complaintSlug: complaint.slug, answers: updatedAnswers, to: cleanFrom, threadId });
  }

  return true;
}

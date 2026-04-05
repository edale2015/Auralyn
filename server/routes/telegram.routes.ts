import { Router } from "express";
import {
  telegramSendMessage,
  telegramSendKeyboard,
  telegramAnswerCallbackQuery,
  telegramEditMessageReplyMarkup,
  buildQuestionKeyboard,
  buildComplaintKeyboard,
} from "../services/telegramClient";
import { handleBotCommand } from "../chat/botCommandHandler";
import {
  getActiveCaseId,
  setActiveCaseId,
  clearActiveCaseId,
} from "../services/channelThreadService";
import {
  createCase,
  appendMessage,
  mergeAnswers,
  getCase,
  setTriage,
  setCaseState,
} from "../services/caseService";
import { matchComplaintFromText, listEnabledComplaints } from "../services/complaintMatchService";
import { getNextRequiredQuestion } from "../services/questionFlowService";
import { runOrchestratorTriage } from "../services/orchestratorTriageAdapter";
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

export const telegramRouter = Router();

function verifySecret(req: any): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true;
  return req.headers["x-telegram-bot-api-secret-token"] === secret;
}

function parseBoolean(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (["yes", "y", "true", "1", "yep", "yeah", "yea", "sure", "si"].includes(t)) return true;
  if (["no", "n", "false", "0", "nah", "nope", "nay"].includes(t)) return false;
  return null;
}

function parseAnswer(text: string, answerType: string): string | number | null {
  if (answerType === "number") {
    const n = Number(text.trim());
    return isNaN(n) ? null : n;
  }
  if (answerType === "boolean" || answerType === "tri") {
    const b = parseBoolean(text);
    if (b === null) return null;
    return b ? "yes" : "no";
  }
  return text.trim() || null;
}

function getTopComplaints(n = 20) {
  try {
    const all = listEnabledComplaints();
    return all.slice(0, n).map((c: any) => ({ slug: c.CC_ID ?? c.slug, label: c.LABEL ?? c.label ?? c.CC_ID }));
  } catch {
    return [
      { slug: "sore_throat", label: "Sore Throat" },
      { slug: "chest_pain", label: "Chest Pain" },
      { slug: "cough", label: "Cough" },
      { slug: "headache", label: "Headache" },
      { slug: "abdominal_pain", label: "Abdominal Pain" },
      { slug: "dizziness", label: "Dizziness" },
    ];
  }
}

async function sendWelcomeWithComplaints(botToken: string, chatId: number | string, name: string) {
  const complaints = getTopComplaints(20);
  const keyboard = buildComplaintKeyboard(complaints);
  const text = `👋 Hi ${name}! I'm the Auralyn triage assistant.\n\nTap your main symptom below, or type it in your own words:\n\n<i>⚠️ If this is an emergency, call 911 immediately.</i>`;
  await telegramSendKeyboard({ botToken, chatId, text, keyboard });
  logInteraction({
    sessionId: String(chatId),
    channel: "telegram",
    direction: "outbound",
    messageText: text,
  }).catch(() => {});
}

async function sendQuestion(
  botToken: string,
  chatId: number | string,
  question: { Q_ID: string; QUESTION_TEXT: string; ANSWER_TYPE: string },
  progress: string,
  sessionId?: string
) {
  const keyboard = buildQuestionKeyboard(question.Q_ID, question.ANSWER_TYPE);
  const label = question.ANSWER_TYPE === "number"
    ? `${question.QUESTION_TEXT}\n\n<i>Tap a number (1 = mild, 10 = severe)</i>`
    : question.QUESTION_TEXT;
  const text = `${progress}\n\n${label}`;

  await telegramSendKeyboard({ botToken, chatId, text, keyboard });
  logInteraction({
    sessionId: sessionId ?? String(chatId),
    channel: "telegram",
    direction: "outbound",
    skillName: "question_flow",
    messageText: text,
  }).catch(() => {});
}

async function sendCsatSurvey(botToken: string, chatId: number | string, sessionId: string, threadId: string) {
  const text = `📋 <b>Quick feedback</b>\n\nHow would you rate your experience today?\n\n5️⃣ Excellent\n4️⃣ Good\n3️⃣ Okay\n2️⃣ Poor\n1️⃣ Very poor\n\n<i>Reply 1–5</i>`;
  await telegramSendMessage({ botToken, chatId, text });
  await setSurveyState("telegram", threadId, sessionId, "csat");
  logInteraction({
    sessionId,
    channel: "telegram",
    direction: "outbound",
    skillName: "csat_survey",
    messageText: text,
  }).catch(() => {});
}

async function runTriageAndSend(params: {
  caseId: string;
  complaintSlug: string;
  answers: Record<string, any>;
  botToken: string;
  chatId: number | string;
  threadId: string;
}): Promise<void> {
  await telegramSendMessage({ botToken: params.botToken, chatId: params.chatId, text: "⏳ Analyzing your answers…" });

  const triage = await runOrchestratorTriage({
    complaintSlug: params.complaintSlug,
    answers: params.answers,
    sessionId: params.caseId,
    caseId: params.caseId,
    channel: "telegram",
  });

  const needsReview =
    triage.confidence === "LOW" ||
    (triage.rfTriggered?.length ?? 0) > 0 ||
    (triage.consistencyFlags?.length ?? 0) > 0;

  const nextState = needsReview ? "NEEDS_REVIEW" : "TRIAGED";
  await setTriage(params.caseId, triage, nextState as any);

  const dispositionEmoji: Record<string, string> = {
    er_send: "🔴",
    urgent_care: "🟠",
    pcp: "🟡",
    self_care: "🟢",
  };
  const emoji = dispositionEmoji[triage.disposition] ?? "🔵";

  const lines: string[] = [
    `<b>Assessment complete ✅</b>`,
    ``,
    `${emoji} Disposition: <b>${triage.disposition?.replace(/_/g, " ").toUpperCase()}</b>`,
    `📋 Top finding: <b>${triage.topCluster ?? "—"}</b>`,
    `📊 Confidence: <b>${triage.confidence}</b>`,
  ];

  if ((triage.rfTriggered?.length ?? 0) > 0) {
    lines.push(`\n⚠️ <b>Red flag(s) noted — seek care promptly.</b>`);
  }
  if (needsReview) {
    lines.push(`\n👨‍⚕️ A clinician will review your case before final advice is sent.`);
  }
  lines.push(`\n<i>This is AI-assisted clinical decision support only. Not a substitute for physician evaluation.</i>`);

  const resultText = lines.join("\n");
  await telegramSendMessage({ botToken: params.botToken, chatId: params.chatId, text: resultText });

  logInteraction({
    sessionId: params.caseId,
    caseId: params.caseId,
    channel: "telegram",
    direction: "outbound",
    skillName: "triage_result",
    messageText: resultText,
    responseText: `disposition=${triage.disposition}|confidence=${triage.confidence}`,
  }).catch(() => {});

  await endSession(params.caseId, triage.disposition);
  await clearActiveCaseId({ channel: "telegram", threadId: params.threadId });

  setTimeout(() => {
    sendCsatSurvey(params.botToken, params.chatId, params.caseId, params.threadId).catch(() => {});
  }, 1500);
}

async function handleCallbackQuery(
  botToken: string,
  callbackQuery: {
    id: string;
    from: { id: number; first_name: string };
    message?: { chat: { id: number }; message_id: number };
    data?: string;
  }
) {
  const chatId = callbackQuery.message?.chat?.id;
  if (!chatId) return;
  const messageId = callbackQuery.message?.message_id;
  const data = callbackQuery.data ?? "";
  const threadId = String(chatId);

  await telegramAnswerCallbackQuery({ botToken, callbackQueryId: callbackQuery.id });
  if (messageId) {
    await telegramEditMessageReplyMarkup({ botToken, chatId, messageId });
  }

  if (data.startsWith("cc:")) {
    const slug = data.slice(3);
    const complaints = getTopComplaints(40);
    const found = complaints.find((c) => c.slug === slug);
    const display = found?.label ?? slug.replace(/_/g, " ");

    const oldCaseId = await getActiveCaseId({ channel: "telegram", threadId });
    if (oldCaseId) {
      const old = await getCase(oldCaseId);
      if (old?.state === "DRAFT") await setCaseState(oldCaseId, "CLOSED");
    }
    await clearActiveCaseId({ channel: "telegram", threadId });

    const created = await createCase({
      channel: "telegram",
      threadId,
      userId: threadId,
      complaintSlug: slug,
      complaintDisplay: display,
      engine: "GENERIC_V1",
    });

    await startSession(created.caseId, created.caseId, "telegram");
    await setActiveCaseId({ channel: "telegram", threadId, activeCaseId: created.caseId });

    const firstQ = getNextRequiredQuestion({ complaintSlug: slug, answers: {} });

    if (!firstQ) {
      await telegramSendMessage({ botToken, chatId, text: `Got it — <b>${display}</b>. Processing…` });
      await runTriageAndSend({ caseId: created.caseId, complaintSlug: slug, answers: {}, botToken, chatId, threadId });
      return;
    }

    await sendQuestion(botToken, chatId, firstQ, `📋 <b>${display}</b> — Question 1`, created.caseId);
    return;
  }

  if (data.startsWith("q:")) {
    const parts = data.split(":");
    const qId = parts[1];
    const rawVal = parts.slice(2).join(":");

    const caseId = await getActiveCaseId({ channel: "telegram", threadId });
    if (!caseId) {
      await telegramSendMessage({ botToken, chatId, text: "No active session. Type your symptom or tap /start." });
      return;
    }

    const c = await getCase(caseId);
    if (!c) {
      await telegramSendMessage({ botToken, chatId, text: "Session expired. Type /start to begin again." });
      return;
    }

    const answers = (c.answers?.structured ?? {}) as Record<string, any>;
    const val = rawVal === "yes" ? "yes" : rawVal === "no" ? "no" : (isNaN(Number(rawVal)) ? rawVal : Number(rawVal));
    const patch: Record<string, any> = { [qId]: val };
    const updated = await mergeAnswers(caseId, patch);
    await incrementMessageCount(caseId);

    const updatedAnswers = (updated.answers?.structured ?? {}) as Record<string, any>;
    const answeredCount = Object.keys(updatedAnswers).length;
    const nextQ = getNextRequiredQuestion({ complaintSlug: c.complaint.slug, answers: updatedAnswers });

    if (nextQ) {
      await sendQuestion(botToken, chatId, nextQ, `📋 Question ${answeredCount + 1}`, caseId);
    } else {
      await runTriageAndSend({ caseId, complaintSlug: c.complaint.slug, answers: updatedAnswers, botToken, chatId, threadId });
    }
    return;
  }
}

telegramRouter.post("/webhook", async (req, res) => {
  try {
    if (!verifySecret(req)) {
      return res.status(401).json({ error: "bad secret" });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error("TELEGRAM_BOT_TOKEN not set");
      return res.status(500).json({ error: "bot not configured" });
    }

    const update = req.body;

    if (update?.callback_query) {
      await handleCallbackQuery(botToken, update.callback_query);
      return res.json({ ok: true });
    }

    const msg = update?.message ?? update?.edited_message;
    if (!msg) return res.json({ ok: true });

    const chatId = msg.chat?.id;
    if (!chatId) return res.json({ ok: true });

    const threadId = String(chatId);
    const text: string = (msg.text ?? "").trim();
    const firstName = msg.from?.first_name ?? "there";

    const mood = analyzeMood(text);

    const botCmd = await handleBotCommand(text, chatId);
    if (botCmd.handled) {
      await telegramSendMessage({ botToken, chatId, text: botCmd.text });
      return res.json({ ok: true });
    }

    if (text.toLowerCase() === "/start" || text.toLowerCase() === "/reset") {
      const oldCaseId = await getActiveCaseId({ channel: "telegram", threadId });
      if (oldCaseId) {
        const old = await getCase(oldCaseId);
        if (old?.state === "DRAFT") await setCaseState(oldCaseId, "CLOSED");
      }
      await clearActiveCaseId({ channel: "telegram", threadId });
      await clearSurveyState("telegram", threadId);
      await sendWelcomeWithComplaints(botToken, chatId, firstName);
      return res.json({ ok: true });
    }

    if (text.toLowerCase() === "/help") {
      await telegramSendMessage({
        botToken,
        chatId,
        text: `<b>Auralyn Triage Bot</b>\n\n/start — Begin a new triage session\n/reset — Clear current session\n/status — System status\n\nOr just type your symptom and I'll guide you through a few quick questions.\n\n<i>This is not a substitute for emergency care. Call 911 for emergencies.</i>`,
      });
      return res.json({ ok: true });
    }

    if (text.toLowerCase() === "/status") {
      await telegramSendMessage({ botToken, chatId, text: "✅ Auralyn Triage System — <b>Online</b>\nAll clinical engines operational." });
      return res.json({ ok: true });
    }

    const survey = await getSurveyState("telegram", threadId);
    if (survey) {
      const n = parseInt(text.trim());
      if (survey.phase === "csat" && !isNaN(n) && n >= 1 && n <= 5) {
        await recordCsat(survey.sessionId, n);
        logInteraction({
          sessionId: survey.sessionId,
          channel: "telegram",
          direction: "inbound",
          skillName: "csat_reply",
          messageText: text,
          mood_label: mood.mood,
          moodScore: mood.score,
          toneLabel: mood.tone,
        } as any).catch(() => {});
        await setSurveyState("telegram", threadId, survey.sessionId, "nps");
        const npsText = `Thanks! One more — how likely are you to recommend Auralyn to someone you know?\n\n0 = Not at all   10 = Absolutely yes\n\n<i>Reply 0–10</i>`;
        await telegramSendMessage({ botToken, chatId, text: npsText });
        logInteraction({ sessionId: survey.sessionId, channel: "telegram", direction: "outbound", skillName: "nps_survey", messageText: npsText }).catch(() => {});
        return res.json({ ok: true });
      }
      if (survey.phase === "nps" && !isNaN(n) && n >= 0 && n <= 10) {
        await recordNps(survey.sessionId, n);
        await clearSurveyState("telegram", threadId);
        logInteraction({
          sessionId: survey.sessionId,
          channel: "telegram",
          direction: "inbound",
          skillName: "nps_reply",
          messageText: text,
          mood_label: mood.mood,
          moodScore: mood.score,
          toneLabel: mood.tone,
        } as any).catch(() => {});
        const thankText = `🙏 Thank you! Your feedback helps us improve. Stay well.`;
        await telegramSendMessage({ botToken, chatId, text: thankText });
        return res.json({ ok: true });
      }
      if (survey.phase === "csat" && text.toLowerCase() === "skip") {
        await clearSurveyState("telegram", threadId);
        return res.json({ ok: true });
      }
    }

    let caseId = await getActiveCaseId({ channel: "telegram", threadId });
    let c = caseId ? await getCase(caseId) : null;

    if (!c) {
      const match = matchComplaintFromText(text);
      if (!match) {
        const complaints = getTopComplaints(20);
        const keyboard = buildComplaintKeyboard(complaints);
        const tonePrefix = buildTonePrefix(mood.mood);
        await telegramSendKeyboard({
          botToken,
          chatId,
          text: `${tonePrefix}I didn't quite catch that. Tap your symptom below, or try typing it differently:`,
          keyboard,
        });
        return res.json({ ok: true });
      }

      const created = await createCase({
        channel: "telegram",
        threadId,
        userId: threadId,
        complaintSlug: match.slug,
        complaintDisplay: match.display,
        engine: "GENERIC_V1",
      });

      caseId = created.caseId;
      await startSession(caseId, caseId, "telegram");
      await setActiveCaseId({ channel: "telegram", threadId, activeCaseId: caseId });
      c = created;

      logInteraction({
        sessionId: caseId,
        caseId,
        channel: "telegram",
        direction: "inbound",
        messageText: text,
        moodLabel: mood.mood,
        moodScore: mood.score,
        toneLabel: mood.tone,
      }).catch(() => {});
      await incrementMessageCount(caseId);
      await appendMessage(caseId, { ts: new Date().toISOString(), dir: "in", channel: "telegram", text });

      const firstQ = getNextRequiredQuestion({ complaintSlug: match.slug, answers: {} });
      if (!firstQ) {
        await telegramSendMessage({ botToken, chatId, text: `Got it — <b>${match.display}</b>. Processing…` });
        await runTriageAndSend({ caseId, complaintSlug: match.slug, answers: {}, botToken, chatId, threadId });
        return res.json({ ok: true });
      }

      await sendQuestion(botToken, chatId, firstQ, `📋 <b>${match.display}</b> — Question 1`, caseId);
      return res.json({ ok: true });
    }

    logInteraction({
      sessionId: caseId!,
      caseId: caseId!,
      channel: "telegram",
      direction: "inbound",
      messageText: text,
      moodLabel: mood.mood,
      moodScore: mood.score,
      toneLabel: mood.tone,
    }).catch(() => {});
    await incrementMessageCount(caseId!);
    await appendMessage(caseId!, { ts: new Date().toISOString(), dir: "in", channel: "telegram", text });

    const answers = (c.answers?.structured ?? {}) as Record<string, any>;
    const nextQ = getNextRequiredQuestion({ complaintSlug: c.complaint.slug, answers });

    if (!nextQ) {
      await runTriageAndSend({ caseId: caseId!, complaintSlug: c.complaint.slug, answers, botToken, chatId, threadId });
      return res.json({ ok: true });
    }

    const parsed = parseAnswer(text, nextQ.ANSWER_TYPE);
    if (parsed === null) {
      const keyboard = buildQuestionKeyboard(nextQ.Q_ID, nextQ.ANSWER_TYPE);
      await telegramSendKeyboard({
        botToken,
        chatId,
        text: `${nextQ.ANSWER_TYPE === "number" ? "Please tap a number (1–10)." : "Please tap Yes or No."}\n\n${nextQ.QUESTION_TEXT}`,
        keyboard,
      });
      return res.json({ ok: true });
    }

    const patch: Record<string, any> = { [nextQ.Q_ID]: parsed };
    const updated = await mergeAnswers(caseId!, patch);
    const updatedAnswers = (updated.answers?.structured ?? {}) as Record<string, any>;
    const answeredCount = Object.keys(updatedAnswers).length;
    const next2 = getNextRequiredQuestion({ complaintSlug: updated.complaint.slug, answers: updatedAnswers });

    if (next2) {
      await sendQuestion(botToken, chatId, next2, `📋 Question ${answeredCount + 1}`, caseId!);
    } else {
      await runTriageAndSend({ caseId: caseId!, complaintSlug: updated.complaint.slug, answers: updatedAnswers, botToken, chatId, threadId });
    }

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("Telegram webhook error:", err);
    return res.status(200).json({ ok: true, error: err.message });
  }
});

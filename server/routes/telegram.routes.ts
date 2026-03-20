import { Router } from "express";
import { telegramSendMessage } from "../services/telegramClient";
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
import { matchComplaintFromText } from "../services/complaintMatchService";
import { getNextRequiredQuestion } from "../services/questionFlowService";
import { runTriage } from "../services/triageService";

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

async function runTriageAndSend(params: {
  caseId: string;
  complaintSlug: string;
  answers: Record<string, any>;
  botToken: string;
  chatId: number | string;
  threadId: string;
}): Promise<void> {
  const triage = await runTriage({
    complaintSlug: params.complaintSlug,
    answers: params.answers,
    rulesetVersion: "local",
    dxPriorityVersion: "local",
  });

  const needsReview =
    triage.confidence === "LOW" ||
    (triage.rfTriggered?.length ?? 0) > 0 ||
    (triage.consistencyFlags?.length ?? 0) > 0;

  const nextState = needsReview ? "NEEDS_REVIEW" : "TRIAGED";
  await setTriage(params.caseId, triage, nextState as any);

  const lines: string[] = [
    `<b>Assessment complete</b>`,
    ``,
    `Disposition: <b>${triage.disposition}</b>`,
    `Top diagnosis: <b>${triage.topCluster}</b>`,
    `Confidence: <b>${triage.confidence}</b>`,
  ];

  if (needsReview) {
    lines.push(
      "",
      "A clinician will review your case before final advice is sent."
    );
  }

  await telegramSendMessage({
    botToken: params.botToken,
    chatId: params.chatId,
    text: lines.join("\n"),
  });

  await clearActiveCaseId({ channel: "telegram", threadId: params.threadId });
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
    const msg = update?.message ?? update?.edited_message;
    if (!msg) return res.json({ ok: true });

    const chatId = msg.chat?.id;
    if (!chatId) return res.json({ ok: true });

    const threadId = String(chatId);
    const text: string = (msg.text ?? "").trim();

    const botCmd = await handleBotCommand(text, chatId);
    if (botCmd.handled) {
      await telegramSendMessage({ botToken, chatId, text: botCmd.text });
      return res.json({ ok: true });
    }

    if (text.toLowerCase() === "/start" || text.toLowerCase() === "/reset") {
      const oldCaseId = await getActiveCaseId({ channel: "telegram", threadId });
      if (oldCaseId) {
        const oldCase = await getCase(oldCaseId);
        if (oldCase && oldCase.state === "DRAFT") {
          await setCaseState(oldCaseId, "CLOSED");
        }
      }
      await clearActiveCaseId({ channel: "telegram", threadId });
      await telegramSendMessage({
        botToken,
        chatId,
        text: "Welcome! What's your main symptom?\n(Example: cough, fever, chest pain, rash, headache, sore throat)",
      });
      return res.json({ ok: true });
    }

    let caseId = await getActiveCaseId({ channel: "telegram", threadId });
    let c = caseId ? await getCase(caseId) : null;

    if (!c) {
      const match = matchComplaintFromText(text);
      if (!match) {
        await telegramSendMessage({
          botToken,
          chatId,
          text: "I didn't recognize that symptom. Could you describe your main complaint?\n(Example: cough, fever, chest pain, rash, headache, back pain)",
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
      await setActiveCaseId({
        channel: "telegram",
        threadId,
        activeCaseId: caseId,
      });
      c = created;

      await appendMessage(caseId, {
        ts: new Date().toISOString(),
        dir: "in",
        channel: "telegram",
        text,
      });

      const firstQ = getNextRequiredQuestion({
        complaintSlug: match.slug,
        answers: {},
      });

      if (!firstQ) {
        await telegramSendMessage({
          botToken,
          chatId,
          text: `Got it — <b>${match.display}</b>. Processing your assessment now…`,
        });
        await runTriageAndSend({ caseId, complaintSlug: match.slug, answers: {}, botToken, chatId, threadId });
        return res.json({ ok: true });
      }

      await telegramSendMessage({
        botToken,
        chatId,
        text: `Got it — <b>${match.display}</b>. I'll ask a few questions.\n\n${firstQ.QUESTION_TEXT}`,
      });
      return res.json({ ok: true });
    }

    await appendMessage(caseId!, {
      ts: new Date().toISOString(),
      dir: "in",
      channel: "telegram",
      text,
    });

    const answers = (c.answers?.structured ?? {}) as Record<string, any>;
    const nextQ = getNextRequiredQuestion({
      complaintSlug: c.complaint.slug,
      answers,
    });

    if (!nextQ) {
      await runTriageAndSend({ caseId: caseId!, complaintSlug: c.complaint.slug, answers, botToken, chatId, threadId });
      return res.json({ ok: true });
    }

    const parsed = parseAnswer(text, nextQ.ANSWER_TYPE);
    if (parsed === null) {
      const hint =
        nextQ.ANSWER_TYPE === "number"
          ? "Please reply with a number."
          : "Please reply yes or no.";
      await telegramSendMessage({
        botToken,
        chatId,
        text: `${hint}\n\n${nextQ.QUESTION_TEXT}`,
      });
      return res.json({ ok: true });
    }

    const patch: Record<string, any> = { [nextQ.Q_ID]: parsed };
    const updated = await mergeAnswers(caseId!, patch);

    const updatedAnswers = (updated.answers?.structured ?? {}) as Record<string, any>;
    const next2 = getNextRequiredQuestion({
      complaintSlug: updated.complaint.slug,
      answers: updatedAnswers,
    });

    if (next2) {
      await telegramSendMessage({
        botToken,
        chatId,
        text: next2.QUESTION_TEXT,
      });
    } else {
      await telegramSendMessage({
        botToken,
        chatId,
        text: "Thanks — processing your assessment now…",
      });
      await runTriageAndSend({
        caseId: caseId!,
        complaintSlug: updated.complaint.slug,
        answers: updatedAnswers,
        botToken,
        chatId,
        threadId,
      });
    }

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("Telegram webhook error:", err);
    return res.status(200).json({ ok: true, error: err.message });
  }
});

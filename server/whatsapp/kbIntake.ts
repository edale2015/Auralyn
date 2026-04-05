import { sendWhatsAppMessage } from "./send";
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

function formatTriageResult(triage: any): string {
  const emoji: Record<string, string> = {
    er_send: "🔴",
    urgent_care: "🟠",
    pcp: "🟡",
    self_care: "🟢",
  };
  const label: Record<string, string> = {
    er_send: "Emergency — Go to ER",
    urgent_care: "Go to Urgent Care",
    pcp: "See Your Doctor",
    self_care: "Self-Care at Home",
  };
  const e = emoji[triage.disposition] ?? "🔵";
  const l = label[triage.disposition] ?? triage.disposition;

  const lines = [
    `✅ *Assessment complete*`,
    ``,
    `${e} *${l}*`,
    `📋 Top finding: ${triage.topCluster ?? "—"}`,
    `📊 Confidence: ${triage.confidence}`,
  ];

  if ((triage.rfTriggered?.length ?? 0) > 0) {
    lines.push(``, `⚠️ *Red flag(s) noted — seek care promptly.*`);
  }

  lines.push(``, `_This is AI-assisted clinical decision support only. Not a substitute for physician evaluation._`);
  return lines.join("\n");
}

function buildComplaintMenu(): string {
  const complaints = (listEnabledComplaints() as any[]).slice(0, 20);
  const numbered = complaints.map((c, i) => `${i + 1}. ${c.LABEL}`).join("\n");
  return `👋 Welcome to Auralyn Triage.\n\nWhat's your main symptom? Type it or reply with a number:\n\n${numbered}\n\n_Or just describe your symptom in your own words._`;
}

async function runTriageAndSend(params: {
  caseId: string;
  complaintSlug: string;
  answers: Record<string, any>;
  to: string;
  threadId: string;
}) {
  await sendWhatsAppMessage(params.to, "⏳ Analyzing your answers…");

  const triage = await runOrchestratorTriage({
    complaintSlug: params.complaintSlug,
    answers: params.answers,
  });

  const needsReview =
    triage.confidence === "LOW" ||
    (triage.rfTriggered?.length ?? 0) > 0 ||
    (triage.consistencyFlags?.length ?? 0) > 0;

  await setTriage(params.caseId, triage, (needsReview ? "NEEDS_REVIEW" : "TRIAGED") as any);
  await sendWhatsAppMessage(params.to, formatTriageResult(triage));
  await clearActiveCaseId({ channel: "whatsapp", threadId: params.threadId });
}

export async function handleWhatsAppKBIntake(params: {
  from: string;
  text: string;
  messageSid: string;
}): Promise<boolean> {
  const { from, text } = params;
  const threadId = from.replace(/^whatsapp:/, "").replace(/^\+/, "");
  const cleanFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  const rawText = text.trim();

  if (rawText.toLowerCase() === "/start" || rawText.toLowerCase() === "hi" || rawText.toLowerCase() === "hello") {
    const oldCaseId = await getActiveCaseId({ channel: "whatsapp", threadId });
    if (oldCaseId) {
      const old = await getCase(oldCaseId);
      if (old?.state === "DRAFT") await setCaseState(oldCaseId, "CLOSED");
    }
    await clearActiveCaseId({ channel: "whatsapp", threadId });
    await sendWhatsAppMessage(cleanFrom, buildComplaintMenu());
    return true;
  }

  if (rawText.toLowerCase() === "/reset") {
    const oldCaseId = await getActiveCaseId({ channel: "whatsapp", threadId });
    if (oldCaseId) {
      const old = await getCase(oldCaseId);
      if (old?.state === "DRAFT") await setCaseState(oldCaseId, "CLOSED");
    }
    await clearActiveCaseId({ channel: "whatsapp", threadId });
    await sendWhatsAppMessage(cleanFrom, "Session cleared. Send your symptom or 'hi' to start again.");
    return true;
  }

  const caseId = await getActiveCaseId({ channel: "whatsapp", threadId });

  if (!caseId) {
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
      await sendWhatsAppMessage(cleanFrom, buildComplaintMenu());
      return true;
    }

    const created = await createCase({
      channel: "whatsapp",
      threadId,
      userId: threadId,
      complaintSlug: match.slug,
      complaintDisplay: match.display,
      engine: "GENERIC_V1",
    });

    await setActiveCaseId({ channel: "whatsapp", threadId, activeCaseId: created.caseId });
    await appendMessage(created.caseId, { ts: new Date().toISOString(), dir: "in", channel: "whatsapp", text: rawText });

    const firstQ = getNextRequiredQuestion({ complaintSlug: match.slug, answers: {} });
    if (!firstQ) {
      await sendWhatsAppMessage(cleanFrom, `Got it — *${match.display}*. Processing…`);
      await runTriageAndSend({ caseId: created.caseId, complaintSlug: match.slug, answers: {}, to: cleanFrom, threadId });
      return true;
    }

    await sendWhatsAppMessage(cleanFrom, `Got it — *${match.display}*. I'll ask a few quick questions.\n\n` + formatQuestionAsMenu(firstQ, "📋 Question 1"));
    return true;
  }

  const c = await getCase(caseId);
  if (!c) {
    await clearActiveCaseId({ channel: "whatsapp", threadId });
    await sendWhatsAppMessage(cleanFrom, "Session expired. Send 'hi' to start a new triage.");
    return true;
  }

  await appendMessage(caseId, { ts: new Date().toISOString(), dir: "in", channel: "whatsapp", text: rawText });

  const answers = (c.answers?.structured ?? {}) as Record<string, any>;
  const nextQ = getNextRequiredQuestion({ complaintSlug: c.complaint.slug, answers });

  if (!nextQ) {
    await runTriageAndSend({ caseId, complaintSlug: c.complaint.slug, answers, to: cleanFrom, threadId });
    return true;
  }

  const parsed = parseWhatsAppAnswer(rawText, nextQ.ANSWER_TYPE);
  if (parsed === null) {
    const answeredCount = Object.keys(answers).length;
    await sendWhatsAppMessage(cleanFrom, `Please reply with ${nextQ.ANSWER_TYPE === "number" ? "a number 1–10" : "1 for Yes or 2 for No"}.\n\n` + formatQuestionAsMenu(nextQ, `📋 Question ${answeredCount + 1}`));
    return true;
  }

  const patch: Record<string, any> = { [nextQ.Q_ID]: parsed };
  const updated = await mergeAnswers(caseId, patch);
  const updatedAnswers = (updated.answers?.structured ?? {}) as Record<string, any>;
  const answeredCount = Object.keys(updatedAnswers).length;
  const next2 = getNextRequiredQuestion({ complaintSlug: updated.complaint.slug, answers: updatedAnswers });

  if (next2) {
    await sendWhatsAppMessage(cleanFrom, formatQuestionAsMenu(next2, `📋 Question ${answeredCount + 1}`));
  } else {
    await sendWhatsAppMessage(cleanFrom, "Thanks — processing your assessment now…");
    await runTriageAndSend({ caseId, complaintSlug: updated.complaint.slug, answers: updatedAnswers, to: cleanFrom, threadId });
  }

  return true;
}

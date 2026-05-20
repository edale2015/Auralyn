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

// Map master-rules disposition codes → CaseTriage disposition values
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
    er_send: "🔴",
    urgent_care: "🟠",
    pcp: "🟡",
    self_care: "🟢",
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
    `✅ *Assessment complete*`,
    ``,
    `${e} *${l}*`,
    `📋 Top finding: ${triage.topCluster ?? "—"}`,
    `📊 Confidence: ${triage.confidence}`,
  ];

  // Master rules overlay — hard stop / critical red flags
  if (masterResult?.hardStop && masterResult.hardStopReason) {
    const flagName = masterResult.hardStopReason.split(":")[0].trim();
    lines.push(``, `🚨 *Critical alert: ${flagName}*`, `_Seek emergency care immediately._`);
  } else if ((triage.rfTriggered?.length ?? 0) > 0) {
    lines.push(``, `⚠️ *Red flag(s) noted — seek care promptly.*`);
  }

  // Rule engine summary
  if (masterResult && masterResult.totalRulesFired > 0) {
    const rfCount = (masterResult.criticalFlagsHit?.length ?? 0);
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

// Build a lightweight triage object directly from the rule-engine result.
// Zero LLM calls — pure DB. Target latency: ~200–400 ms.
function buildTriageFromPipeline(p: PipelineResult): Record<string, any> {
  const disposition = mapMasterDisposition(p.finalDisposition) ?? "urgent_care";

  // Derive confidence from how many rules fired + hard-stop status
  let confidence: string;
  if (p.hardStop)              confidence = "HIGH";
  else if (p.totalRulesFired >= 8) confidence = "MODERATE";
  else                         confidence = "LOW";

  // Best topCluster: hard-stop reason, or first fired diagnosis name, or complaint
  const dxStep    = p.steps.find(s => s.ruleType === "diagnosis");
  const topDx     = dxStep?.rulesFired?.[0]?.rule_name ?? null;
  const topCluster = p.hardStop
    ? (p.hardStopReason?.split(":")[0]?.trim() ?? "Critical red flag")
    : (topDx ?? p.complaint_id.replace(/_/g, " "));

  return {
    disposition,
    confidence,
    topCluster,
    rfTriggered:       p.criticalFlagsHit ?? [],
    consistencyFlags:  [],
  };
}

async function runTriageAndSend(params: {
  caseId: string;
  complaintSlug: string;
  answers: Record<string, any>;
  to: string;
  threadId: string;
}) {
  // ── Fast path: pure rule engine, single DB query (~200–400 ms, zero LLM calls) ──
  // Callers already sent a "processing…" message so we go straight to the engine.
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

  // Send result to patient + persist triage in parallel — patient reply is not gated on DB write
  await Promise.all([
    sendWhatsAppMessage(params.to, resultText),
    setTriage(params.caseId, triage as any, (needsReview ? "NEEDS_REVIEW" : "TRIAGED") as any),
  ]);

  console.log(`[WhatsApp] ⚡ ${Date.now() - t0}ms total — disp=${triage.disposition} rules=${masterResult?.totalRulesFired ?? 0} hardStop=${masterResult?.hardStop ?? false}`);

  // Post-reply cleanup — fire-and-forget, patient already has their answer
  logInteraction({
    sessionId: params.caseId,
    caseId: params.caseId,
    channel: "whatsapp",
    direction: "outbound",
    skillName: "triage_result",
    messageText: resultText,
    responseText: `disposition=${triage.disposition}|confidence=${triage.confidence}|rules=${masterResult?.totalRulesFired ?? 0}`,
  }).catch(() => {});

  Promise.all([
    endSession(params.caseId, triage.disposition as any),
    clearActiveCaseId({ channel: "whatsapp", threadId: params.threadId }),
  ]).catch(() => {});

  // ── Async enrichment: LLM orchestrator runs AFTER patient has answer ──
  // setImmediate guarantees this starts only after the current call stack
  // (including sendWhatsAppMessage above) is fully resolved — truly non-blocking.
  setImmediate(() => {
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

  setTimeout(async () => {
    const surveyText = `📋 *Quick feedback*\n\nHow would you rate your experience today?\n\n5️⃣ Excellent  4️⃣ Good  3️⃣ Okay  2️⃣ Poor  1️⃣ Very poor\n\nReply 1–5`;
    await sendWhatsAppMessage(params.to, surveyText);
    await setSurveyState("whatsapp", params.threadId, params.caseId, "csat");
    logInteraction({ sessionId: params.caseId, channel: "whatsapp", direction: "outbound", skillName: "csat_survey", messageText: surveyText }).catch(() => {});
  }, 2000);
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

  const mood = analyzeMood(rawText);

  if (rawText.toLowerCase() === "/start" || rawText.toLowerCase() === "hi" || rawText.toLowerCase() === "hello") {
    const oldCaseId = await getActiveCaseId({ channel: "whatsapp", threadId });
    if (oldCaseId) {
      const old = await getCase(oldCaseId);
      if (old?.state === "DRAFT") await setCaseState(oldCaseId, "CLOSED");
    }
    await clearActiveCaseId({ channel: "whatsapp", threadId });
    await clearSurveyState("whatsapp", threadId);
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
    await clearSurveyState("whatsapp", threadId);
    await sendWhatsAppMessage(cleanFrom, "Session cleared. Send your symptom or 'hi' to start again.");
    return true;
  }

  const survey = await getSurveyState("whatsapp", threadId);
  if (survey) {
    const n = parseInt(rawText.trim());
    if (survey.phase === "csat" && !isNaN(n) && n >= 1 && n <= 5) {
      await recordCsat(survey.sessionId, n);
      logInteraction({ sessionId: survey.sessionId, channel: "whatsapp", direction: "inbound", skillName: "csat_reply", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
      await setSurveyState("whatsapp", threadId, survey.sessionId, "nps");
      const npsText = `Thanks! One more — how likely are you to recommend Auralyn to someone you know?\n\n0 = Not at all   10 = Absolutely yes\n\nReply 0–10`;
      await sendWhatsAppMessage(cleanFrom, npsText);
      logInteraction({ sessionId: survey.sessionId, channel: "whatsapp", direction: "outbound", skillName: "nps_survey", messageText: npsText }).catch(() => {});
      return true;
    }
    if (survey.phase === "nps" && !isNaN(n) && n >= 0 && n <= 10) {
      await recordNps(survey.sessionId, n);
      await clearSurveyState("whatsapp", threadId);
      logInteraction({ sessionId: survey.sessionId, channel: "whatsapp", direction: "inbound", skillName: "nps_reply", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
      await sendWhatsAppMessage(cleanFrom, `🙏 Thank you! Your feedback helps us improve care. Stay well.`);
      return true;
    }
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
      const tonePrefix = buildTonePrefix(mood.mood);
      await sendWhatsAppMessage(cleanFrom, tonePrefix + buildComplaintMenu());
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

    await startSession(created.caseId, created.caseId, "whatsapp");
    await setActiveCaseId({ channel: "whatsapp", threadId, activeCaseId: created.caseId });

    logInteraction({ sessionId: created.caseId, caseId: created.caseId, channel: "whatsapp", direction: "inbound", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
    await incrementMessageCount(created.caseId);
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

  logInteraction({ sessionId: caseId, caseId, channel: "whatsapp", direction: "inbound", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
  await incrementMessageCount(caseId);
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

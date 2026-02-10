import { randomUUID } from "crypto";
import { storage, type FlowQuestion } from "../storage";
import { type MessageEvent, buildConversationId, type Channel } from "./messageEvent";
import { getConversationStateStore, type ConversationState, hashBody } from "./conversationState";
import { sendReply } from "./channelAdapter";
import { getConversationLog, detectFrictionSignals } from "../traces/conversationLog";
import { isStaffCommand, handleStaffCommand } from "../whatsapp/staffCommands";
import {
  routeFlowFromText,
  flowFromMenuChoice,
  menuText,
  getAnswersObj,
  setMenuState,
  isAwaitingChoice,
  isAwaitingOtherText,
  isMenuResetCommand,
  isStatusCommand,
  buildRouterAudit,
  setRouterAudit,
} from "../flows/whatsappFlowRouter";
import { generateToken, generateCode, expiresAtMinutes, INTAKE_EXPIRY_MINUTES, BASE_URL } from "../intake/intakeAuth";
import { getEmergencyWarning, buildWarningLogEntry } from "./emergencyWarnings";
import { getChannelOpsTracker } from "./channelOps";

const FRICTION_TONE_SWITCH_THRESHOLD = 5;
const FRICTION_NARROW_THRESHOLD = 8;
const FRICTION_STOP_THRESHOLD = 12;

const HARDCODED_ENT_FLU_FLOW: FlowQuestion[] = [
  { id: "RF_SOB", text: "Trouble breathing at rest? (yes/no)", type: "yesno", required: true },
  { id: "RF_CP", text: "Chest pain or pressure? (yes/no)", type: "yesno", required: true },
  { id: "RF_NEURO", text: "Confusion, fainting, or severe weakness? (yes/no)", type: "yesno", required: true },
  { id: "RF_DEHY", text: "Unable to keep fluids down or signs of dehydration? (yes/no)", type: "yesno", required: true },
  { id: "ONSET_DAYS", text: "How many days since symptoms started? (number)", type: "number", required: true },
  { id: "FEVER", text: "Fever ≥100.4F / 38C? (yes/no)", type: "yesno", required: true },
  { id: "ACHES", text: "Body aches or marked fatigue? (yes/no)", type: "yesno", required: true },
  { id: "COUGH", text: "Cough? (yes/no)", type: "yesno", required: true },
  { id: "SORE_THROAT", text: "Sore throat? (yes/no)", type: "yesno", required: true },
  { id: "CONGESTION", text: "Nasal congestion or sinus pressure? (yes/no)", type: "yesno", required: true },
  { id: "EAR_PAIN", text: "Ear pain or fullness? (yes/no)", type: "yesno", required: true },
  { id: "GI", text: "Nausea or diarrhea? (yes/no)", type: "yesno", required: true },
  { id: "PREGNANT", text: "Are you pregnant? (yes/no)", type: "yesno", required: true },
  { id: "HTN", text: "Do you have high blood pressure? (yes/no)", type: "yesno", required: true },
  { id: "ANXIETY", text: "Anxiety/panic or very sensitive to stimulants? (yes/no)", type: "yesno", required: true },
  { id: "SSRI", text: "Do you take an SSRI/SNRI antidepressant? (yes/no)", type: "yesno", required: true },
  { id: "ALLERGIES", text: "Any medication allergies? (short answer)", type: "text", required: true },
  { id: "COVID_POS", text: "COVID test positive? (yes/no/not tested)", type: "choice", required: true },
  { id: "FLU_POS", text: "Flu test positive? (yes/no/not tested)", type: "choice", required: true },
];

async function getFlowQuestions(flowId: string): Promise<FlowQuestion[]> {
  if (process.env.SHEETS_SPREADSHEET_ID) {
    try {
      const questions = await storage.getFlowQuestions(flowId);
      if (questions.length > 0) return questions;
    } catch { /* fall through */ }
  }
  return HARDCODED_ENT_FLU_FLOW;
}

function parseAnswer(type: string, raw: string): boolean | number | string | null {
  const v = raw.toLowerCase().trim();
  if (type === "yesno") return ["yes", "y", "yeah", "yep", "true", "1"].includes(v);
  if (type === "number") {
    const num = Number(v);
    if (isNaN(num) || v === "") return null;
    return num;
  }
  if (type === "choice") {
    if (v.startsWith("y")) return "yes";
    if (v.startsWith("n")) return "no";
    return "not tested";
  }
  return raw.trim();
}

function isStaffUser(channel: Channel, externalUserId: string): boolean {
  if (channel === "whatsapp") {
    const normalizePhone = (p: string) => p.replace(/^whatsapp:/, "").replace(/\s+/g, "").trim();
    const staffNums = (process.env.STAFF_WHATSAPP_NUMBERS || "")
      .split(",").map(s => normalizePhone(s)).filter(Boolean);
    return staffNums.includes(normalizePhone(externalUserId));
  }
  if (channel === "telegram") {
    const staffIds = (process.env.STAFF_TELEGRAM_IDS || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    return staffIds.includes(String(externalUserId));
  }
  return false;
}

export interface OrchestratorResult {
  replies: string[];
  conversationState: ConversationState;
  isStaffCommand: boolean;
  dedupSkipped: boolean;
}

export async function processMessage(event: MessageEvent): Promise<OrchestratorResult> {
  const convId = buildConversationId(event.channel, event.externalUserId);
  const store = getConversationStateStore();
  const ops = getChannelOpsTracker();
  const startMs = Date.now();

  ops.recordInbound(event.channel);

  const bodyH = hashBody(event.text);
  const dedupe = await store.checkDedupe(event.channel, event.messageId, bodyH);
  if (dedupe.seen) {
    ops.recordDedupeHit(event.channel);
    const state = await store.getOrCreate(convId, event.channel, event.externalUserId);
    return { replies: [], conversationState: state, isStaffCommand: false, dedupSkipped: true };
  }
  await store.markSeen(event.channel, event.messageId, bodyH);

  const convState = await store.getOrCreate(convId, event.channel, event.externalUserId);
  const isStaff = isStaffUser(event.channel, event.externalUserId);
  if (isStaff !== convState.isStaff) {
    await store.update(convId, { isStaff });
  }

  await store.appendMessage(convId, { from: "patient", text: event.text, ts: event.timestamp });

  const frictionSignals = detectFrictionSignals(event.text);
  if (frictionSignals.length > 0) {
    await store.recordFriction(convId, frictionSignals);
  }

  const frictionState = await store.getOrCreate(convId, event.channel, event.externalUserId);

  if (frictionState.isStopped) {
    const reply = "This conversation has been paused. A staff member will follow up with you. If this is an emergency, call 911.";
    ops.recordProcessingTime(event.channel, Date.now() - startMs);
    return { replies: [reply], conversationState: frictionState, isStaffCommand: false, dedupSkipped: false };
  }

  if (frictionState.frictionScore >= FRICTION_STOP_THRESHOLD && !isStaff) {
    await store.update(convId, {
      isStopped: true,
      stopReason: "FRICTION_THRESHOLD_EXCEEDED",
    });
    ops.recordFrictionStop(event.channel);
    const reply = "We're going to pause here and have a staff member follow up with you directly to make sure we can help. If this is an emergency, call 911.";
    ops.recordProcessingTime(event.channel, Date.now() - startMs);
    return { replies: [reply], conversationState: frictionState, isStaffCommand: false, dedupSkipped: false };
  }

  if (frictionState.frictionScore >= FRICTION_TONE_SWITCH_THRESHOLD && frictionState.toneProfile !== "concise") {
    await store.update(convId, { toneProfile: "concise" });
    ops.recordFrictionEscalation(event.channel);
  }

  if (isStaff && isStaffCommand(event.text)) {
    try {
      const { checkStaffCommandAccess } = await import("../whatsapp/staffGate");
      const access = checkStaffCommandAccess(event.externalUserId);
      let reply: string;
      if (!access.allowed) {
        reply = access.reason || "Command not available.";
      } else {
        reply = await handleStaffCommand(event.text);
      }
      await store.appendMessage(convId, { from: "system", text: reply, ts: new Date().toISOString() });
      return { replies: [reply], conversationState: convState, isStaffCommand: true, dedupSkipped: false };
    } catch (err: any) {
      return { replies: [`Command error: ${err?.message}`], conversationState: convState, isStaffCommand: true, dedupSkipped: false };
    }
  }

  const msg = event.text.trim();
  const replies: string[] = [];

  let patient = await storage.getPatientByPhone(event.externalUserId);
  if (!patient) {
    patient = await storage.createPatient({
      phoneNumber: event.externalUserId,
      name: null,
    });
  }
  await store.update(convId, { patientId: patient.id });

  let encounter = await storage.getActiveEncounterByPatient(patient.id);
  if (!encounter) {
    encounter = await storage.createEncounter({
      patientId: patient.id,
      status: "in_progress",
      system: "ENT",
      complaint: "FLU_LIKE_URI",
      specialty: "ENT",
      flowId: "ENT_FLU_LIKE_V1",
      flowIndex: 0,
      answers: JSON.stringify({}),
    });
  }
  await store.update(convId, { encounterId: encounter.id });

  let answersObj = getAnswersObj(encounter.answers);

  if (isMenuResetCommand(msg)) {
    const updated = setMenuState(answersObj, { awaitingChoice: true });
    await storage.updateEncounter(encounter.id, { answers: JSON.stringify(updated) } as any);
    replies.push(menuText());
    await logTurns(event, encounter.id, msg, replies);
    return { replies, conversationState: convState, isStaffCommand: false, dedupSkipped: false };
  }

  if (isStatusCommand(msg)) {
    const now = new Date();
    const tokenValid = encounter.intakeToken && encounter.intakeExpiresAt && new Date(encounter.intakeExpiresAt) > now;
    if (tokenValid) {
      const intakeLink = `${BASE_URL}/intake/${encounter.intakeToken}`;
      const mins = Math.round((new Date(encounter.intakeExpiresAt!).getTime() - now.getTime()) / 60000);
      replies.push(`Here's your intake link again:\n${intakeLink}\n\nCode: ${encounter.intakeCode}\n\nExpires in ${mins} minutes.`);
    } else {
      const intakeToken = generateToken();
      const intakeCode = generateCode();
      const intakeExpiresAt = expiresAtMinutes(INTAKE_EXPIRY_MINUTES);
      await storage.updateEncounter(encounter.id, { intakeToken, intakeCode, intakeExpiresAt, flowIndex: 1 } as any);
      const intakeLink = `${BASE_URL}/intake/${intakeToken}`;
      replies.push(`Here's a fresh intake link:\n${intakeLink}\n\nCode: ${intakeCode}\n\nValid for 30 minutes.`);
    }
    await logTurns(event, encounter.id, msg, replies);
    return { replies, conversationState: convState, isStaffCommand: false, dedupSkipped: false };
  }

  if (isAwaitingOtherText(answersObj)) {
    const pick = routeFlowFromText(msg);
    const cleared = setMenuState(answersObj, { awaitingChoice: false, awaitingOtherText: false });
    setRouterAudit(cleared, {
      routerReason: "other_text",
      routerPickedFlowId: pick.flowId,
      routerPickedSystem: pick.system,
      routerTextSnippet: msg.slice(0, 60),
    });
    await storage.updateEncounter(encounter.id, {
      system: pick.system, complaint: pick.complaint, specialty: pick.specialty,
      flowId: pick.flowId, flowIndex: 0, answers: JSON.stringify(cleared), status: "in_progress",
    } as any);
    encounter = await storage.getEncounter(encounter.id) as typeof encounter;
    answersObj = getAnswersObj(encounter.answers);
  }

  if (isAwaitingChoice(answersObj)) {
    const pick = flowFromMenuChoice(msg);
    if (!pick) {
      const cleared = setMenuState(answersObj, { awaitingChoice: false, awaitingOtherText: true });
      await storage.updateEncounter(encounter.id, { answers: JSON.stringify(cleared) } as any);
      replies.push("Okay. Please describe your main symptom in one sentence.");
      await logTurns(event, encounter.id, msg, replies);
      return { replies, conversationState: convState, isStaffCommand: false, dedupSkipped: false };
    }
    const cleared = setMenuState(answersObj, { awaitingChoice: false });
    setRouterAudit(cleared, {
      routerReason: "menu",
      routerPickedFlowId: pick.flowId,
      routerPickedSystem: pick.system,
      routerTextSnippet: msg.slice(0, 60),
    });
    await storage.updateEncounter(encounter.id, {
      system: pick.system, complaint: pick.complaint, specialty: pick.specialty,
      flowId: pick.flowId, flowIndex: 0, answers: JSON.stringify(cleared), status: "in_progress",
    } as any);
    encounter = await storage.getEncounter(encounter.id) as typeof encounter;
    answersObj = getAnswersObj(encounter.answers);
  }

  const lower = msg.toLowerCase();
  const isGreeting = lower === "hi" || lower === "hello" || lower === "start" || lower === "help";

  if (isGreeting && (encounter.flowIndex === 0 || !encounter.flowId || encounter.flowId === "ENT_FLU_LIKE_V1")) {
    const updated = setMenuState(answersObj, { awaitingChoice: true });
    await storage.updateEncounter(encounter.id, { answers: JSON.stringify(updated) } as any);
    replies.push(menuText());
    await logTurns(event, encounter.id, msg, replies);
    return { replies, conversationState: convState, isStaffCommand: false, dedupSkipped: false };
  }

  if (!encounter.system || !encounter.flowId || (encounter.flowId === "ENT_FLU_LIKE_V1" && encounter.flowIndex === 0)) {
    const pick = routeFlowFromText(msg);
    setRouterAudit(answersObj, {
      routerReason: "keyword",
      routerPickedFlowId: pick.flowId,
      routerPickedSystem: pick.system,
      routerTextSnippet: msg.slice(0, 60),
    });
    await storage.updateEncounter(encounter.id, {
      system: pick.system, complaint: pick.complaint, specialty: pick.specialty,
      flowId: pick.flowId, flowIndex: 0, status: "in_progress", answers: JSON.stringify(answersObj),
    } as any);
    encounter = await storage.getEncounter(encounter.id) as typeof encounter;
  }

  const warningTemplate = getEmergencyWarning(encounter.flowId || "");
  if (warningTemplate) {
    replies.push(warningTemplate.text);
    ops.recordEmergencyWarning(event.channel);
    const logEntry = buildWarningLogEntry(warningTemplate, convId);
    getConversationLog().log({
      id: randomUUID(),
      caseId: String(encounter.id),
      encounterId: String(encounter.id),
      channel: event.channel,
      sender: "system",
      messageText: `[EMERGENCY_WARNING:${warningTemplate.id}@${warningTemplate.version}] ${warningTemplate.text}`,
      timestamp: logEntry.timestamp,
      llmUsed: false,
      frictionSignals: [],
    }).catch(err => console.warn("[ConvLog] Failed to log emergency warning:", err?.message));
  }

  await storage.createMessage({
    patientId: patient.id,
    encounterId: encounter.id,
    direction: "inbound",
    messageBody: msg,
    messageSid: event.messageId,
  });

  const flowIndex = encounter.flowIndex ?? 0;
  const answers: Record<string, any> = encounter.answers ? JSON.parse(encounter.answers) : {};
  const flowId = encounter.flowId || "ENT_FLU_LIKE_V1";
  const flow = await getFlowQuestions(flowId);

  let responseMessage: string;

  if (flowIndex === 0) {
    const intakeToken = generateToken();
    const intakeCode = generateCode();
    const intakeExpiresAt = expiresAtMinutes(INTAKE_EXPIRY_MINUTES);
    await storage.updateEncounter(encounter.id, { intakeToken, intakeCode, intakeExpiresAt, flowIndex: 1 } as any);
    const intakeLink = `${BASE_URL}/intake/${intakeToken}`;
    responseMessage = `Welcome to Med Scribe Triage.\n\nTap the secure link to answer a few quick questions:\n${intakeLink}\n\nAccess code: ${intakeCode}\n\nIf you can't open the link, reply QUESTIONS to answer here.\nTo resend the link, reply LINK.`;
  } else if (msg.toLowerCase() === "questions" || msg.toLowerCase() === "question") {
    const firstQuestion = flow[0];
    responseMessage = `OK, I'll ask you the questions here.\n\n${firstQuestion.text}`;
    await storage.updateEncounter(encounter.id, {
      flowIndex: 1, intakeToken: null, intakeCode: null, intakeExpiresAt: null,
    } as any);
  } else {
    const prevQuestion = flow[flowIndex - 1];
    if (!prevQuestion) {
      responseMessage = "Something went wrong. Please reply HI to start over.";
    } else {
      const parsed = parseAnswer(prevQuestion.type, msg);
      if (parsed === null) {
        responseMessage = `I didn't understand that response. Please enter a valid number.\n\n${prevQuestion.text}`;
        replies.push(responseMessage);
        await logTurns(event, encounter.id, msg, replies);
        return { replies, conversationState: convState, isStaffCommand: false, dedupSkipped: false };
      }

      answers[prevQuestion.id] = parsed;

      if (flowIndex >= flow.length) {
        const { computeProposalGeneric } = await import("../rules/computeProposalGeneric");
        const proposal = await computeProposalGeneric(answers, { flowId });
        const urgencyLevel = proposal.redFlag ? "urgent" : "routine";
        await storage.updateEncounter(encounter.id, {
          answers: JSON.stringify(answers),
          proposal: JSON.stringify(proposal),
          status: "pending_review",
          urgencyLevel,
          chiefComplaint: "Flu-like symptoms / URI",
          aiDisposition: proposal.disposition,
        });
        responseMessage = proposal.redFlag
          ? "Thank you. Your symptoms include red flags that need urgent attention. Please seek care at an urgent care or emergency room. A physician will also review your case."
          : "Thank you for completing the assessment. Your case has been sent to a physician for review. If you develop trouble breathing, chest pain, confusion, or can't keep fluids down, seek urgent care/ER immediately.";
      } else {
        const nextQuestion = flow[flowIndex];
        responseMessage = nextQuestion.text;
        await storage.updateEncounter(encounter.id, { flowIndex: flowIndex + 1, answers: JSON.stringify(answers) });
      }
    }
  }

  replies.push(responseMessage);
  await logTurns(event, encounter.id, msg, replies);
  ops.recordProcessingTime(event.channel, Date.now() - startMs);
  return { replies, conversationState: convState, isStaffCommand: false, dedupSkipped: false };
}

async function logTurns(event: MessageEvent, encounterId: number, inboundText: string, outboundReplies: string[]) {
  const log = getConversationLog();
  const now = new Date().toISOString();

  log.log({
    id: randomUUID(),
    caseId: String(encounterId),
    encounterId: String(encounterId),
    channel: event.channel,
    sender: "patient",
    messageText: inboundText,
    timestamp: event.timestamp,
    frictionSignals: detectFrictionSignals(inboundText),
  }).catch(err => console.warn("[ConvLog] Failed to log inbound:", err?.message));

  for (const reply of outboundReplies) {
    log.log({
      id: randomUUID(),
      caseId: String(encounterId),
      encounterId: String(encounterId),
      channel: event.channel,
      sender: "agent",
      messageText: reply,
      timestamp: now,
      llmUsed: false,
      frictionSignals: [],
    }).catch(err => console.warn("[ConvLog] Failed to log outbound:", err?.message));
  }
}

import { firestoreCaseStore } from "./firestoreCaseStore";
import { firestoreCaseEventsStore } from "./firestoreCaseEvents";
import { firestoreRuntimeMetricsStore } from "./firestoreRuntimeMetrics";
import type { CaseRecord, CaseEngineResult } from "../types/case";

async function runEngineForChat(caseRecord: CaseRecord): Promise<CaseEngineResult> {
  return {
    complaintId: caseRecord.complaintId,
    complaintLabel: caseRecord.complaintLabel,
    recommendedDisposition: "UNKNOWN",
    confidence: "LOW",
    triggeredRedFlags: [],
    winningClusterId: undefined,
    dxCandidates: [],
    clusterScores: [],
    ruleTrace: [],
    render: {},
    engineVersion: "GENERIC_V1"
  };
}

export type ChatMessageRole = "system" | "assistant" | "user";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  text: string;
  createdAt: string;
  token?: string;
}

export interface ChatSessionState {
  caseId: string;
  sessionId: string;
  complaintId: string;
  complaintLabel?: string;
  messages: ChatMessage[];
  currentQuestionToken?: string;
  currentQuestionText?: string;
  completed: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function humanizeToken(token?: string): string {
  if (!token) return "question";
  return token.toLowerCase().replace(/_/g, " ");
}

function pickNextQuestion(caseRecord: CaseRecord): { token?: string; text?: string; completed: boolean } {
  const answers = caseRecord.answers ?? {};
  const critical = caseRecord.unansweredCriticalQuestions ?? [];

  if (critical.length > 0) {
    const token = critical[0];
    return {
      token,
      text: `Please answer this follow-up question: ${humanizeToken(token)}?`,
      completed: false
    };
  }

  const genericOrder = [
    "AGE_Y",
    "DURATION_DAYS",
    "FEVER",
    "SEVERITY",
    "SOB"
  ];

  for (const token of genericOrder) {
    if (answers[token] === undefined || answers[token] === null || answers[token] === "") {
      return {
        token,
        text: `Please answer: ${humanizeToken(token)}?`,
        completed: false
      };
    }
  }

  return { completed: true };
}

export class ChatSessionService {
  private sessions = new Map<string, ChatSessionState>();

  private async persistSession(state: ChatSessionState): Promise<void> {
    await firestoreCaseStore.patchCase(state.caseId, {
      metadata: {
        chatSession: {
          sessionId: state.sessionId,
          messages: state.messages,
          currentQuestionToken: state.currentQuestionToken,
          currentQuestionText: state.currentQuestionText,
          completed: state.completed
        }
      }
    });
  }

  private async recoverSession(sessionId: string): Promise<ChatSessionState | null> {
    const cases = await firestoreCaseStore.listCases({ limit: 100 });
    for (const c of cases) {
      const meta = c.metadata as any;
      if (meta?.chatSession?.sessionId === sessionId) {
        const s = meta.chatSession;
        const state: ChatSessionState = {
          caseId: c.caseId,
          sessionId: s.sessionId,
          complaintId: c.complaintId,
          complaintLabel: c.complaintLabel,
          messages: s.messages ?? [],
          currentQuestionToken: s.currentQuestionToken,
          currentQuestionText: s.currentQuestionText,
          completed: s.completed ?? false
        };
        this.sessions.set(sessionId, state);
        return state;
      }
    }
    return null;
  }

  async startSession(input: {
    complaintId: string;
    complaintLabel?: string;
    caseId?: string;
    patientContext?: CaseRecord["patientContext"];
  }): Promise<ChatSessionState> {
    const caseId = input.caseId ?? makeId("case");
    const sessionId = makeId("chat");

    const existing = await firestoreCaseStore.createCase({
      caseId,
      complaintId: input.complaintId,
      complaintLabel: input.complaintLabel,
      sourceChannel: "web_chat",
      patientContext: input.patientContext,
      answers: {},
      sessionId,
      signoffRequired: true
    });

    await firestoreCaseEventsStore.appendEvent({
      caseId,
      type: "CASE_CREATED",
      summary: "Web chat case created",
      actorRole: "patient"
    });

    await firestoreRuntimeMetricsStore.logMetric({
      type: "CASE_CREATED",
      caseId,
      complaintId: input.complaintId
    });

    const next = pickNextQuestion(existing);

    const messages: ChatMessage[] = [
      {
        id: makeId("msg"),
        role: "assistant",
        text: next.completed
          ? "Your intake is complete and ready for review."
          : `Thanks. I'll ask a few questions. ${next.text}`,
        createdAt: nowIso(),
        token: next.token
      }
    ];

    const state: ChatSessionState = {
      caseId,
      sessionId,
      complaintId: input.complaintId,
      complaintLabel: input.complaintLabel,
      messages,
      currentQuestionToken: next.token,
      currentQuestionText: next.text,
      completed: next.completed
    };

    this.sessions.set(sessionId, state);
    await this.persistSession(state);

    if (!next.completed && next.token) {
      await firestoreCaseEventsStore.appendEvent({
        caseId,
        type: "QUESTION_ASKED",
        summary: `Asked ${next.token}`,
        actorRole: "assistant",
        payload: { token: next.token, text: next.text }
      });
    }

    return state;
  }

  async getSession(sessionId: string): Promise<ChatSessionState | null> {
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;
    return this.recoverSession(sessionId);
  }

  async answerQuestion(input: {
    sessionId: string;
    answerText: string;
  }): Promise<ChatSessionState> {
    const session = this.sessions.get(input.sessionId);
    if (!session) throw new Error(`Session not found: ${input.sessionId}`);

    const caseRecord = await firestoreCaseStore.getCase(session.caseId);
    if (!caseRecord) throw new Error(`Case not found: ${session.caseId}`);

    const token = session.currentQuestionToken;

    session.messages.push({
      id: makeId("msg"),
      role: "user",
      text: input.answerText,
      createdAt: nowIso(),
      token
    });

    await firestoreCaseEventsStore.appendEvent({
      caseId: session.caseId,
      type: "ANSWER_RECORDED",
      summary: `Recorded answer for ${token ?? "free_text"}`,
      actorRole: "patient",
      payload: { token, answerText: input.answerText }
    });

    if (token) {
      await firestoreCaseStore.updateAnswers(session.caseId, {
        [token]: input.answerText
      });
    }

    const refreshed = await firestoreCaseStore.getCase(session.caseId);
    if (!refreshed) throw new Error(`Case vanished: ${session.caseId}`);

    const engineResult = await runEngineForChat(refreshed);

    await firestoreCaseStore.setEngineResult(session.caseId, engineResult);

    await firestoreCaseEventsStore.appendEvent({
      caseId: session.caseId,
      type: "ENGINE_RUN",
      summary: `Engine recommended ${engineResult.recommendedDisposition}`,
      actorRole: "system",
      payload: {
        winningClusterId: engineResult.winningClusterId,
        redFlags: engineResult.triggeredRedFlags,
        dxCandidates: engineResult.dxCandidates.slice(0, 5)
      }
    });

    await firestoreRuntimeMetricsStore.logMetric({
      type: "ENGINE_RUN",
      caseId: session.caseId,
      complaintId: refreshed.complaintId,
      disposition: engineResult.recommendedDisposition,
      winningClusterId: engineResult.winningClusterId,
      engineVersion: engineResult.engineVersion
    });

    const afterEngine = await firestoreCaseStore.getCase(session.caseId);
    if (!afterEngine) throw new Error(`Case missing after engine run: ${session.caseId}`);

    const next = pickNextQuestion(afterEngine);

    if (next.completed) {
      session.completed = true;
      session.currentQuestionToken = undefined;
      session.currentQuestionText = undefined;

      session.messages.push({
        id: makeId("msg"),
        role: "assistant",
        text: "Thank you. Your intake is complete and has been sent for clinician review.",
        createdAt: nowIso()
      });

      await firestoreCaseStore.patchCase(session.caseId, {
        status: "AWAITING_REVIEW",
        reviewStatus: "PENDING_REVIEW"
      });
    } else {
      session.completed = false;
      session.currentQuestionToken = next.token;
      session.currentQuestionText = next.text;

      session.messages.push({
        id: makeId("msg"),
        role: "assistant",
        text: next.text || "Please continue.",
        createdAt: nowIso(),
        token: next.token
      });

      await firestoreCaseEventsStore.appendEvent({
        caseId: session.caseId,
        type: "QUESTION_ASKED",
        summary: `Asked ${next.token}`,
        actorRole: "assistant",
        payload: { token: next.token, text: next.text }
      });
    }

    this.sessions.set(session.sessionId, session);
    await this.persistSession(session);
    return session;
  }
}

export const chatSessionService = new ChatSessionService();

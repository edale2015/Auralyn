import { firestoreCaseStore } from "./firestoreCaseStore";
import { firestoreCaseEventsStore } from "./firestoreCaseEvents";
import { firestoreRuntimeMetricsStore } from "./firestoreRuntimeMetrics";
import { logShadowModeEvent } from "./shadowModeLogger";
import { runEngineForChatAdapter } from "./chatEngineAdapter";
import { normalizeChatAnswerWithAudit } from "./chatAnswerNormalizer";
import { planNextQuestion } from "./chatQuestionPlanner";
import type { CaseRecord } from "../types/case";

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

    logShadowModeEvent({
      timestamp: new Date().toISOString(),
      caseId,
      complaintId: input.complaintId,
      eventType: "CASE_ENTERED_SHADOW_MODE",
      notes: "Case entered shadow-mode workflow via web chat"
    });

    await firestoreRuntimeMetricsStore.logMetric({
      type: "CASE_CREATED",
      caseId,
      complaintId: input.complaintId
    });

    const next = await planNextQuestion(input.complaintId, {});

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
        [token]: normalizeChatAnswerWithAudit(input.answerText, {
          caseId: session.caseId,
          ccId: session.complaintId,
          token,
        })
      });
    }

    const refreshed = await firestoreCaseStore.getCase(session.caseId);
    if (!refreshed) throw new Error(`Case vanished: ${session.caseId}`);

    const engineRun = await runEngineForChatAdapter({ caseRecord: refreshed });

    await firestoreCaseStore.setEngineResult(session.caseId, engineRun.engineResult);

    await firestoreCaseStore.patchCase(session.caseId, {
      unansweredCriticalQuestions: engineRun.unansweredCriticalQuestions
    });

    await firestoreCaseEventsStore.appendEvent({
      caseId: session.caseId,
      type: "ENGINE_RUN",
      summary: `Engine recommended ${engineRun.engineResult.recommendedDisposition}`,
      actorRole: "system",
      payload: {
        winningClusterId: engineRun.engineResult.winningClusterId,
        redFlags: engineRun.engineResult.triggeredRedFlags,
        dxCandidates: engineRun.engineResult.dxCandidates.slice(0, 5)
      }
    });

    await firestoreRuntimeMetricsStore.logMetric({
      type: "ENGINE_RUN",
      caseId: session.caseId,
      complaintId: refreshed.complaintId,
      disposition: engineRun.engineResult.recommendedDisposition,
      winningClusterId: engineRun.engineResult.winningClusterId,
      engineVersion: engineRun.engineResult.engineVersion
    });

    if (engineRun.completed) {
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
      session.currentQuestionToken = engineRun.nextQuestionToken;
      session.currentQuestionText = engineRun.nextQuestionText;

      session.messages.push({
        id: makeId("msg"),
        role: "assistant",
        text: engineRun.nextQuestionText || "Please continue.",
        createdAt: nowIso(),
        token: engineRun.nextQuestionToken
      });

      await firestoreCaseEventsStore.appendEvent({
        caseId: session.caseId,
        type: "QUESTION_ASKED",
        summary: `Asked ${engineRun.nextQuestionToken}`,
        actorRole: "assistant",
        payload: { token: engineRun.nextQuestionToken, text: engineRun.nextQuestionText }
      });
    }

    this.sessions.set(session.sessionId, session);
    await this.persistSession(session);
    return session;
  }
}

export const chatSessionService = new ChatSessionService();

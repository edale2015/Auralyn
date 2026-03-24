import { getOrCreateChatSession, saveChatSession } from "../channels/chatSessionStore";
import { runPatientFlow } from "../patient/patientFlow";
import { sendPhysicianAlert } from "../alerts/physicianAlertService";
import { auditLog } from "../security/auditLogger";

export interface VoiceChunk {
  text: string;
  isFinal?: boolean;
}

export interface VoiceStreamMeta {
  userId: string;
  channel: "phone" | "web" | "app";
}

export interface VoiceReply {
  text: string;
  escalation?: boolean;
  escalationReason?: string;
  shouldEnd?: boolean;
}

const EMERGENCY_PHRASES = ["chest pain", "can't breathe", "heart attack", "stroke", "not breathing", "overdose"];

function isEmergency(text: string): boolean {
  const t = text.toLowerCase();
  return EMERGENCY_PHRASES.some(p => t.includes(p));
}

export async function* handleVoiceStream(
  stream: AsyncIterable<VoiceChunk>,
  meta: VoiceStreamMeta
): AsyncGenerator<VoiceReply> {
  const session = getOrCreateChatSession("telegram", `voice-${meta.userId}`);
  session.state = "collecting";
  saveChatSession(session);

  auditLog({ actor: "voice_agent", action: "stream_started", entityType: "voice_session", entityId: meta.userId });

  for await (const chunk of stream) {
    const transcript = (chunk.text ?? "").trim();
    if (!transcript) continue;

    if (isEmergency(transcript)) {
      yield {
        text: "This sounds like a medical emergency. Please hang up and call 911 immediately.",
        escalation: true,
        escalationReason: "emergency_911",
        shouldEnd: true,
      };

      await sendPhysicianAlert({
        type: "patient_escalation",
        channel: "telegram",
        patientExternalUserId: meta.userId,
        caseId: `voice-${meta.userId}-${Date.now()}`,
        summary: `Emergency detected in voice intake: "${transcript.slice(0, 100)}"`,
        priority: "immediate",
      });
      return;
    }

    const answerIdx = Object.keys(session.answers).filter(k => k !== "multimodal").length + 1;
    session.answers[`voice_q${answerIdx}`] = transcript;
    saveChatSession(session);

    if (answerIdx < 2) {
      yield { text: "Thank you. Can you tell me more — do you have fever, pain, or other symptoms?" };
      continue;
    }

    let result: Awaited<ReturnType<typeof runPatientFlow>>;
    try {
      result = await runPatientFlow({
        complaint: session.complaint ?? transcript,
        complaints: session.complaint ? [session.complaint] : [transcript],
        text: Object.values(session.answers).filter(v => typeof v === "string").join(" "),
        sessionId: session.sessionId,
      });
    } catch (_) {
      yield { text: "Unable to complete assessment. A physician will review your case.", escalation: true, escalationReason: "system_error" };
      return;
    }

    if (result.status === "emergency_911") {
      yield { text: "Based on your symptoms, please call 911 or go to the emergency room immediately.", escalation: true, escalationReason: "emergency_911", shouldEnd: true };
      return;
    }

    if (result.status === "physician_review" || result.status === "physician_required") {
      yield { text: "Your information has been sent for physician review. You will receive follow-up. If symptoms worsen, seek care immediately.", escalation: true, escalationReason: result.status, shouldEnd: true };
      return;
    }

    const rec = (result as any).plan?.recommendation ?? "supportive care";
    yield { text: `Based on your answers, the recommendation is: ${rec}. If symptoms worsen, please seek care. Goodbye.`, shouldEnd: true };
    return;
  }
}

export async function runSingleTurnVoice(transcript: string, userId: string): Promise<VoiceReply> {
  const iter = handleVoiceStream(
    (async function* () { yield { text: transcript, isFinal: true }; yield { text: "", isFinal: true }; })(),
    { userId, channel: "phone" }
  );
  const first = await iter.next();
  return first.value ?? { text: "Unable to process. Goodbye.", shouldEnd: true };
}

import { runPatientFlow } from "../patient/patientFlow";
import { routeCall, handleConversation, endCall } from "./callCenter";
import { auditLog } from "../security/auditLogger";
import { startSession, appendTranscript, setSessionResult, endSession } from "./voiceSessionStore";

const EMERGENCY_PHRASES = [
  "chest pain", "chest pressure", "can't breathe", "cannot breathe",
  "trouble breathing", "difficulty breathing", "heart attack", "stroke",
  "unconscious", "not breathing", "choking", "severe bleeding",
  "stroke", "overdose", "suicidal",
];

const EMERGENCY_TTS = "This sounds like a medical emergency. Please hang up immediately and call 911 or go to your nearest emergency room. Do not wait.";

export function detectEmergency(text: string): boolean {
  const lower = text.toLowerCase();
  return EMERGENCY_PHRASES.some(p => lower.includes(p));
}

export function buildSay(text: string): string {
  return text.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] ?? c));
}

export async function processVoiceInput(
  callSid: string,
  speechResult: string
): Promise<{ twiml: string; shouldEnd: boolean }> {
  const safe = (speechResult ?? "").trim();

  auditLog({ actor: "voice_triage", action: "speech_received", entityType: "call", entityId: callSid, details: { length: safe.length } });
  appendTranscript(callSid, safe, "patient");

  if (!safe) {
    return {
      twiml: `<Response>
  <Gather input="speech" action="/api/voice/process" method="POST" timeout="5" speechTimeout="2">
    <Say>I didn't catch that. Please describe your symptoms.</Say>
  </Gather>
  <Say>We didn't receive a response. Goodbye.</Say>
</Response>`,
      shouldEnd: false,
    };
  }

  if (detectEmergency(safe)) {
    auditLog({ actor: "voice_triage", action: "emergency_detected", entityType: "call", entityId: callSid });
    appendTranscript(callSid, EMERGENCY_TTS, "ai");
    endCall(callSid);
    endSession(callSid, "emergency");
    return {
      twiml: `<Response><Say>${buildSay(EMERGENCY_TTS)}</Say><Hangup /></Response>`,
      shouldEnd: true,
    };
  }

  routeCall(callSid, safe);

  const conv = handleConversation(callSid, safe);

  let clinicalResponse = conv.response;
  try {
    const result = await runPatientFlow({
      complaint: safe,
      complaints: [safe],
      text: safe,
    });

    if (result.status === "emergency_911") {
      endCall(callSid);
      endSession(callSid, "emergency");
      return {
        twiml: `<Response><Say>${buildSay(EMERGENCY_TTS)}</Say><Hangup /></Response>`,
        shouldEnd: true,
      };
    }

    setSessionResult(callSid, result);
    if (result.status === "physician_review" || result.status === "physician_required") {
      clinicalResponse = "Thank you. A physician will review your case shortly. You will receive a follow-up. If symptoms worsen, seek care immediately.";
    } else if (result.status === "self_service_complete") {
      const rec = (result as any).plan?.recommendation ?? "supportive care and rest";
      clinicalResponse = `Based on your answers, the recommendation is: ${rec}. If your symptoms worsen, please call back or seek care.`;
    }
  } catch (_) {}

  if (!conv.continue) {
    appendTranscript(callSid, clinicalResponse, "ai");
    endCall(callSid);
    endSession(callSid, "completed");
    return {
      twiml: `<Response><Say>${buildSay(clinicalResponse)}</Say><Hangup /></Response>`,
      shouldEnd: true,
    };
  }
  appendTranscript(callSid, clinicalResponse, "ai");

  return {
    twiml: `<Response>
  <Say>${buildSay(clinicalResponse)}</Say>
  <Gather input="speech" action="/api/voice/process" method="POST" timeout="5" speechTimeout="2">
    <Say>Is there anything else you want to add about your symptoms?</Say>
  </Gather>
  <Say>Thank you. Goodbye.</Say>
  <Hangup />
</Response>`,
    shouldEnd: false,
  };
}

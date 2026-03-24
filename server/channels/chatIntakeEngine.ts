import { getOrCreateChatSession, saveChatSession } from "./chatSessionStore";
import type { IncomingPatientMessage, ChatIntakeReply } from "./types";
import { runPatientFlow } from "../patient/patientFlow";
import { processInput } from "../multimodal/multimodalEngine";

const SUPPORTED_COMPLAINTS = ["sore_throat", "cough", "uri", "rash", "uti_simple", "ear_pain", "headache_mild"];

function parseComplaint(text?: string): string | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (t.includes("throat") || t.includes("sore")) return "sore_throat";
  if (t.includes("cough")) return "cough";
  if (t.includes("uti") || t.includes("burning") || t.includes("urination")) return "uti_simple";
  if (t.includes("rash") || t.includes("skin")) return "rash";
  if (t.includes("ear")) return "ear_pain";
  if (t.includes("headache") || t.includes("head ache")) return "headache_mild";
  if (t.includes("cold") || t.includes("uri") || t.includes("congestion")) return "uri";
  return undefined;
}

function firstQuestion(complaint: string): string {
  const map: Record<string, string> = {
    sore_throat: "How many days have you had the sore throat?\n\nAlso: do you have fever, cough, or swollen neck glands?\n\n(Reply 1 = Yes fever / 2 = No fever / or describe in your own words)",
    cough: "How long have you had the cough? Any fever, shortness of breath, or chest pain?\n\n(1 = Yes fever/SOB / 2 = No / or describe)",
    rash: "When did the rash start? Is it painful, itchy, or spreading?\n\nYou may also send a photo of the affected area.",
    uti_simple: "Do you have burning with urination, urgency, frequency, or fever?\n\n(1 = Yes / 2 = No / or describe)",
    ear_pain: "Which ear is painful? Is there discharge, hearing loss, or fever?\n\n(1 = Yes fever / 2 = No fever)",
    headache_mild: "How long have you had the headache? Any vision changes, neck stiffness, or vomiting?\n\n(1 = Yes / 2 = No)",
    uri: "How many days have you been congested? Any fever, sore throat, or ear pain?\n\n(1 = Yes fever / 2 = No fever)",
  };
  return map[complaint] ?? "Please describe your symptoms in 1–2 sentences.";
}

function followUpQuestion(session: any): string {
  const complaint = session.complaint;
  const map: Record<string, string> = {
    sore_throat: "Do you have white spots on your tonsils, tender neck nodes, or difficulty swallowing?\n\n(1 = Yes / 2 = No / 3 = Not sure)",
    cough: "Any history of asthma, COPD, or pneumonia? Any wheezing?\n\n(1 = Yes / 2 = No)",
    rash: "Is there fever, facial swelling, mouth sores, or trouble breathing?\n\n(1 = Yes to any / 2 = No)",
    uti_simple: "Any pregnancy, back/flank pain, blood in urine, or fever?\n\n(1 = Yes to any / 2 = No)",
    ear_pain: "Did you have a recent cold, swim, or fly recently? Any dizziness?\n\n(1 = Yes / 2 = No)",
    headache_mild: "Is this your worst-ever headache, or sudden-onset? Any weakness or numbness?\n\n(1 = Yes / 2 = No)",
    uri: "Any ear pain, facial pressure, or worsening after 5 days?\n\n(1 = Yes / 2 = No)",
  };
  return map[complaint] ?? "Anything else important about your symptoms?";
}

function safetyFooter(): string {
  return "\n\n⚠️ If you develop chest pain, trouble breathing, confusion, or feel severely unwell — seek emergency care immediately or call 911.";
}

function formatPlan(result: any): string {
  const rec = result?.plan?.recommendation ?? result?.plan?.decision ?? "supportive care and rest";
  return `Based on your answers, the recommended next step is: ${rec}.\n\nPlease follow up if symptoms worsen or persist beyond 5 days.${safetyFooter()}`;
}

export async function handleChatIntake(msg: IncomingPatientMessage): Promise<ChatIntakeReply> {
  const session = getOrCreateChatSession(msg.channel, msg.externalUserId);
  const text = (msg.text ?? "").trim();

  let multimodalContext: any = undefined;

  if (msg.imageUrl || msg.audioUrl) {
    try {
      const mm = await processInput({ text: msg.text, image: msg.imageUrl, audio: msg.audioUrl });
      multimodalContext = mm;
      session.answers.multimodal = mm;
      saveChatSession(session);
    } catch (_) {}
  }

  if (msg.imageUrl && !msg.text) {
    if (session.state === "collecting") {
      return { text: "📸 Image received. Analyzing now.\n\n" + followUpQuestion(session) };
    }
    return { text: "📸 Image received. Please also describe your main problem in a few words." };
  }

  if (msg.audioUrl && !msg.text) {
    return { text: "🎙️ Audio received. Processing breathing/cough pattern.\n\nPlease also describe your symptoms in a few words." };
  }

  if (session.state === "awaiting_consent") {
    if (/^yes\b/i.test(text) || /i agree/i.test(text) || text === "1") {
      session.state = "intake_ready";
      saveChatSession(session);
      return {
        text: "✅ Consent received.\n\nPlease briefly describe your main problem:\n\n• Sore throat\n• Cough\n• Rash\n• Ear pain\n• Burning urination\n• Congestion/cold\n• Headache\n\nOr type it in your own words.",
      };
    }
    return {
      text: "👋 Welcome to the clinical intake assistant.\n\nThis tool collects information for physician review. Your answers may be escalated to a licensed physician.\n\n⚠️ This is NOT for emergencies. If you have chest pain, severe breathing difficulty, or think you are having a medical emergency — call 911 now.\n\nIf you agree to proceed, reply YES.",
    };
  }

  if (session.state === "intake_ready") {
    const complaint = parseComplaint(text);
    if (!complaint || !SUPPORTED_COMPLAINTS.includes(complaint)) {
      saveChatSession(session);
      return {
        text: "That concern requires direct physician review rather than self-service chat. A physician review request has been created.\n\nIf this is urgent or severe, seek immediate care."+safetyFooter(),
        escalate: true,
        escalationReason: "out_of_scope_chat_complaint",
      };
    }
    session.complaint = complaint;
    session.state = "collecting";
    saveChatSession(session);
    return { text: firstQuestion(complaint) };
  }

  if (session.state === "collecting") {
    const idx = Object.keys(session.answers).filter(k => k !== "multimodal").length + 1;
    session.answers[`q${idx}`] = text;
    saveChatSession(session);

    const dataAnswers = Object.keys(session.answers).filter(k => k !== "multimodal").length;
    if (dataAnswers < 2) {
      return { text: followUpQuestion(session) };
    }

    let result: any;
    try {
      result = await runPatientFlow({
        complaint: session.complaint,
        complaints: session.complaint ? [session.complaint] : [],
        text: Object.values(session.answers).filter(v => typeof v === "string").join(" "),
        sessionId: session.sessionId,
      });
    } catch (err: any) {
      return {
        text: "Unable to complete assessment. A physician review request has been created."+safetyFooter(),
        escalate: true,
        escalationReason: "system_error",
      };
    }

    if (result.status === "physician_review" || result.status === "physician_required") {
      session.state = "physician_review";
      saveChatSession(session);
      return {
        text: "Your information has been sent for physician review. You will receive follow-up instructions shortly."+safetyFooter(),
        escalate: true,
        escalationReason: result.status,
        result,
      };
    }

    if (result.status === "emergency_911") {
      session.state = "physician_review";
      saveChatSession(session);
      return {
        text: "🚨 EMERGENCY: Based on your symptoms, please call 911 or go to the nearest emergency room immediately. Do not wait.",
        escalate: true,
        escalationReason: "emergency_911",
        result,
      };
    }

    session.state = "intake_ready";
    session.answers = {};
    saveChatSession(session);
    return { text: formatPlan(result), result };
  }

  return {
    text: "Your case is queued for physician review. Please wait for follow-up."+safetyFooter(),
  };
}

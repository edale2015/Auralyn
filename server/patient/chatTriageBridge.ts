import { runFinalPipeline } from "../clinical/finalPipeline";

let _openai: any = null;
function getOpenAI() {
  if (!_openai) {
    const { default: OpenAI } = require("openai");
    _openai = new OpenAI();
  }
  return _openai;
}

export interface ChatTriageResult {
  reply: string;
  disposition: string;
  complaint: string;
}

export async function patientChatTriage(text: string): Promise<ChatTriageResult> {
  const openai = getOpenAI();

  const llmRes = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a compassionate medical triage assistant. Collect symptoms concisely, stay safe. Always recommend emergency services for life-threatening complaints." },
      { role: "user", content: text },
    ],
    max_tokens: 300,
  });

  const reply: string = llmRes.choices[0]?.message?.content
    ?? "I cannot respond right now. Call 911 if this is an emergency.";

  const triage = runFinalPipeline({
    patientId: "mobile-chat",
    freeText: text,
  });

  return {
    reply,
    disposition: triage.safetyDisposition,
    complaint: text,
  };
}

const followupTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleFollowup(patientId: string, minutes: number): void {
  if (followupTimers.has(patientId)) {
    clearTimeout(followupTimers.get(patientId)!);
  }
  const t = setTimeout(() => {
    console.log(`[FollowUp] 📱 Follow-up ping for patient ${patientId}`);
    followupTimers.delete(patientId);
  }, minutes * 60 * 1000);
  followupTimers.set(patientId, t);
  console.log(`[FollowUp] Scheduled follow-up for ${patientId} in ${minutes} min`);
}

export function cancelFollowup(patientId: string): boolean {
  const t = followupTimers.get(patientId);
  if (t) {
    clearTimeout(t);
    followupTimers.delete(patientId);
    return true;
  }
  return false;
}

export function getPendingFollowups(): string[] {
  return [...followupTimers.keys()];
}

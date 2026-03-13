import { ClinicalState } from "../state/clinicalStateStore";

const MAX_WHATSAPP_CHARS = 1600;
const MAX_TELEGRAM_CHARS = 4096;

export type Channel = "whatsapp" | "telegram" | "sms";

export interface FormattedMessage {
  text: string;
  chunks: string[];
  channel: Channel;
  characterCount: number;
}

const DISPOSITION_MESSAGES: Record<string, { header: string; cta: string; emoji: string }> = {
  er_now: {
    emoji: "🚨",
    header: "URGENT — EMERGENCY ROOM NOW",
    cta: "Please call 911 or go to the nearest Emergency Room immediately. Do not drive yourself.",
  },
  urgent_care: {
    emoji: "⚡",
    header: "Please visit Urgent Care",
    cta: "Please visit an Urgent Care clinic within the next 2-4 hours. Bring this summary.",
  },
  routine: {
    emoji: "📋",
    header: "Schedule a Doctor's Appointment",
    cta: "Please contact your primary care doctor within 2-3 days for follow-up.",
  },
  home_care: {
    emoji: "🏠",
    header: "Home Care Recommended",
    cta: "You may care for yourself at home. Rest, stay hydrated, and monitor symptoms.",
  },
  need_more_info: {
    emoji: "❓",
    header: "More Information Needed",
    cta: "Please answer the question above so we can give you a more accurate recommendation.",
  },
  uncertain: {
    emoji: "🤔",
    header: "Unable to Determine",
    cta: "Your symptoms require evaluation by a healthcare provider.",
  },
};

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxLen;
    if (end < text.length) {
      const lastNewline = text.lastIndexOf("\n", end);
      if (lastNewline > start + maxLen * 0.5) end = lastNewline;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

export function formatTriageResult(state: ClinicalState, channel: Channel): FormattedMessage {
  const disp = state.disposition ?? "uncertain";
  const dispInfo = DISPOSITION_MESSAGES[disp] ?? DISPOSITION_MESSAGES.uncertain;
  const maxChars = channel === "sms" ? 160 : channel === "whatsapp" ? MAX_WHATSAPP_CHARS : MAX_TELEGRAM_CHARS;

  const useMd = channel === "telegram";
  const b = (t: string) => useMd ? `*${t}*` : t;
  const line = () => useMd ? "─────────────────" : "---";

  const lines: string[] = [];
  lines.push(`${dispInfo.emoji} ${b(dispInfo.header)}`);
  lines.push(line());

  if (state.complaint) {
    lines.push(`${b("Complaint:")} ${state.complaint.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}`);
  }

  if (state.hybridResult?.topDiagnosis) {
    lines.push(`${b("Likely cause:")} ${state.hybridResult.topDiagnosis.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}`);
    lines.push(`${b("Confidence:")} ${Math.round(state.hybridResult.confidence * 100)}%`);
  }

  if (state.hybridResult?.triggered_flags?.length) {
    lines.push(`\n⚠️ ${b("Red flags detected:")}`);
    for (const f of state.hybridResult.triggered_flags) {
      lines.push(`  • ${f.replace(/_/g, " ")}`);
    }
  }

  if (state.hybridResult?.explanation && channel !== "sms") {
    lines.push(`\n${b("Clinical reasoning:")}`);
    lines.push(state.hybridResult.explanation.slice(0, 200));
  }

  if (state.followUpQuestions?.length && disp === "need_more_info") {
    lines.push(`\n${b("Please answer:")}`);
    lines.push(state.followUpQuestions[state.followUpQuestions.length - 1]);
  }

  lines.push(line());
  lines.push(dispInfo.cta);

  if (channel !== "sms") {
    lines.push(`\n${b("Return to care if you develop:")}`);
    lines.push(`• Chest pain or severe difficulty breathing`);
    lines.push(`• High fever (>39°C / 102°F)`);
    lines.push(`• Confusion or cannot be woken`);
    lines.push(`• Severe worsening of any symptom`);
  }

  const text = lines.join("\n");
  const chunks = chunkText(text, maxChars);

  return { text, chunks, channel, characterCount: text.length };
}

export function formatFollowUpQuestion(question: string, channel: Channel): FormattedMessage {
  const useMd = channel === "telegram";
  const b = (t: string) => useMd ? `*${t}*` : t;

  const text = [
    `${b("To give you a more accurate recommendation:")}`,
    ``,
    question,
    ``,
    `Please reply with your answer.`,
  ].join("\n");

  return { text, chunks: [text], channel, characterCount: text.length };
}

export function formatExtractionBlock(reason: string, nextQuestion: string, channel: Channel): FormattedMessage {
  const useMd = channel === "telegram";
  const b = (t: string) => useMd ? `*${t}*` : t;

  const text = [
    `${b("I need a bit more information to help you:")}`,
    ``,
    reason ? reason : "Could you tell me more about your symptoms?",
    ``,
    nextQuestion,
  ].join("\n");

  return { text, chunks: [text], channel, characterCount: text.length };
}

export function formatWelcomeMessage(channel: Channel): FormattedMessage {
  const useMd = channel === "telegram";
  const b = (t: string) => useMd ? `*${t}*` : t;

  const text = [
    `👋 ${b("Welcome to MedTriage AI")}`,
    ``,
    `I'm a medical triage assistant. I'll help assess your symptoms and recommend the right level of care.`,
    ``,
    `${b("Please describe:")}`,
    `• What symptoms are you experiencing?`,
    `• How long have you had them?`,
    `• Any relevant medical history?`,
    ``,
    `I'll analyze your symptoms and provide a care recommendation.`,
    ``,
    `⚠️ ${b("This is not a substitute for emergency care.")} If you are in immediate danger, call 911.`,
  ].join("\n");

  return { text, chunks: [text], channel, characterCount: text.length };
}

export function formatRedFlagAlert(flags: string[], channel: Channel): FormattedMessage {
  const useMd = channel === "telegram";
  const b = (t: string) => useMd ? `*${t}*` : t;

  const text = [
    `🚨 ${b("IMPORTANT SAFETY ALERT")}`,
    ``,
    `Based on your symptoms, you need emergency care immediately:`,
    ``,
    ...flags.map(f => `• ${f.replace(/_/g, " ")}`),
    ``,
    `${b("Please call 911 or go to the Emergency Room NOW.")}`,
    `Do not wait. Do not drive yourself.`,
  ].join("\n");

  return { text, chunks: [text], channel, characterCount: text.length };
}

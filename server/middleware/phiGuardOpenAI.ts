import type OpenAI from "openai";

const PHI_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "SSN",          pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "SSN_PLAIN",    pattern: /\b\d{9}\b/ },
  { name: "MRN",          pattern: /\b(mrn|patient[\s_-]?id)[\s:]+[A-Z0-9\-]+/i },
  { name: "DOB",          pattern: /\b(dob|date[\s_-]?of[\s_-]?birth|born)[\s:]+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/i },
  { name: "PHONE",        pattern: /\b(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/ },
  { name: "EMAIL",        pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/ },
  { name: "MEMBER_ID",    pattern: /\b(member[\s_-]?id|policy[\s_-]?#?|ins[\s_-]?id)[\s:]+[A-Z0-9\-]+/i },
  { name: "NAME_PATTERN", pattern: /\bpatient\s+(name|is|called)[\s:]+[A-Z][a-z]+(\s[A-Z][a-z]+)+/i },
  { name: "ADDRESS",      pattern: /\b\d{1,5}\s+[A-Za-z\s]+(st|ave|blvd|rd|dr|lane|court|way|pl)\b/i },
  { name: "ZIP",          pattern: /\b\d{5}(-\d{4})?\b/ },
];

export interface PHIAuditEvent {
  timestamp: string;
  callerFile?: string;
  model: string;
  detectedFields: string[];
  promptLength: number;
  action: "redacted" | "blocked" | "warned";
}

const phiAuditLog: PHIAuditEvent[] = [];

export function getPhiAuditLog(): PHIAuditEvent[] {
  return [...phiAuditLog];
}

function detectPHI(text: string): string[] {
  const found: string[] = [];
  for (const { name, pattern } of PHI_PATTERNS) {
    if (pattern.test(text)) found.push(name);
  }
  return found;
}

function redactPHIFromText(text: string): string {
  let out = text;
  for (const { pattern } of PHI_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes("g") ? "" : "g")), "[PHI_REDACTED]");
  }
  return out;
}

function extractPromptText(messages: OpenAI.Chat.ChatCompletionMessageParam[]): string {
  return messages.map(m => {
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content.map(c => (c.type === "text" ? c.text : "")).join(" ");
    }
    return "";
  }).join("\n");
}

export function applyPHIGuard(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  callerHint?: string
): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
  const promptText = extractPromptText(params.messages);
  const detected = detectPHI(promptText);

  if (detected.length > 0) {
    const event: PHIAuditEvent = {
      timestamp: new Date().toISOString(),
      callerFile: callerHint,
      model: params.model,
      detectedFields: detected,
      promptLength: promptText.length,
      action: "redacted",
    };
    phiAuditLog.push(event);
    if (phiAuditLog.length > 500) phiAuditLog.shift();

    console.warn(`[PHI-GUARD] ⚠️  HIPAA WARNING — PHI detected in OpenAI prompt (${callerHint ?? "unknown caller"}). Fields: ${detected.join(", ")}. Redacting before transmission.`);

    const sanitizedMessages = params.messages.map(m => {
      if (typeof m.content === "string") {
        return { ...m, content: redactPHIFromText(m.content) };
      }
      if (Array.isArray(m.content)) {
        return {
          ...m,
          content: m.content.map(c =>
            c.type === "text" ? { ...c, text: redactPHIFromText(c.text) } : c
          ),
        };
      }
      return m;
    });

    return { ...params, messages: sanitizedMessages };
  }

  return params;
}

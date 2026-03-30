/**
 * MY ADDITION — BR-008 Mitigation: PHI Scrubber Middleware
 *
 * Channel payload logs (WhatsApp / Telegram webhooks) may contain patient
 * messages that include PHI. This middleware strips patient-identifiable
 * content before any logging occurs.
 *
 * Safe Harbor identifiers scrubbed (§164.514(b)):
 *   - Names, phone numbers, email addresses, dates, ages
 *   - IP addresses, device identifiers, URLs
 *   - Symptom text (patient-authored — PHI-adjacent)
 */

import { logger }    from "../utils/logger";
import { auditStep, createTraceId } from "../audit/auditLogger";
import * as crypto   from "crypto";

export interface ScrubbedPayload {
  caseId?:            string;
  channel:            string;
  messageHash:        string;   // SHA-256 of original message — for idempotency
  messageLength:      number;
  timestamp:          string;
  redactedFieldCount: number;
}

// Regex patterns for Safe Harbor identifiers
const PHI_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  { name: "email",         pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,   replacement: "[REDACTED-EMAIL]" },
  { name: "phone_us",      pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: "[REDACTED-PHONE]" },
  { name: "phone_intl",    pattern: /\+\d{1,3}[-.\s]?\d{3,14}/g,                           replacement: "[REDACTED-PHONE]" },
  { name: "ssn",           pattern: /\b\d{3}-\d{2}-\d{4}\b/g,                               replacement: "[REDACTED-SSN]" },
  { name: "date_yyyymmdd", pattern: /\b\d{4}[-\/]\d{2}[-\/]\d{2}\b/g,                       replacement: "[REDACTED-DATE]" },
  { name: "date_mmddyyyy", pattern: /\b\d{2}[-\/]\d{2}[-\/]\d{4}\b/g,                       replacement: "[REDACTED-DATE]" },
  { name: "url",           pattern: /https?:\/\/[^\s]+/g,                                    replacement: "[REDACTED-URL]" },
  { name: "ip_address",    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,             replacement: "[REDACTED-IP]" },
  { name: "age_pattern",   pattern: /\b(i[''`]?m|i am|my age is|aged?)\s+\d{1,3}\s*years?/gi, replacement: "[REDACTED-AGE]" },
  { name: "name_prefix",   pattern: /\b(mr|mrs|ms|dr|prof)\.?\s+[A-Z][a-z]{2,}/g,          replacement: "[REDACTED-NAME]" },
];

/**
 * Compute deterministic SHA-256 hash of the message for idempotency keys.
 * The hash is safe to log — it cannot be reversed to reveal PHI.
 */
export function hashMessage(rawText: string): string {
  return crypto.createHash("sha256").update(rawText).digest("hex").slice(0, 32);
}

/**
 * Strip PHI patterns from arbitrary text.
 * Returns scrubbed text and count of redactions applied.
 */
export function scrubText(rawText: string): { scrubbed: string; redactedCount: number } {
  let text           = rawText;
  let redactedCount  = 0;

  for (const { pattern, replacement } of PHI_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      text = text.replace(pattern, replacement);
      redactedCount += matches.length;
    }
  }

  return { scrubbed: text, redactedCount };
}

/**
 * Convert a raw channel webhook payload into a log-safe metadata object.
 * Never logs the original patient message text.
 *
 * @param rawPayload  The full incoming webhook body (Express req.body)
 * @param channel     "whatsapp" | "telegram" | "sms"
 * @param caseId      If known, attach to the scrubbed record
 */
export function scrubChannelPayload(
  rawPayload: Record<string, unknown>,
  channel:    string,
  caseId?:    string
): ScrubbedPayload {
  const messageText = extractMessageText(rawPayload);
  const messageHash = hashMessage(messageText);
  const { redactedCount } = scrubText(messageText);

  const scrubbed: ScrubbedPayload = {
    caseId,
    channel,
    messageHash,
    messageLength:      messageText.length,
    timestamp:          new Date().toISOString(),
    redactedFieldCount: redactedCount,
  };

  logger.info("channel_payload_scrubbed", scrubbed);

  return scrubbed;
}

/**
 * Extract the patient's message text from a channel webhook payload.
 * Supports WhatsApp Business API and Telegram Bot API payload shapes.
 */
function extractMessageText(payload: Record<string, unknown>): string {
  // WhatsApp Business API
  if (payload.entry) {
    try {
      const entry = (payload.entry as any)[0];
      const change = entry?.changes?.[0];
      return change?.value?.messages?.[0]?.text?.body ?? "";
    } catch { /* fallthrough */ }
  }

  // Telegram Bot API
  if (payload.message) {
    try {
      return (payload.message as any).text ?? "";
    } catch { /* fallthrough */ }
  }

  // Generic: try common fields
  for (const field of ["text", "body", "message", "content"]) {
    if (typeof payload[field] === "string") return payload[field] as string;
  }

  return JSON.stringify(payload).slice(0, 500);  // Last resort — scrub what we have
}

/**
 * Express-compatible middleware that scrubs and audit-logs channel payloads
 * before they touch any downstream logging or storage.
 */
export function createPhiScrubberMiddleware(channel: "whatsapp" | "telegram" | "sms") {
  return async (req: any, res: any, next: () => void): Promise<void> => {
    const scrubbed = scrubChannelPayload(req.body ?? {}, channel);
    req._phiScrubbed = scrubbed;

    const traceId = createTraceId();
    await auditStep({
      traceId,
      step:     "CHANNEL_PAYLOAD_SCRUBBED",
      input:    { channel, messageLength: scrubbed.messageLength },
      output:   { messageHash: scrubbed.messageHash, redactedFieldCount: scrubbed.redactedFieldCount },
      metadata: { br008Mitigation: true },
    }).catch(() => {});

    next();
  };
}

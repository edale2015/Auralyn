import { channelConfig } from "./channelConfig";
import { withRetry } from "../utils/withRetry";
import { logger } from "../utils/logger";

const WA_GRAPH_API = "https://graph.facebook.com/v20.0";

const PHI_PATTERNS_OUT = [
  { p: /\b\d{3}-\d{2}-\d{4}\b/g, tag: "SSN" },
  { p: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, tag: "EMAIL" },
  { p: /\b(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g, tag: "PHONE" },
  { p: /\b\d{9}\b/g, tag: "SSN_PLAIN" },
];

function guardOutboundPHI(text: string): { sanitized: string; phiFound: boolean } {
  let sanitized = text;
  let phiFound = false;
  for (const { p } of PHI_PATTERNS_OUT) {
    if (p.test(sanitized)) {
      phiFound = true;
      sanitized = sanitized.replace(new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g"), "[REDACTED]");
    }
    p.lastIndex = 0;
  }
  return { sanitized, phiFound };
}

const _perNumberLastSent = new Map<string, number[]>();
const RATE_LIMIT_MAX_PER_MIN = 5;

function checkRateLimit(to: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const hits = (_perNumberLastSent.get(to) ?? []).filter(t => now - t < window);
  if (hits.length >= RATE_LIMIT_MAX_PER_MIN) return false;
  hits.push(now);
  _perNumberLastSent.set(to, hits);
  return true;
}

const _sendAuditLog: Array<{
  ts: string;
  to: string;
  type: "text" | "template";
  ok: boolean;
  phiFound: boolean;
  rateLimited: boolean;
  error?: string;
}> = [];

export function getWhatsAppSendAuditLog() {
  return [..._sendAuditLog];
}

function auditSend(entry: (typeof _sendAuditLog)[number]) {
  _sendAuditLog.push(entry);
  if (_sendAuditLog.length > 500) _sendAuditLog.shift();
}

export async function sendWhatsAppMetaMessage(to: string, text: string): Promise<any> {
  const { phoneNumberId, accessToken } = channelConfig.whatsapp;

  if (!phoneNumberId || !accessToken) {
    logger.warn("whatsapp_not_configured", { to });
    auditSend({ ts: new Date().toISOString(), to, type: "text", ok: false, phiFound: false, rateLimited: false, error: "not_configured" });
    return { ok: false, reason: "not_configured" };
  }

  if (!checkRateLimit(to)) {
    logger.warn("whatsapp_rate_limited", { to });
    auditSend({ ts: new Date().toISOString(), to, type: "text", ok: false, phiFound: false, rateLimited: true, error: "rate_limited" });
    return { ok: false, reason: "rate_limited" };
  }

  const { sanitized, phiFound } = guardOutboundPHI(text);
  if (phiFound) {
    logger.warn("whatsapp_outbound_phi_redacted", { to });
  }

  const url = `${WA_GRAPH_API}/${phoneNumberId}/messages`;

  try {
    const result = await withRetry(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: sanitized },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        const retryable = res.status === 429 || res.status >= 500;
        const err = new Error(`WhatsApp Meta send failed: ${res.status} ${body}`);
        if (!retryable) Object.assign(err, { __noRetry: true });
        throw err;
      }

      return res.json();
    }, 3, 1000);

    auditSend({ ts: new Date().toISOString(), to, type: "text", ok: true, phiFound, rateLimited: false });
    return result;
  } catch (err: any) {
    const error = err?.message ?? "unknown";
    auditSend({ ts: new Date().toISOString(), to, type: "text", ok: false, phiFound, rateLimited: false, error });
    logger.error("whatsapp_send_failed", { to, error });
    throw err;
  }
}

export async function sendWhatsAppTemplateMessage(to: string, templateName: string, languageCode = "en_US"): Promise<any> {
  const { phoneNumberId, accessToken } = channelConfig.whatsapp;
  if (!phoneNumberId || !accessToken) {
    auditSend({ ts: new Date().toISOString(), to, type: "template", ok: false, phiFound: false, rateLimited: false, error: "not_configured" });
    return { ok: false, reason: "not_configured" };
  }

  if (!checkRateLimit(to)) {
    auditSend({ ts: new Date().toISOString(), to, type: "template", ok: false, phiFound: false, rateLimited: true, error: "rate_limited" });
    return { ok: false, reason: "rate_limited" };
  }

  const url = `${WA_GRAPH_API}/${phoneNumberId}/messages`;

  try {
    const result = await withRetry(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: templateName, language: { code: languageCode } },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        const retryable = res.status === 429 || res.status >= 500;
        const err = new Error(`WhatsApp template send failed: ${res.status} ${body}`);
        if (!retryable) Object.assign(err, { __noRetry: true });
        throw err;
      }

      return res.json();
    }, 3, 1000);

    auditSend({ ts: new Date().toISOString(), to, type: "template", ok: true, phiFound: false, rateLimited: false });
    return result;
  } catch (err: any) {
    const error = err?.message ?? "unknown";
    auditSend({ ts: new Date().toISOString(), to, type: "template", ok: false, phiFound: false, rateLimited: false, error });
    logger.error("whatsapp_template_send_failed", { to, templateName, error });
    throw err;
  }
}

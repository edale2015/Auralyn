import twilio from "twilio";
import { withRetry } from "../utils/withRetry";
import { twilioBreaker } from "../utils/circuitBreaker";
import { logger } from "../utils/logger";

const PHI_PATTERNS_WA = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  /\b(mrn|patient[\s_-]?id)[\s:]+[A-Z0-9\-]+/ig,
];

function redactPHI(text: string): { text: string; phiFound: boolean } {
  let out = text;
  let phiFound = false;
  for (const p of PHI_PATTERNS_WA) {
    if (p.test(out)) {
      phiFound = true;
      out = out.replace(new RegExp(p.source, "gi"), "[REDACTED]");
    }
    p.lastIndex = 0;
  }
  return { text: out, phiFound };
}

const _dedupeCache = new Map<string, number>();
const DEDUPE_TTL_MS = 60_000;

function isDuplicate(sid: string): boolean {
  const now = Date.now();
  const seen = _dedupeCache.get(sid);
  if (seen && now - seen < DEDUPE_TTL_MS) return true;
  _dedupeCache.set(sid, now);
  if (_dedupeCache.size > 1000) {
    for (const [k, v] of _dedupeCache.entries()) {
      if (now - v > DEDUPE_TTL_MS) _dedupeCache.delete(k);
    }
  }
  return false;
}

async function upstashCheckDedupe(sid: string): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return isDuplicate(sid);
  const key = `wa:msgsid:${sid}`;
  try {
    const setRes = await fetch(`${url}/set/${encodeURIComponent(key)}/1/EX/300/NX`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await setRes.json()) as { result: string | null };
    return json.result === null;
  } catch {
    return isDuplicate(sid);
  }
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeWhatsAppTo(to: string): string {
  let t = String(to || "").trim();
  if (!t) throw new Error("Missing 'to' phone number");
  if (t.startsWith("whatsapp:")) t = t.replace("whatsapp:", "").trim();
  if (!t.startsWith("+")) t = "+" + t;
  return "whatsapp:" + t;
}

let _twilioClient: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  if (_twilioClient) return _twilioClient;
  const accountSid = envOrThrow("TWILIO_ACCOUNT_SID");
  const authToken = envOrThrow("TWILIO_AUTH_TOKEN");
  _twilioClient = twilio(accountSid, authToken);
  return _twilioClient;
}

const _sendAuditLog: Array<{
  ts: string;
  to: string;
  bodyLen: number;
  ok: boolean;
  phiFound: boolean;
  duplicate: boolean;
  retries: number;
  sid?: string;
  error?: string;
}> = [];

export function getTwilioWASendAuditLog() {
  return [..._sendAuditLog];
}

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  opts?: { incomingSid?: string }
): Promise<void> {
  const formattedTo = normalizeWhatsAppTo(to);
  const { text: sanitized, phiFound } = redactPHI(String(body ?? "").trim());
  if (!sanitized) throw new Error("Missing message body");

  if (phiFound) {
    logger.warn("twilio_whatsapp_outbound_phi_redacted", { to });
  }

  if (opts?.incomingSid) {
    const dup = await upstashCheckDedupe(opts.incomingSid);
    if (dup) {
      logger.warn("twilio_whatsapp_duplicate_blocked", { sid: opts.incomingSid, to });
      _sendAuditLog.push({
        ts: new Date().toISOString(), to: formattedTo, bodyLen: body.length,
        ok: false, phiFound, duplicate: true, retries: 0, error: "duplicate",
      });
      if (_sendAuditLog.length > 500) _sendAuditLog.shift();
      return;
    }
  }

  const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";
  let attempts = 0;
  let messageSid: string | undefined;

  try {
    const result = await twilioBreaker.call(async () =>
      withRetry(async () => {
        attempts++;
        const msg = await getTwilioClient().messages.create({
          from: fromWhatsApp,
          to: formattedTo,
          body: sanitized,
        });
        messageSid = msg.sid;
        return msg;
      }, 3, 1000)
    );

    _sendAuditLog.push({
      ts: new Date().toISOString(), to: formattedTo, bodyLen: body.length,
      ok: true, phiFound, duplicate: false, retries: attempts - 1, sid: messageSid,
    });
    if (_sendAuditLog.length > 500) _sendAuditLog.shift();

    logger.info("twilio_whatsapp_sent", { to: formattedTo, sid: messageSid, retries: attempts - 1 });
  } catch (err: any) {
    const error = err?.message ?? "unknown";
    _sendAuditLog.push({
      ts: new Date().toISOString(), to: formattedTo, bodyLen: body.length,
      ok: false, phiFound, duplicate: false, retries: attempts - 1, error,
    });
    if (_sendAuditLog.length > 500) _sendAuditLog.shift();

    logger.error("twilio_whatsapp_send_failed", { to: formattedTo, retries: attempts - 1, error });
    throw err;
  }
}

import twilio from "twilio";
import { withRetry } from "../utils/withRetry";
import { twilioBreaker } from "../utils/circuitBreaker";
import { logger } from "../utils/logger";
import { appendEmergencyDisclaimer } from "./disclaimer";

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

// Interval handle so we can clear it if needed (e.g. in tests)
let _keepAliveInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Pre-warm the Twilio SDK HTTP connection at server startup AND keep it alive.
 *
 * Root cause: Node's HTTP keep-alive closes idle TCP connections after ~5s.
 * A one-time pre-warm at startup works for the first message, but if no
 * patient messages arrive within ~5s the socket closes and the NEXT message
 * pays a fresh 15-27s cold TCP+TLS handshake to api.twilio.com.
 *
 * Fix: make a real Twilio SDK call immediately (warm the pool), then repeat
 * every 25s so the connection is never idle long enough to be closed.
 */
export function prewarmTwilioConnection(): void {
  try {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return;

    if (!_twilioClient) {
      _twilioClient = twilio(sid, token);
    }

    function ping() {
      _twilioClient!.messages.list({ limit: 1 })
        .then(() => {})
        .catch(() => {});
    }

    // Immediate warm-up call
    ping();
    console.log("[WhatsApp] Twilio keep-alive heartbeat started (25s interval) ✅");

    // Keep-alive heartbeat — prevents TCP connection from closing between messages
    if (_keepAliveInterval) clearInterval(_keepAliveInterval);
    _keepAliveInterval = setInterval(ping, 25_000);

  } catch {
    // Missing or invalid credentials — will surface properly on first send
  }
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

// ── Test intercept hooks ──────────────────────────────────────────────────────
// Registered by the /api/test/kb-sim endpoint to capture outbound messages
// without hitting Twilio. Key is normalized E.164 phone (+1555…).
const _testInterceptors = new Map<string, (msg: string) => void>();

export function registerTestInterceptor(e164: string, fn: (msg: string) => void): void {
  _testInterceptors.set(e164, fn);
}
export function clearTestInterceptor(e164: string): void {
  _testInterceptors.delete(e164);
}

// Per-patient tracking of whether the universal 911 disclaimer footer has
// already been shown in the CURRENT conversation. The disclaimer is fixed
// healthcare boilerplate; the patient only needs to see it once per
// conversation, not appended to every single outbound turn. markNewConversation()
// clears the flag at the start of a fresh conversation so the first message of
// that conversation carries the footer again.
const _disclaimerShown = new Set<string>();

function toE164(to: string): string {
  return normalizeWhatsAppTo(to).replace(/^whatsapp:/, "");
}

/**
 * Reset the disclaimer state for a patient so the next outbound message — the
 * first message of a new conversation — carries the universal 911 disclaimer
 * footer again. Call this whenever a fresh conversation/session begins.
 */
export function markNewConversation(to: string): void {
  _disclaimerShown.delete(toE164(to));
}

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  opts?: { incomingSid?: string }
): Promise<void> {
  const formattedTo = normalizeWhatsAppTo(to);
  // Check for test intercept before touching Twilio
  const e164 = formattedTo.replace(/^whatsapp:/, "");
  // T025: the fixed, universal 911 disclaimer is shown ONCE per conversation —
  // on the first outbound message — rather than appended to every turn. The
  // single send chokepoint still guarantees it is never forgotten on a new
  // conversation (markNewConversation() resets the flag at conversation start).
  const showDisclaimer = !_disclaimerShown.has(e164);
  const withFooter = showDisclaimer
    ? appendEmergencyDisclaimer(String(body ?? ""))
    : String(body ?? "").trim();
  if (showDisclaimer) _disclaimerShown.add(e164);
  const interceptor = _testInterceptors.get(e164);
  if (interceptor) {
    interceptor(withFooter.trim());
    return;
  }
  const { text: sanitized, phiFound } = redactPHI(withFooter.trim());
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
    console.log("[T5] Twilio REST API send started", Date.now());
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
    console.log("[T6] Twilio REST API send finished", Date.now());

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

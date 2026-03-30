/**
 * MY ADDITION: Intake Idempotency Guard
 *
 * WhatsApp and Telegram both implement webhook retry logic — if your endpoint
 * doesn't respond within ~5 seconds, they resend the message 3–5 times.
 * Without idempotency protection this causes:
 *   1. Duplicate case records for the same patient message
 *   2. Multiple ER_NOW alerts sent to physicians
 *   3. Multiple RLHF training data points from one case
 *
 * This guard uses SHA-256 message hashing (safe — no PHI stored).
 * If a message hash is seen within the deduplication window, the
 * duplicate is acknowledged but not processed.
 */

import { hashMessage } from "./phiScrubber";
import { logger }      from "../utils/logger";

export interface IdempotencyEntry {
  messageHash:  string;
  firstSeenAt:  number;
  caseId?:      string;
  resolvedAt?:  number;
}

const DEDUP_WINDOW_MS  = 60 * 1000;   // 60-second deduplication window
const MAX_CACHE_SIZE   = 10_000;

const messageCache = new Map<string, IdempotencyEntry>();

function pruneCache(): void {
  if (messageCache.size <= MAX_CACHE_SIZE) return;
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [key, entry] of messageCache.entries()) {
    if (entry.firstSeenAt < cutoff) messageCache.delete(key);
  }
}

/**
 * Check if this message has been seen before.
 * Returns null if this is a new message (allow processing).
 * Returns the original entry if this is a duplicate (block processing).
 */
export function checkIdempotency(
  rawMessageText: string,
  channelId: string
): { isDuplicate: boolean; entry: IdempotencyEntry | null } {
  pruneCache();

  const hash  = hashMessage(`${channelId}:${rawMessageText}`);
  const now   = Date.now();
  const entry = messageCache.get(hash);

  if (entry && now - entry.firstSeenAt < DEDUP_WINDOW_MS) {
    logger.warn("intake_duplicate_detected", {
      messageHash: hash.slice(0, 8),
      firstSeenAt: new Date(entry.firstSeenAt).toISOString(),
      originalCaseId: entry.caseId,
    });
    return { isDuplicate: true, entry };
  }

  // New message — register it
  const newEntry: IdempotencyEntry = { messageHash: hash, firstSeenAt: now };
  messageCache.set(hash, newEntry);

  return { isDuplicate: false, entry: newEntry };
}

/**
 * After a case is created, associate the message hash with the caseId
 * so duplicate responses can reference the original case.
 */
export function resolveCaseForMessage(rawMessageText: string, channelId: string, caseId: string): void {
  const hash  = hashMessage(`${channelId}:${rawMessageText}`);
  const entry = messageCache.get(hash);
  if (entry) {
    entry.caseId     = caseId;
    entry.resolvedAt = Date.now();
  }
}

/**
 * Express middleware: checks idempotency before passing to the intake handler.
 * Returns HTTP 202 Accepted for duplicates (tells the channel "got it, no reprocessing needed").
 */
export function intakeIdempotencyMiddleware(req: any, res: any, next: () => void): void {
  const body      = req.body ?? {};
  const channel   = req._channel ?? "unknown";
  const msgText   = extractText(body);

  const { isDuplicate, entry } = checkIdempotency(msgText, channel);

  if (isDuplicate) {
    logger.info("intake_duplicate_acknowledged", {
      channel, originalCaseId: entry?.caseId ?? "pending",
    });
    res.status(202).json({
      status:   "duplicate_accepted",
      message:  "This message has already been received and is being processed.",
      caseId:   entry?.caseId ?? null,
    });
    return;
  }

  next();
}

function extractText(body: Record<string, unknown>): string {
  // WhatsApp
  try {
    const entry  = (body.entry as any)?.[0];
    const change = entry?.changes?.[0];
    const text   = change?.value?.messages?.[0]?.text?.body;
    if (text) return text;
  } catch { /* fallthrough */ }

  // Telegram
  if ((body.message as any)?.text) return (body.message as any).text as string;

  return JSON.stringify(body).slice(0, 200);
}

export function getIdempotencyCacheStats(): { size: number; oldestEntryMs: number } {
  if (messageCache.size === 0) return { size: 0, oldestEntryMs: 0 };
  const oldest = Math.min(...Array.from(messageCache.values()).map(e => e.firstSeenAt));
  return { size: messageCache.size, oldestEntryMs: Date.now() - oldest };
}

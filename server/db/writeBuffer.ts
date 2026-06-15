import { db } from "../db";
import { engineLogs } from "../../shared/schema";

interface BufferedLog {
  engine: string;
  status: string;
  latencyMs: number;
  error?: string | null;
  createdAt: Date;
}

const buffer: BufferedLog[] = [];
const FLUSH_SIZE = 50;
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BUFFER_SIZE = 500;

const MAX_BACKOFF_MS = 120_000;
const BASE_BACKOFF_MS = 10_000;

let flushTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let backoffUntil = 0;

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS);
  flushTimer.unref();
}

export async function flushBuffer(): Promise<void> {
  if (buffer.length === 0) return;

  if (Date.now() < backoffUntil) {
    return;
  }

  const batch = buffer.splice(0, Math.min(buffer.length, FLUSH_SIZE));

  try {
    await db.insert(engineLogs).values(
      batch.map(row => ({
        engine: row.engine,
        status: row.status,
        latencyMs: row.latencyMs,
        error: row.error ?? null,
        createdAt: row.createdAt,
      }))
    );
    consecutiveFailures = 0;
    backoffUntil = 0;
  } catch (e: any) {
    consecutiveFailures++;
    const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, consecutiveFailures - 1), MAX_BACKOFF_MS);
    backoffUntil = Date.now() + backoffMs;
    console.error(`[WriteBuffer] Flush error (failure #${consecutiveFailures}, backing off ${backoffMs}ms):`, e?.message);
    const kept = batch.slice(0, 10);
    for (let i = kept.length - 1; i >= 0; i--) {
      buffer.unshift(kept[i]);
    }
  }
}

export function bufferedInsert(log: BufferedLog): void {
  if (buffer.length >= MAX_BUFFER_SIZE) {
    buffer.shift();
  }
  buffer.push(log);
  startFlushTimer();

  if (buffer.length >= FLUSH_SIZE && Date.now() >= backoffUntil) {
    flushBuffer().catch(() => {});
  }
}

export function getBufferStats() {
  return {
    bufferSize: buffer.length,
    flushSize: FLUSH_SIZE,
    flushIntervalMs: FLUSH_INTERVAL_MS,
    consecutiveFailures,
    backoffUntil: backoffUntil > Date.now() ? new Date(backoffUntil).toISOString() : null,
  };
}

process.on("SIGTERM", () => {
  console.log("[WriteBuffer] SIGTERM received — flushing log buffer...");
  flushBuffer().then(() => process.exit(0)).catch(() => process.exit(1));
});

process.on("SIGINT", () => {
  flushBuffer().finally(() => process.exit(0));
});

import { db } from "../db";
import { engineLogs } from "../../shared/schema";

interface BufferedLog {
  engine: string;
  status: string;
  latencyMs: number;
  message?: string | null;
  createdAt: Date;
}

const buffer: BufferedLog[] = [];
const FLUSH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5_000;

let flushTimer: ReturnType<typeof setInterval> | null = null;

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS);
  flushTimer.unref();
}

export async function flushBuffer(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);

  try {
    await db.insert(engineLogs).values(
      batch.map(row => ({
        engine: row.engine,
        status: row.status,
        latencyMs: row.latencyMs,
        message: row.message ?? null,
        createdAt: row.createdAt,
      }))
    );
  } catch (e: any) {
    console.error("[WriteBuffer] Flush error:", e?.message);
    for (const row of batch.slice(0, 10)) {
      buffer.unshift(row);
    }
  }
}

export function bufferedInsert(log: BufferedLog): void {
  buffer.push(log);
  startFlushTimer();

  if (buffer.length >= FLUSH_SIZE) {
    flushBuffer().catch(console.error);
  }
}

export function getBufferStats() {
  return {
    bufferSize: buffer.length,
    flushSize: FLUSH_SIZE,
    flushIntervalMs: FLUSH_INTERVAL_MS,
  };
}

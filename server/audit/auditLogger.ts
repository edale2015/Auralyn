import { db } from "../db";
import { auditLogs } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { advanceChain } from "./hashChain";

export function createTraceId(): string {
  return uuidv4();
}

export async function auditStep({
  traceId,
  step,
  input,
  output,
  metadata = {},
}: {
  traceId: string;
  step: string;
  input: any;
  output: any;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const entry = { traceId, step, input: input ?? null, output: output ?? null, metadata };
    const { hash, prevHash } = advanceChain(entry as Record<string, unknown>);

    await db.insert(auditLogs).values({
      traceId,
      step,
      input: input ?? null,
      output: output ?? null,
      metadata,
      hash,
      prevHash,
    });
  } catch (e) {
    console.error("[AuditLogger] Failed to write audit step:", e);
  }
}

export async function getTraceSteps(traceId: string) {
  try {
    return await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.traceId, traceId))
      .orderBy(auditLogs.createdAt);
  } catch (e) {
    console.error("[AuditLogger] getTraceSteps error:", e);
    return [];
  }
}

export async function getRecentAuditLogs(limit = 50) {
  try {
    return await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  } catch (e) {
    console.error("[AuditLogger] getRecentAuditLogs error:", e);
    return [];
  }
}

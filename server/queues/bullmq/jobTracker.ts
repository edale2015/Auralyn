import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { queueJobs, type InsertQueueJob, type QueueJob } from "@shared/schema";
import { logger } from "../../utils/logger";

export async function trackJobQueued(input: {
  queueName: string;
  jobId: string;
  jobName: string;
  payload?: Record<string, unknown>;
  clinicId?: string;
}): Promise<void> {
  try {
    await db.insert(queueJobs).values({
      queueName: input.queueName,
      jobId: input.jobId,
      jobName: input.jobName,
      status: "queued",
      payload: input.payload ?? {},
      clinicId: input.clinicId ?? null,
    } satisfies InsertQueueJob).onConflictDoNothing();
  } catch (e: any) {
    logger.warn("[JobTracker] trackJobQueued failed", { message: e?.message });
  }
}

export async function trackJobStatus(
  queueName: string,
  jobId: string,
  status: string,
  result?: Record<string, unknown>,
  error?: string,
  attemptsMade?: number
): Promise<void> {
  try {
    await db
      .update(queueJobs)
      .set({
        status,
        result: result ?? undefined,
        error: error ?? null,
        attemptsMade: attemptsMade ?? 0,
        updatedAt: new Date(),
      })
      .where(and(eq(queueJobs.queueName, queueName), eq(queueJobs.jobId, jobId)));
  } catch (e: any) {
    logger.warn("[JobTracker] trackJobStatus failed", { message: e?.message });
  }
}

export async function getJobRecord(
  queueName: string,
  jobId: string
): Promise<QueueJob | undefined> {
  try {
    const rows = await db
      .select()
      .from(queueJobs)
      .where(and(eq(queueJobs.queueName, queueName), eq(queueJobs.jobId, jobId)))
      .limit(1);
    return rows[0];
  } catch (e: any) {
    logger.warn("[JobTracker] getJobRecord failed", { message: e?.message });
    return undefined;
  }
}

export async function listTrackedJobs(opts: {
  queueName?: string;
  status?: string;
  clinicId?: string;
  limit?: number;
}): Promise<QueueJob[]> {
  try {
    let q = db.select().from(queueJobs);
    const filters = [];
    if (opts.queueName) filters.push(eq(queueJobs.queueName, opts.queueName));
    if (opts.status) filters.push(eq(queueJobs.status, opts.status));
    if (opts.clinicId) filters.push(eq(queueJobs.clinicId, opts.clinicId));
    if (filters.length) {
      const [first, ...rest] = filters;
      q = q.where(rest.length ? and(first, ...rest) : first) as any;
    }
    return await (q as any).limit(opts.limit ?? 100).orderBy(queueJobs.createdAt);
  } catch (e: any) {
    logger.warn("[JobTracker] listTrackedJobs failed", { message: e?.message });
    return [];
  }
}

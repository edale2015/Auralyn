/**
 * followUpService.ts
 *
 * Core business logic for the chronic disease follow-up subsystem.
 *
 * Public API:
 *   enrollInFollowUp(...)           → finds matching protocol, creates enrollment, schedules first job
 *   sendFollowUpMessage(...)        → sends WhatsApp message for current check-in, creates response row
 *   processPatientResponse(...)     → finds active enrollment, parses response, escalates if needed
 *   getEnrollmentsByPhysician(...)  → returns enrollments + latest response for dashboard
 *   registerFollowUpWorker()        → registers BullMQ worker for "followup" queue
 */

import { db }                  from "../db";
import { eq, and, desc }       from "drizzle-orm";
import { sendWhatsAppMessage }  from "../whatsapp/send";
import { appendAuditEvent }     from "../governance/audit";
import {
  followUpProtocols,
  followUpEnrollments,
  followUpResponses,
  type FollowUpProtocol,
  type FollowUpEnrollment,
} from "../../shared/followUpSchema";

// ─── BullMQ queue (lazy, falls back to in-memory setTimeout) ─────────────────

let followUpQueue: any = null;

async function getFollowUpQueue() {
  if (followUpQueue) return followUpQueue;
  try {
    const { createDurableQueue } = await import("../queue/queueFactory");
    const result = await createDurableQueue({ name: "followup" });
    followUpQueue = result.queue;
    return followUpQueue;
  } catch {
    console.warn("[FollowUp] BullMQ unavailable — follow-up jobs will not persist across restarts");
    return null;
  }
}

// ─── Protocol lookup ──────────────────────────────────────────────────────────

export async function findProtocolForComplaint(
  complaintSlug: string
): Promise<FollowUpProtocol | null> {
  const results = await db
    .select()
    .from(followUpProtocols)
    .where(
      and(
        eq(followUpProtocols.complaintSlug, complaintSlug),
        eq(followUpProtocols.active, true)
      )
    )
    .limit(1);
  return results[0] ?? null;
}

// ─── Enrollment ───────────────────────────────────────────────────────────────

export async function enrollInFollowUp({
  caseId,
  complaintSlug,
  patientPhone,
  patientName = "Patient",
  physicianId,
}: {
  caseId:        string;
  complaintSlug: string;
  patientPhone:  string;
  patientName?:  string;
  physicianId?:  string;
}): Promise<{ enrolled: boolean; enrollmentId?: number; reason?: string }> {

  const protocol = await findProtocolForComplaint(complaintSlug);
  if (!protocol) {
    return { enrolled: false, reason: `No active protocol for complaint: ${complaintSlug}` };
  }

  const existing = await db
    .select()
    .from(followUpEnrollments)
    .where(eq(followUpEnrollments.caseId, caseId))
    .limit(1);

  if (existing.length > 0) {
    return { enrolled: false, reason: "Case already enrolled in follow-up" };
  }

  const scheduleDays = protocol.scheduleDays as number[];

  const [enrollment] = await db
    .insert(followUpEnrollments)
    .values({
      caseId,
      patientPhone,
      patientName,
      protocolId:      protocol.id,
      complaintSlug,
      status:          "active",
      currentCheckIn:  0,
      totalCheckIns:   scheduleDays.length,
      physicianId,
    })
    .returning();

  await scheduleNextCheckIn(enrollment, protocol, 0);

  await appendAuditEvent({
    actor:      physicianId ?? "system",
    action:     "FOLLOW_UP_ENROLLED",
    entityId:   caseId,
    entityType: "case",
    details: {
      enrollmentId: enrollment.id,
      protocolName: protocol.name,
      complaintSlug,
      scheduleDays,
    },
  }).catch(() => {});

  return { enrolled: true, enrollmentId: enrollment.id };
}

// ─── Job scheduling ───────────────────────────────────────────────────────────

async function scheduleNextCheckIn(
  enrollment:   FollowUpEnrollment,
  protocol:     FollowUpProtocol,
  checkInIndex: number
): Promise<void> {
  const scheduleDays = protocol.scheduleDays as number[];
  if (checkInIndex >= scheduleDays.length) return;

  const delayMs = scheduleDays[checkInIndex] * 24 * 60 * 60 * 1000;
  const queue   = await getFollowUpQueue();

  if (queue) {
    const job = await queue.add(
      "send-follow-up",
      { enrollmentId: enrollment.id, checkInIndex },
      {
        delay:    delayMs,
        jobId:    `followup-${enrollment.id}-checkin-${checkInIndex}`,
        attempts: 3,
        backoff:  { type: "exponential", delay: 5000 },
      }
    );
    await db
      .update(followUpEnrollments)
      .set({ nextJobId: String(job.id ?? ""), updatedAt: new Date() })
      .where(eq(followUpEnrollments.id, enrollment.id));
  } else {
    console.warn(
      `[FollowUp] Scheduling check-in ${checkInIndex} for enrollment ${enrollment.id} via setTimeout (${scheduleDays[checkInIndex]}d). Will not survive server restart.`
    );
    setTimeout(
      () => sendFollowUpMessage(enrollment.id, checkInIndex).catch(console.error),
      delayMs
    );
  }
}

// ─── BullMQ worker registration ───────────────────────────────────────────────

export async function registerFollowUpWorker(): Promise<void> {
  const queue = await getFollowUpQueue();
  if (!queue) {
    console.warn("[FollowUp] No queue available — worker not registered");
    return;
  }

  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl || redisUrl.includes("upstash.io")) {
      console.warn("[FollowUp] Worker requires non-Upstash Redis TCP URL — skipping");
      return;
    }
    const { Worker } = await import("bullmq");
    const IORedis    = (await import("ioredis")).default;

    const conn = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy: () => null,
    });
    conn.on('error', () => {});

    new Worker(
      "followup",
      async (job: any) => {
        const { enrollmentId, checkInIndex } = job.data;
        await sendFollowUpMessage(enrollmentId, checkInIndex);
      },
      { connection: conn }
    );
    console.log("[FollowUp] BullMQ worker registered for 'followup' queue");
  } catch (err: any) {
    console.warn("[FollowUp] Worker registration failed:", err?.message);
  }
}

// ─── Message sending ──────────────────────────────────────────────────────────

export async function sendFollowUpMessage(
  enrollmentId: number,
  checkInIndex: number
): Promise<void> {
  const enrollmentRows = await db
    .select()
    .from(followUpEnrollments)
    .where(eq(followUpEnrollments.id, enrollmentId))
    .limit(1);

  const enrollment = enrollmentRows[0];
  if (!enrollment) {
    console.error(`[FollowUp] Enrollment ${enrollmentId} not found`);
    return;
  }

  if (enrollment.status !== "active") {
    console.log(`[FollowUp] Enrollment ${enrollmentId} is ${enrollment.status} — skipping send`);
    return;
  }

  const protocolRows = await db
    .select()
    .from(followUpProtocols)
    .where(eq(followUpProtocols.id, enrollment.protocolId))
    .limit(1);

  const protocol = protocolRows[0];
  if (!protocol) return;

  const questions    = protocol.questions as Array<{ id: string; text: string; type: string }>;
  const scheduleDays = protocol.scheduleDays as number[];
  const dayLabel     = scheduleDays[checkInIndex];

  const greeting      = `Hi ${enrollment.patientName}, this is your care team checking in ${dayLabel} day${dayLabel === 1 ? "" : "s"} after your visit.`;
  const questionLines = questions.map((q, i) => `${i + 1}. ${q.text}`).join("\n");
  const closing       = `\nPlease reply to each question above. Reply STOP to opt out of follow-up messages.`;
  const messageText   = `${greeting}\n\n${questionLines}${closing}`;

  await sendWhatsAppMessage(enrollment.patientPhone, messageText);

  await db.insert(followUpResponses).values({
    enrollmentId,
    checkInIndex,
    responseType: "no_response",
    escalated:    false,
    sentAt:       new Date(),
  });

  await db
    .update(followUpEnrollments)
    .set({ currentCheckIn: checkInIndex + 1, updatedAt: new Date() })
    .where(eq(followUpEnrollments.id, enrollmentId));

  if (checkInIndex + 1 < scheduleDays.length) {
    await scheduleNextCheckIn(enrollment, protocol, checkInIndex + 1);
  } else {
    await db
      .update(followUpEnrollments)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(followUpEnrollments.id, enrollmentId));
  }

  await appendAuditEvent({
    actor:      "system",
    action:     "FOLLOW_UP_MESSAGE_SENT",
    entityId:   enrollment.caseId,
    entityType: "case",
    details: { enrollmentId, checkInIndex, dayLabel },
  }).catch(() => {});
}

// ─── Response processing ──────────────────────────────────────────────────────

export async function processPatientResponse(
  patientPhone: string,
  responseText: string
): Promise<{ processed: boolean; escalated: boolean; reason?: string }> {

  const enrollmentRows = await db
    .select()
    .from(followUpEnrollments)
    .where(
      and(
        eq(followUpEnrollments.patientPhone, patientPhone),
        eq(followUpEnrollments.status, "active")
      )
    )
    .orderBy(desc(followUpEnrollments.createdAt))
    .limit(1);

  const enrollment = enrollmentRows[0];
  if (!enrollment) {
    return { processed: false, escalated: false, reason: "No active enrollment for this phone" };
  }

  const protocolRows = await db
    .select()
    .from(followUpProtocols)
    .where(eq(followUpProtocols.id, enrollment.protocolId))
    .limit(1);

  const protocol = protocolRows[0];
  if (!protocol) {
    return { processed: false, escalated: false, reason: "Protocol not found" };
  }

  const questions = protocol.questions as Array<{
    id: string; text: string; type: string; escalateIf?: string;
  }>;

  const lines             = responseText.trim().split(/[\n,]+/).map(l => l.trim());
  const parsedAnswers: Record<string, string> = {};
  const escalationSignals: string[] = [];

  questions.forEach((q, i) => {
    const raw = (lines[i] ?? "").toLowerCase()
      .replace(/^\d+[\.\)]\s*/, "")
      .trim();
    const answer =
      /^y(es)?$/.test(raw) ? "yes" :
      /^n(o)?$/.test(raw)  ? "no"  :
      raw;
    parsedAnswers[q.id] = answer;

    if (q.escalateIf) {
      const [type, trigger] = q.escalateIf.split(":");
      if (type === "yn") {
        if (trigger === "yes" && answer === "yes") escalationSignals.push(q.id);
        if (trigger === "no"  && answer === "no")  escalationSignals.push(q.id);
      }
      if (type === "scale") {
        const num       = parseInt(answer);
        const threshold = parseInt(trigger.replace(">=", ""));
        if (!isNaN(num) && !isNaN(threshold) && num >= threshold) escalationSignals.push(q.id);
      }
    }
  });

  const deteriorationScore = questions.length > 0
    ? escalationSignals.length / questions.length
    : 0;

  const shouldEscalate = deteriorationScore >= (protocol.escalationThreshold as number);

  const currentCheckIn = enrollment.currentCheckIn - 1;
  const responseRows   = await db
    .select()
    .from(followUpResponses)
    .where(
      and(
        eq(followUpResponses.enrollmentId, enrollment.id),
        eq(followUpResponses.checkInIndex, currentCheckIn),
        eq(followUpResponses.responseType, "no_response")
      )
    )
    .limit(1);

  if (responseRows[0]) {
    await db
      .update(followUpResponses)
      .set({
        responseText,
        parsedAnswers,
        deteriorationScore,
        escalated:    shouldEscalate,
        responseType: escalationSignals.length === 0 ? "responded" : "partial",
        respondedAt:  new Date(),
      })
      .where(eq(followUpResponses.id, responseRows[0].id));
  } else {
    await db.insert(followUpResponses).values({
      enrollmentId:    enrollment.id,
      checkInIndex:    currentCheckIn,
      responseText,
      parsedAnswers,
      deteriorationScore,
      escalated:       shouldEscalate,
      responseType:    escalationSignals.length === 0 ? "responded" : "partial",
      sentAt:          new Date(),
      respondedAt:     new Date(),
    });
  }

  await db
    .update(followUpEnrollments)
    .set({
      lastResponseAt: new Date(),
      status:         shouldEscalate ? "escalated" : enrollment.status,
      updatedAt:      new Date(),
    })
    .where(eq(followUpEnrollments.id, enrollment.id));

  await appendAuditEvent({
    actor:      "system",
    action:     shouldEscalate ? "FOLLOW_UP_ESCALATED" : "FOLLOW_UP_RESPONSE_RECEIVED",
    entityId:   enrollment.caseId,
    entityType: "case",
    details: {
      enrollmentId: enrollment.id,
      deteriorationScore,
      shouldEscalate,
      escalationSignals,
    },
  }).catch(() => {});

  return { processed: true, escalated: shouldEscalate };
}

// ─── Dashboard query ──────────────────────────────────────────────────────────

export async function getEnrollmentsByPhysician(
  physicianId: string
): Promise<any[]> {
  const enrollments = await db
    .select()
    .from(followUpEnrollments)
    .orderBy(desc(followUpEnrollments.createdAt));

  const result = await Promise.all(
    enrollments.map(async (e) => {
      const latestResponseRows = await db
        .select()
        .from(followUpResponses)
        .where(eq(followUpResponses.enrollmentId, e.id))
        .orderBy(desc(followUpResponses.sentAt))
        .limit(1);

      return {
        ...e,
        latestResponse: latestResponseRows[0] ?? null,
      };
    })
  );

  return result;
}

/**
 * followUpService.ts
 * Drop into: server/followup/followUpService.ts
 *
 * Core business logic for the chronic disease follow-up subsystem.
 *
 * Public API:
 *   enrollInFollowUp(caseId, complaintSlug, patientPhone, patientName, physicianId)
 *     → finds matching protocol, creates enrollment, schedules first BullMQ job
 *
 *   sendFollowUpMessage(enrollmentId)
 *     → sends WhatsApp message for the current check-in, creates followUpResponse row
 *
 *   processPatientResponse(patientPhone, responseText)
 *     → finds active enrollment, parses response, scores deterioration, escalates if needed
 *
 *   getEnrollmentsByPhysician(physicianId)
 *     → returns all enrollments + latest response for monitoring dashboard
 */

import { db }                  from "../db";
import { eq, and, desc, sql }  from "drizzle-orm";
import { sendWhatsAppMessage } from "../whatsapp/send";
import { appendAuditEvent }    from "../governance/audit";
import {
  followUpProtocols,
  followUpEnrollments,
  followUpResponses,
  type FollowUpProtocol,
  type FollowUpEnrollment,
} from "../../shared/followUpSchema";

// BullMQ durable queue — falls back to in-memory if Redis unavailable
// Import pattern matches jobQueue.ts established pattern
let followUpQueue: any = null;

async function getFollowUpQueue() {
  if (followUpQueue) return followUpQueue;
  try {
    const { createDurableQueue } = await import("../queue/queueFactory");
    followUpQueue = await createDurableQueue("followup");
    return followUpQueue;
  } catch {
    // Redis unavailable — return null, caller handles fallback
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

  // Find matching protocol
  const protocol = await findProtocolForComplaint(complaintSlug);
  if (!protocol) {
    return { enrolled: false, reason: `No active protocol for complaint: ${complaintSlug}` };
  }

  // Check not already enrolled for this case
  const existing = await db
    .select()
    .from(followUpEnrollments)
    .where(eq(followUpEnrollments.caseId, caseId))
    .limit(1);

  if (existing.length > 0) {
    return { enrolled: false, reason: "Case already enrolled in follow-up" };
  }

  const scheduleDays = protocol.scheduleDays as number[];

  // Create enrollment record
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

  // Schedule first follow-up job
  await scheduleNextCheckIn(enrollment, protocol, 0);

  // Audit event
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
      // patientPhone intentionally omitted — PHI store rule
    },
  }).catch(() => {});

  return { enrolled: true, enrollmentId: enrollment.id };
}

// ─── Job scheduling ───────────────────────────────────────────────────────────

async function scheduleNextCheckIn(
  enrollment: FollowUpEnrollment,
  protocol:   FollowUpProtocol,
  checkInIndex: number
): Promise<void> {
  const scheduleDays = protocol.scheduleDays as number[];
  if (checkInIndex >= scheduleDays.length) return;

  const delayMs = scheduleDays[checkInIndex] * 24 * 60 * 60 * 1000;
  const queue   = await getFollowUpQueue();

  if (queue) {
    // BullMQ delayed job
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

    // Store job ID for potential cancellation
    await db
      .update(followUpEnrollments)
      .set({ nextJobId: job.id, updatedAt: new Date() })
      .where(eq(followUpEnrollments.id, enrollment.id));

  } else {
    // In-memory fallback — setTimeout (lost on restart, acceptable for dev)
    console.warn(
      `[FollowUp] Scheduling check-in ${checkInIndex} for enrollment ${enrollment.id} via setTimeout (${scheduleDays[checkInIndex]}d). Will not survive server restart.`
    );
    setTimeout(
      () => sendFollowUpMessage(enrollment.id, checkInIndex).catch(console.error),
      delayMs
    );
  }
}

// ─── Message sending ──────────────────────────────────────────────────────────

export async function sendFollowUpMessage(
  enrollmentId: number,
  checkInIndex: number
): Promise<void> {

  // Fetch enrollment + protocol
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

  const questions     = protocol.questions as Array<{ id: string; text: string; type: string }>;
  const scheduleDays  = protocol.scheduleDays as number[];

  // Build the message text
  const dayLabel  = scheduleDays[checkInIndex];
  const greeting  = `Hi ${enrollment.patientName}, this is your care team checking in ${dayLabel} day${dayLabel === 1 ? "" : "s"} after your visit.`;
  const questionLines = questions.map((q, i) => `${i + 1}. ${q.text}`).join("\n");
  const closing   = `\nPlease reply to each question above. Reply STOP to opt out of follow-up messages.`;

  const messageText = `${greeting}\n\n${questionLines}${closing}`;

  // Send via WhatsApp
  await sendWhatsAppMessage(enrollment.patientPhone, messageText);

  // Create response record (initially sent, awaiting response)
  await db.insert(followUpResponses).values({
    enrollmentId,
    checkInIndex,
    responseType:       "no_response",   // default until patient replies
    escalated:          false,
    sentAt:             new Date(),
  });

  // Update enrollment check-in counter
  await db
    .update(followUpEnrollments)
    .set({
      currentCheckIn: checkInIndex + 1,
      updatedAt:      new Date(),
    })
    .where(eq(followUpEnrollments.id, enrollmentId));

  // Schedule next check-in if more remain
  if (checkInIndex + 1 < scheduleDays.length) {
    await scheduleNextCheckIn(enrollment, protocol, checkInIndex + 1);
  } else {
    // Protocol complete
    await db
      .update(followUpEnrollments)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(followUpEnrollments.id, enrollmentId));
  }

  // Audit
  await appendAuditEvent({
    actor:      "system",
    action:     "FOLLOW_UP_MESSAGE_SENT",
    entityId:   enrollment.caseId,
    entityType: "case",
    details: {
      enrollmentId,
      checkInIndex,
      dayLabel,
      // patientPhone omitted — PHI store rule
    },
  }).catch(() => {});
}

// ─── Response processing ──────────────────────────────────────────────────────

export async function processPatientResponse(
  patientPhone: string,
  responseText: string
): Promise<{ processed: boolean; escalated: boolean; reason?: string }> {

  // Find the most recent active enrollment for this phone number
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

  const protocol  = protocolRows[0];
  if (!protocol) {
    return { processed: false, escalated: false, reason: "Protocol not found" };
  }

  const questions = protocol.questions as Array<{
    id: string; text: string; type: string; escalateIf?: string;
  }>;

  // ── Parse response ──────────────────────────────────────────────────────────
  // Simple line-by-line parser: patient replies "1. Y\n2. N\n3. Y"
  // or just "Y N Y" or "yes no yes"
  const lines     = responseText.trim().split(/[\n,]+/).map(l => l.trim());
  const parsedAnswers: Record<string, string> = {};
  const escalationSignals: string[] = [];

  questions.forEach((q, i) => {
    const raw = (lines[i] ?? "").toLowerCase()
      .replace(/^\d+[\.\)]\s*/, "")  // strip "1. " prefix
      .trim();

    const answer =
      /^y(es)?$/.test(raw) ? "yes" :
      /^n(o)?$/.test(raw)  ? "no"  :
      raw;

    parsedAnswers[q.id] = answer;

    // Check escalation rules
    if (q.escalateIf) {
      const [type, trigger] = q.escalateIf.split(":");
      if (type === "yn") {
        if (trigger === "yes" && answer === "yes") escalationSignals.push(q.id);
        if (trigger === "no"  && answer === "no")  escalationSignals.push(q.id);
      }
      if (type === "scale") {
        const num = parseInt(answer);
        const threshold = parseInt(trigger.replace(">=", ""));
        if (!isNaN(num) && !isNaN(threshold) && num >= threshold) {
          escalationSignals.push(q.id);
        }
      }
    }
  });

  // ── Deterioration score ─────────────────────────────────────────────────────
  // Simple: proportion of questions triggering escalation signals
  const deteriorationScore = questions.length > 0
    ? escalationSignals.length / questions.length
    : 0;

  const shouldEscalate = deteriorationScore >= (protocol.escalationThreshold as number);

  // ── Update response record ──────────────────────────────────────────────────
  // Find the most recent "no_response" record for the current check-in
  const currentCheckIn = enrollment.currentCheckIn - 1; // already incremented on send
  const responseRows = await db
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
        responseType: "responded",
        respondedAt:  new Date(),
      })
      .where(eq(followUpResponses.id, responseRows[0].id));
  }

  // Update enrollment last response timestamp
  await db
    .update(followUpEnrollments)
    .set({
      lastResponseAt: new Date(),
      status:         shouldEscalate ? "escalated" : "active",
      updatedAt:      new Date(),
    })
    .where(eq(followUpEnrollments.id, enrollment.id));

  // ── Escalation alert ────────────────────────────────────────────────────────
  if (shouldEscalate && enrollment.physicianId) {
    await appendAuditEvent({
      actor:      "system",
      action:     "FOLLOW_UP_ESCALATION",
      entityId:   enrollment.caseId,
      entityType: "case",
      details: {
        enrollmentId:       enrollment.id,
        checkInIndex:       currentCheckIn,
        deteriorationScore,
        escalationSignals,
        physicianId:        enrollment.physicianId,
        // patientPhone omitted — PHI store rule
      },
    }).catch(() => {});

    // Send physician alert via WhatsApp if they have a phone on file
    // This is a best-effort notification — failure does not block processing
    console.warn(
      `[FollowUp] ESCALATION — enrollment ${enrollment.id}, case ${enrollment.caseId}, ` +
      `score ${deteriorationScore.toFixed(2)}, signals: ${escalationSignals.join(", ")}`
    );
  }

  return { processed: true, escalated: shouldEscalate };
}

// ─── Dashboard data ───────────────────────────────────────────────────────────

export async function getEnrollmentsByPhysician(physicianId: string) {
  const enrollments = await db
    .select()
    .from(followUpEnrollments)
    .where(eq(followUpEnrollments.physicianId, physicianId))
    .orderBy(desc(followUpEnrollments.createdAt));

  // Attach latest response to each enrollment
  const enriched = await Promise.all(
    enrollments.map(async (e) => {
      const latestResponse = await db
        .select()
        .from(followUpResponses)
        .where(eq(followUpResponses.enrollmentId, e.id))
        .orderBy(desc(followUpResponses.sentAt))
        .limit(1);

      return { ...e, latestResponse: latestResponse[0] ?? null };
    })
  );

  return enriched;
}

// ─── BullMQ worker registration ──────────────────────────────────────────────
// Call registerFollowUpWorker() from server/index.ts during startup.

export async function registerFollowUpWorker(): Promise<void> {
  const queue = await getFollowUpQueue();
  if (!queue) return;

  try {
    const { Worker } = await import("bullmq");
    const { default: IORedis } = await import("ioredis");

    const connection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });

    new Worker(
      "followup",
      async (job: any) => {
        const { enrollmentId, checkInIndex } = job.data;
        console.log(`[FollowUp Worker] Processing check-in ${checkInIndex} for enrollment ${enrollmentId}`);
        await sendFollowUpMessage(enrollmentId, checkInIndex);
      },
      { connection }
    );

    console.log("[FollowUp] BullMQ worker registered on 'followup' queue");
  } catch (err: any) {
    console.warn("[FollowUp] Worker registration failed:", err.message);
  }
}

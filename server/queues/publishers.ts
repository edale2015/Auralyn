import { getQueue } from "./bullmq/queueFactory";
import { trackJobQueued } from "./bullmq/jobTracker";
import { QUEUE_NAMES } from "./bullmq/queueNames";
import { defaultJobOptions, criticalJobOptions, lowPriorityJobOptions } from "./bullmq/defaultJobOptions";
import { logger } from "../utils/logger";
import type { JobsOptions } from "bullmq";

async function publish(
  queueName: string,
  jobName: string,
  payload: Record<string, unknown>,
  opts?: JobsOptions
): Promise<string | null> {
  const queue = getQueue(queueName as any);
  if (!queue) {
    logger.warn(`[Publishers] Queue unavailable: ${queueName} — dropping job ${jobName}`);
    return null;
  }

  try {
    const job = await queue.add(jobName, payload, opts ?? defaultJobOptions);
    if (job.id) {
      await trackJobQueued({
        queueName,
        jobId: job.id,
        jobName,
        payload,
        clinicId: payload.clinicId as string | undefined,
      });
    }
    return job.id ?? null;
  } catch (e: any) {
    logger.warn(`[Publishers] Failed to publish ${jobName} to ${queueName}`, { message: e?.message });
    return null;
  }
}

export const publishers = {
  triage: {
    runTriage: (payload: Record<string, unknown>) =>
      publish(QUEUE_NAMES.TRIAGE, "run-triage", payload, criticalJobOptions),
  },

  notification: {
    send: (payload: Record<string, unknown>) =>
      publish(QUEUE_NAMES.NOTIFICATION, "send-notification", payload),
    sendSms: (payload: Record<string, unknown>) =>
      publish(QUEUE_NAMES.NOTIFICATION, "send-sms", payload),
  },

  learning: {
    runLearningUpdate: (payload: Record<string, unknown>) =>
      publish(QUEUE_NAMES.LEARNING, "run-learning-update", payload, lowPriorityJobOptions),
  },

  goldenCase: {
    runBatch: (payload: Record<string, unknown> = {}) =>
      publish(QUEUE_NAMES.GOLDEN_CASE, "run-golden-batch", payload, lowPriorityJobOptions),
    runSingle: (payload: Record<string, unknown>) =>
      publish(QUEUE_NAMES.GOLDEN_CASE, "run-single-case", payload),
  },

  audit: {
    log: (payload: Record<string, unknown>) =>
      publish(QUEUE_NAMES.AUDIT, "append-audit", payload, criticalJobOptions),
  },

  ehr: {
    deliver: (payload: Record<string, unknown>) =>
      publish(QUEUE_NAMES.EHR_OUTBOUND, "deliver-to-ehr", payload),
  },

  explanation: {
    generate: (payload: Record<string, unknown>) =>
      publish(QUEUE_NAMES.EXPLANATION, "generate-explanation", payload, lowPriorityJobOptions),
  },

  webhook: {
    deliver: (payload: Record<string, unknown>) =>
      publish(QUEUE_NAMES.WEBHOOK, "deliver-webhook", payload),
  },

  report: {
    buildExecutive: (payload: Record<string, unknown>) =>
      publish(QUEUE_NAMES.REPORT, "build-executive-report", payload, lowPriorityJobOptions),
  },

  metrics: {
    rollup: (payload: Record<string, unknown> = {}) =>
      publish(QUEUE_NAMES.METRICS, "rollup-metrics", payload, lowPriorityJobOptions),
  },
};

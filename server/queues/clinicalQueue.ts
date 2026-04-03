import { appendAuditEvent } from "../governance/audit";

export interface ClinicalQueueDeps {
  bullQueue?: { add: (name: string, payload: any, opts?: any) => Promise<any> } | null;
  redisHealthy: boolean;
}

export interface ClinicalJobArgs {
  tenantId: string;
  encounterId: string;
  payload: Record<string, unknown>;
}

/**
 * Enqueues a clinical pipeline job or FAILS HARD if Redis is unavailable.
 * 
 * Per Claude evaluation Q14: clinical pipeline jobs must NEVER fall back to in-memory
 * queuing. Silent in-memory queueing creates the illusion of success while creating
 * undetectable data loss on process restart.
 */
export async function enqueueClinicalJobOrFail(
  deps: ClinicalQueueDeps,
  args: ClinicalJobArgs
): Promise<any> {
  if (!args.tenantId) {
    throw Object.assign(new Error("tenantId required for all clinical queue jobs"), {
      statusCode: 400,
      code: "TENANT_ID_REQUIRED",
    });
  }

  if (!deps.redisHealthy || !deps.bullQueue) {
    await appendAuditEvent({
      tenantId: args.tenantId,
      actorId: null,
      action: "CLINICAL_QUEUE_REJECTED_REDIS_UNAVAILABLE",
      entityType: "queue_job",
      entityId: args.encounterId,
      payload: { encounterId: args.encounterId, tenantId: args.tenantId },
    }).catch(() => {});

    throw Object.assign(
      new Error(
        "Temporary processing issue. Please retry in 30 seconds or contact the clinic directly."
      ),
      {
        statusCode: 503,
        code: "CLINICAL_QUEUE_UNAVAILABLE",
        retryable: true,
      }
    );
  }

  return deps.bullQueue.add(
    "clinical-pipeline",
    {
      tenantId: args.tenantId,
      encounterId: args.encounterId,
      ...args.payload,
    },
    {
      removeOnComplete: 5000,
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
    }
  );
}

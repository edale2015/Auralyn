import { logEvent } from "./auditEvents";
import { logSecureEvent } from "./secureAudit";

export type AuditJobStatus = "QUEUED" | "PROCESSING" | "STORED" | "FAILED";

interface AuditJob {
  jobId: string;
  event: any;
  secure: boolean;
  status: AuditJobStatus;
  queuedAt: string;
  storedAt?: string;
}

const auditJobQueue: AuditJob[] = [];
let processedCount = 0;
let failedCount = 0;

export function queueAudit(event: any, options: { secure?: boolean } = {}): { jobId: string; status: "QUEUED" } {
  const jobId = `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const job: AuditJob = {
    jobId,
    event,
    secure: options.secure ?? false,
    status: "QUEUED",
    queuedAt: new Date().toISOString(),
  };
  auditJobQueue.push(job);
  setImmediate(() => processAuditJob(job));
  return { jobId, status: "QUEUED" };
}

async function processAuditJob(job: AuditJob): Promise<void> {
  job.status = "PROCESSING";
  try {
    if (job.secure) {
      logSecureEvent(job.event);
    } else {
      logEvent({ type: "AUDIT_QUEUED" as any, encounterId: job.jobId, detail: JSON.stringify(job.event) });
    }
    job.status = "STORED";
    job.storedAt = new Date().toISOString();
    processedCount++;
  } catch {
    job.status = "FAILED";
    failedCount++;
  }
}

export function getAuditQueueStats() {
  const queued = auditJobQueue.filter((j) => j.status === "QUEUED").length;
  const processing = auditJobQueue.filter((j) => j.status === "PROCESSING").length;
  return {
    active: true,
    total: auditJobQueue.length,
    queued,
    processing,
    processedCount,
    failedCount,
  };
}

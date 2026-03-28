import { safeLearning } from "./safeLearningPipeline";
import { OutcomeType } from "./biasAwareRLHF";

export interface RLHFJob {
  jobId: string;
  data: {
    ai: string;
    physician: string;
    outcome: OutcomeType;
    disposition: string;
    diagnosisKey?: string;
    demographics?: Record<string, any>;
    testOrdered?: boolean;
    aiSuggested?: boolean;
    testResult?: string;
  };
  status: "QUEUED" | "PROCESSED" | "FAILED";
  result?: any;
  queuedAt: string;
  processedAt?: string;
}

const rlhfJobQueue: RLHFJob[] = [];
let processedCount = 0;

export function queueLearning(data: RLHFJob["data"]): { jobId: string; status: "QUEUED" } {
  const jobId = `RLHF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const job: RLHFJob = { jobId, data, status: "QUEUED", queuedAt: new Date().toISOString() };
  rlhfJobQueue.push(job);
  setImmediate(() => processRLHFJob(job));
  return { jobId, status: "QUEUED" };
}

async function processRLHFJob(job: RLHFJob): Promise<void> {
  try {
    job.result = safeLearning(job.data);
    job.status = "PROCESSED";
    job.processedAt = new Date().toISOString();
    processedCount++;
  } catch {
    job.status = "FAILED";
    job.processedAt = new Date().toISOString();
  }
}

export function getRLHFQueueStats() {
  const queued = rlhfJobQueue.filter((j) => j.status === "QUEUED").length;
  const processed = rlhfJobQueue.filter((j) => j.status === "PROCESSED").length;
  const failed = rlhfJobQueue.filter((j) => j.status === "FAILED").length;
  return { active: true, total: rlhfJobQueue.length, queued, processed, failed };
}

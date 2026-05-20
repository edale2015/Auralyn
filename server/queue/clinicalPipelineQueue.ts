import crypto from 'node:crypto';
import { createDurableQueue } from './queueFactory';
import { logger } from '../utils/logger';

export interface ClinicalPipelineJob {
  encounterId: string;
  tenantId: string;
  correlationId: string;
  stage: 'intake' | 'triage' | 'reasoning' | 'output' | 'claim_submission';
  payload: Record<string, unknown>;
}

function buildIdempotencyKey(job: ClinicalPipelineJob): string {
  return crypto
    .createHash('sha256')
    .update(`${job.encounterId}:${job.tenantId}:${job.stage}:${job.correlationId}`)
    .digest('hex');
}

let clinicalPipelineQueue: import('bullmq').Queue<ClinicalPipelineJob> | null = null;
let _initStarted = false;

async function initClinicalPipelineQueue() {
  if (_initStarted) return;
  _initStarted = true;
  const result = await createDurableQueue<ClinicalPipelineJob>({
    name: 'clinical_pipeline',
    processor: async (job) => {
      logger.info('[clinicalPipeline] processing stage', {
        stage: job.data.stage,
        encounterId: job.data.encounterId,
        correlationId: job.data.correlationId,
      });
      return { ok: true, processedStage: job.data.stage, encounterId: job.data.encounterId };
    },
  });
  clinicalPipelineQueue = result.queue;
}

initClinicalPipelineQueue().catch(() => {});

export async function enqueueClinicalJob(job: ClinicalPipelineJob): Promise<string | null> {
  if (!clinicalPipelineQueue) {
    logger.warn('[clinicalPipeline] queue not available — falling back to sync processing', {
      stage: job.stage,
      encounterId: job.encounterId,
    });
    return null;
  }
  const idempotencyKey = buildIdempotencyKey(job);
  await clinicalPipelineQueue.add(job.stage, job, { jobId: idempotencyKey });
  return idempotencyKey;
}

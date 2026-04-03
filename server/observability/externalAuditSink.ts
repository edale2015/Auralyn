import { logger } from '../utils/logger';

export interface AuditEvent {
  auditId: string;
  tenantId: string;
  correlationId: string;
  actorId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  hash: string;
  prevHash: string;
  createdAt: string;
}

const bucket = process.env.AUDIT_S3_BUCKET;
const region = process.env.AWS_REGION || 'us-east-1';

async function writeToS3(event: AuditEvent): Promise<void> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({ region });
  const key = `audit/${new Date(event.createdAt).toISOString().slice(0, 10)}/${event.auditId}.json`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket!,
      Key: key,
      Body: JSON.stringify(event),
      ContentType: 'application/json',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
    }),
  );
}

export async function writeAuditEventToExternalStore(event: AuditEvent): Promise<void> {
  if (!bucket) {
    logger.info('[externalAuditSink] AUDIT_S3_BUCKET not set — logging to console (dev/fallback mode)', {
      auditId: event.auditId,
      tenantId: event.tenantId,
      eventType: event.eventType,
      correlationId: event.correlationId,
      createdAt: event.createdAt,
    });
    return;
  }

  try {
    await writeToS3(event);
    logger.info('[externalAuditSink] Event written to S3', { auditId: event.auditId, bucket });
  } catch (err: any) {
    logger.error('[externalAuditSink] S3 write failed — event NOT persisted externally', {
      auditId: event.auditId,
      error: err?.message,
    });
    throw err;
  }
}

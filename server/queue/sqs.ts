import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const client = new SQSClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

export interface SqsEvent {
  type: string;
  clinicId?: string;
  traceId?: string;
  payload?: unknown;
}

export async function publishEventToSqs(event: SqsEvent): Promise<void> {
  const queueUrl = process.env.AWS_EVENTS_QUEUE_URL;
  if (!queueUrl) return;

  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(event),
    })
  );
}

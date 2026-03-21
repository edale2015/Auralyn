import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
});

export async function uploadArtifact(params: {
  key: string;
  body: string | Uint8Array | Buffer;
  contentType?: string;
}): Promise<void> {
  const bucket = process.env.AWS_ARTIFACTS_BUCKET;
  if (!bucket) {
    throw new Error("AWS_ARTIFACTS_BUCKET is not configured");
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType ?? "application/octet-stream",
    })
  );
}

export async function getArtifact(key: string): Promise<string> {
  const bucket = process.env.AWS_ARTIFACTS_BUCKET;
  if (!bucket) {
    throw new Error("AWS_ARTIFACTS_BUCKET is not configured");
  }

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  if (!response.Body) throw new Error(`No body for artifact key: ${key}`);
  return response.Body.transformToString();
}

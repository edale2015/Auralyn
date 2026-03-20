let rotationTimer: ReturnType<typeof setInterval> | null = null;

async function refreshSecrets(): Promise<void> {
  if (!process.env.AWS_SECRET_ID && !process.env.AWS_REGION) return;

  try {
    const AWS = await import("aws-sdk").catch(() => null);
    if (!AWS) {
      console.warn("[SecretRotation] aws-sdk not available");
      return;
    }

    const sm = new AWS.default.SecretsManager({ region: process.env.AWS_REGION ?? "us-east-1" });
    const secretId = process.env.AWS_SECRET_ID ?? "prod/medscribe";

    const data = await sm.getSecretValue({ SecretId: secretId }).promise();
    const secrets = JSON.parse((data as any).SecretString ?? "{}");

    Object.assign(process.env, secrets);
    console.log(JSON.stringify({
      event: "secrets_rotated",
      secretId,
      keyCount: Object.keys(secrets).length,
      timestamp: new Date().toISOString(),
    }));
  } catch (e: any) {
    console.error("[SecretRotation] Failed to refresh secrets:", e?.message);
  }
}

export function startSecretRotation(intervalMs = 15 * 60 * 1000): void {
  if (rotationTimer) return;
  refreshSecrets().catch(() => {});
  rotationTimer = setInterval(refreshSecrets, intervalMs);
  rotationTimer.unref();
  console.log("[SecretRotation] Auto-refresh every 15 min — AWS_SECRET_ID:", process.env.AWS_SECRET_ID ?? "(not set)");
}

export { refreshSecrets };

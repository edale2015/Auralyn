import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export async function loadAwsSecrets() {
  const secretId = process.env.AWS_APP_SECRET_ID;
  if (!secretId) return;

  try {
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
    const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

    if (!result.SecretString) {
      throw new Error("Secrets Manager returned empty secret string");
    }

    const parsed = JSON.parse(result.SecretString) as Record<string, string>;

    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }

    console.log("[loadAwsSecrets] Loaded secrets from Secrets Manager:", secretId);
  } catch (err: any) {
    if (process.env.NODE_ENV === "production") throw err;
    console.warn("[loadAwsSecrets] Skipped (not in production or unavailable):", err?.message);
  }
}

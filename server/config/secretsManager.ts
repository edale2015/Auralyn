export async function loadSecrets(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;

  if (process.env.AWS_SECRET_ID) {
    try {
      const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
      const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? "us-east-1" });
      const response = await client.send(
        new GetSecretValueCommand({ SecretId: process.env.AWS_SECRET_ID })
      );
      if (response.SecretString) {
        const secrets = JSON.parse(response.SecretString);
        Object.assign(process.env, secrets);
        console.log("[SecretsManager] Loaded production secrets from AWS");
      }
    } catch (e: any) {
      console.warn("[SecretsManager] AWS secrets unavailable, using env vars:", e?.message);
    }
  }

  validateRequiredSecrets();
}

function validateRequiredSecrets(): void {
  const required = ["DATABASE_URL"];
  const missing = required.filter(k => !process.env[k]);

  if (missing.length > 0) {
    throw new Error(`[SecretsManager] Missing required secrets: ${missing.join(", ")}`);
  }

  console.log("[SecretsManager] All required secrets validated");
}

/**
 * SMART on FHIR — OAuth 2.0 client_credentials flow.
 *
 * Caches the token in memory and refreshes automatically 60 s before expiry.
 * All other FHIR client calls should call getBearerToken() to get a fresh token.
 */

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

const BUFFER_MS = 60_000; // refresh 60 s before expiry

export function isSmartAuthConfigured(): boolean {
  return Boolean(
    process.env.FHIR_BASE_URL &&
    process.env.FHIR_CLIENT_ID &&
    process.env.FHIR_CLIENT_SECRET
  );
}

/**
 * Returns a valid Bearer token.
 * Throws if SMART on FHIR credentials are not configured.
 */
export async function getBearerToken(): Promise<string> {
  if (!isSmartAuthConfigured()) {
    throw new Error(
      "SMART on FHIR not configured — set FHIR_BASE_URL, FHIR_CLIENT_ID, FHIR_CLIENT_SECRET"
    );
  }

  if (tokenCache && tokenCache.expiresAt > Date.now() + BUFFER_MS) {
    return tokenCache.token;
  }

  const tokenUrl = `${process.env.FHIR_BASE_URL}/oauth/token`;

  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     process.env.FHIR_CLIENT_ID!,
    client_secret: process.env.FHIR_CLIENT_SECRET!,
    ...(process.env.FHIR_AUDIENCE ? { audience: process.env.FHIR_AUDIENCE } : {}),
  });

  const res = await fetch(tokenUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SMART on FHIR token request failed (${res.status}): ${text}`);
  }

  const data: { access_token: string; expires_in: number } = await res.json();

  tokenCache = {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  console.log(`[FhirAuth] Token acquired — expires in ${data.expires_in}s`);
  return tokenCache.token;
}

/** Invalidate the cached token (e.g., after a 401 response) */
export function invalidateToken(): void {
  tokenCache = null;
}

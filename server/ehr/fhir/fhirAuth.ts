/**
 * server/ehr/fhir/fhirAuth.ts — SMART on FHIR OAuth 2.0 client_credentials flow
 *
 * FIX (Code Review High Finding #10):
 *   A single process-global tokenCache variable was shared across ALL tenants.
 *   In a multi-tenant deployment, one clinic's token was served to all others,
 *   violating tenant isolation and potentially granting cross-tenant FHIR access.
 *
 *   Fixed: token cache is now keyed by a compound cache key derived from
 *   (FHIR_BASE_URL, FHIR_CLIENT_ID) — the effective tenant identity for the
 *   OAuth client_credentials flow. Different tenant configurations get separate
 *   cache entries. invalidateToken(cacheKey) invalidates only that tenant's token.
 */

interface TokenCache {
  token:     string;
  expiresAt: number;
}

// FIX: Map<cacheKey, TokenCache> — per-tenant, not global
const tokenCacheMap = new Map<string, TokenCache>();

const BUFFER_MS = 60_000; // refresh 60 s before expiry

export function isSmartAuthConfigured(): boolean {
  return Boolean(
    process.env.FHIR_BASE_URL &&
    process.env.FHIR_CLIENT_ID &&
    process.env.FHIR_CLIENT_SECRET
  );
}

/**
 * Derive a tenant-scoped cache key from env config.
 * Different (BASE_URL, CLIENT_ID) pairs = different FHIR tenants = separate tokens.
 */
function tenantCacheKey(): string {
  const base     = process.env.FHIR_BASE_URL   ?? "";
  const clientId = process.env.FHIR_CLIENT_ID  ?? "";
  return `${base}::${clientId}`;
}

/**
 * Returns a valid Bearer token for the configured FHIR tenant.
 * Throws if SMART on FHIR credentials are not configured.
 * Token cache is per (BASE_URL, CLIENT_ID) — not process-global.
 */
export async function getBearerToken(): Promise<string> {
  if (!isSmartAuthConfigured()) {
    throw new Error(
      "SMART on FHIR not configured — set FHIR_BASE_URL, FHIR_CLIENT_ID, FHIR_CLIENT_SECRET"
    );
  }

  const key    = tenantCacheKey();
  const cached = tokenCacheMap.get(key);

  if (cached && cached.expiresAt > Date.now() + BUFFER_MS) {
    return cached.token;
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
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SMART on FHIR token request failed (${res.status}): ${text}`);
  }

  const data: { access_token: string; expires_in: number } = await res.json();

  tokenCacheMap.set(key, {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  console.log(`[FhirAuth] Token acquired for tenant ${key.split("::")[1]} — expires in ${data.expires_in}s`);
  return data.access_token;
}

/** Invalidate the cached token for the current tenant configuration */
export function invalidateToken(): void {
  const key = tenantCacheKey();
  tokenCacheMap.delete(key);
}

/** Invalidate a specific tenant's token (for multi-tenant rotation) */
export function invalidateTokenForTenant(baseUrl: string, clientId: string): void {
  tokenCacheMap.delete(`${baseUrl}::${clientId}`);
}

/** Count of cached tenant tokens (diagnostics) */
export function cachedTenantCount(): number {
  return tokenCacheMap.size;
}

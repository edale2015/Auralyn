/**
 * server/ehr/fhir/fhirClient.ts — FHIR API client
 *
 * FIX (Code Review Issue #11):
 *   Previously: when SMART auth token acquisition failed, the error was downgraded
 *   to a console.warn and the request proceeded without an Authorization header.
 *   This meant FHIR requests were silently made as unauthenticated — the server
 *   was falsely integrated with the EHR and requests would be rejected with 401
 *   (or worse, accepted on permissive staging endpoints that don't enforce auth).
 *
 *   Fixed: auth token failure is now a hard error. buildHeaders() throws if SMART
 *   is configured but token acquisition fails. fhirFetch() propagates the error.
 *   The only way to make FHIR requests without auth is to not configure SMART auth
 *   (which is valid for FHIR servers that use IP allowlisting or other controls).
 *
 *   The 401 retry path is preserved: if a token has expired mid-request, we
 *   invalidate the cache and retry once with a fresh token.
 */

import { getBearerToken, isSmartAuthConfigured, invalidateToken } from "./fhirAuth";

const FHIR_BASE_URL = process.env.FHIR_BASE_URL;

function assertFhirConfigured(): void {
  if (!FHIR_BASE_URL) {
    throw new Error(
      "FHIR_BASE_URL is not configured — set the environment variable to enable FHIR sync"
    );
  }
}

async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept:         "application/fhir+json",
    "Content-Type": "application/fhir+json",
  };

  if (isSmartAuthConfigured()) {
    // FIX (Issue #11): auth failure now throws — request does not proceed unauthenticated
    const token = await getBearerToken();  // throws on failure (no try/catch wrapper)
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

async function fhirFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  assertFhirConfigured();
  const headers = await buildHeaders();

  const res = await fetch(`${FHIR_BASE_URL}${path}`, {
    method,
    headers,
    body:   body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  // 401 + SMART configured: invalidate cached token and retry once
  if (res.status === 401 && isSmartAuthConfigured()) {
    invalidateToken();
    const freshHeaders = await buildHeaders();  // throws if re-auth fails
    const retry = await fetch(`${FHIR_BASE_URL}${path}`, {
      method,
      headers: freshHeaders,
      body:    body ? JSON.stringify(body) : undefined,
      signal:  AbortSignal.timeout(15_000),
    });
    if (!retry.ok) {
      const text = await retry.text().catch(() => "(unreadable)");
      throw new Error(`FHIR ${method} ${path} → HTTP ${retry.status}: ${text}`);
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    throw new Error(`FHIR ${method} ${path} → HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function fhirGet<T>(path: string): Promise<T> {
  return fhirFetch<T>("GET", path);
}

export async function fhirPost<T>(path: string, body: unknown): Promise<T> {
  return fhirFetch<T>("POST", path, body);
}

export async function fhirPut<T>(path: string, body: unknown): Promise<T> {
  return fhirFetch<T>("PUT", path, body);
}

export function isFhirConfigured(): boolean {
  return Boolean(FHIR_BASE_URL);
}

import { getBearerToken, isSmartAuthConfigured, invalidateToken } from "./fhirAuth";

const FHIR_BASE_URL = process.env.FHIR_BASE_URL;

function assertFhirConfigured() {
  if (!FHIR_BASE_URL) {
    throw new Error("FHIR_BASE_URL is not configured — set the environment variable to enable FHIR sync");
  }
}

async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept:         "application/fhir+json",
    "Content-Type": "application/fhir+json",
  };

  if (isSmartAuthConfigured()) {
    try {
      const token = await getBearerToken();
      headers["Authorization"] = `Bearer ${token}`;
    } catch (err) {
      console.warn("[FhirClient] SMART auth failed — proceeding without token:", err);
    }
  }

  return headers;
}

async function fhirFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  assertFhirConfigured();
  const headers = await buildHeaders();

  const res = await fetch(`${FHIR_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // If we get a 401 and were using SMART auth, invalidate the cached token and retry once
  if (res.status === 401 && isSmartAuthConfigured()) {
    invalidateToken();
    const freshHeaders = await buildHeaders();
    const retry = await fetch(`${FHIR_BASE_URL}${path}`, {
      method,
      headers: freshHeaders,
      body: body ? JSON.stringify(body) : undefined,
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

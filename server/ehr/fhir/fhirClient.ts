const FHIR_BASE_URL = process.env.FHIR_BASE_URL;

function assertFhirConfigured() {
  if (!FHIR_BASE_URL) {
    throw new Error("FHIR_BASE_URL is not configured — set the environment variable to enable FHIR sync");
  }
}

async function fhirFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  assertFhirConfigured();
  const res = await fetch(`${FHIR_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/fhir+json",
      "Content-Type": "application/fhir+json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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

export function getOrCreateCorrelationId(): string {
  const key = 'auralyn_correlation_id';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  headers.set('x-correlation-id', getOrCreateCorrelationId());
  return fetch(input, { ...init, headers });
}

export type AdapterResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function safeFetch<T = unknown>(
  url: string,
  init: RequestInit
): Promise<AdapterResult<T>> {
  try {
    const res = await fetch(url, init);
    const txt = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${txt}` };
    try {
      return { ok: true, data: JSON.parse(txt) as T };
    } catch {
      return { ok: true, data: txt as unknown as T };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network_error" };
  }
}

export async function connectHospital(patient: unknown): Promise<AdapterResult> {
  const url   = process.env.HOSPITAL_API;
  const token = process.env.HOSPITAL_TOKEN;
  if (!url) return { ok: false, error: "HOSPITAL_API not configured" };
  return safeFetch(url, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patient),
  });
}

export async function connectPayer(claim: unknown): Promise<AdapterResult> {
  const url   = process.env.PAYER_API   ?? process.env.REAL_PAYER_API;
  const token = process.env.PAYER_TOKEN;
  if (!url) return { ok: false, error: "PAYER_API not configured" };
  return safeFetch(url, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(claim),
  });
}

export async function safeExternalWrite<T>(
  fn: () => Promise<AdapterResult<T>>,
  onFail: (err: string) => void
): Promise<AdapterResult<T>> {
  const r = await fn();
  if (!r.ok) onFail(r.error);
  return r;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${url}`);
  }
  return res.json();
}

export const reconciliationApi = {
  list(limit = 100) {
    return getJson<{ ok: boolean; rows: any[] }>(
      `/api/skill-layer/reconciliations?limit=${limit}`
    );
  },
};

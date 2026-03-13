async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const rolloutManagerApi = {
  getModes(siteId = "default") {
    return getJson<{ ok: boolean; result: any }>(
      `/api/platform/rollout-modes?siteId=${encodeURIComponent(siteId)}`
    );
  },
  setMode(payload: { siteId?: string; complaint: string; mode: string }) {
    return postJson<{ ok: boolean; result: any }>(
      "/api/platform/rollout-modes",
      payload
    );
  },
};

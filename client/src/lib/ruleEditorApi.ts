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

export const ruleEditorApi = {
  getMetadata() {
    return getJson<{ ok: boolean; result: Record<string, any> }>(
      "/api/platform/rule-governance-metadata"
    );
  },
  updateMetadata(payload: any) {
    return postJson<{ ok: boolean; result: any }>(
      "/api/platform/rule-governance-metadata",
      payload
    );
  },
};

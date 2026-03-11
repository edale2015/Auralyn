async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${url}`);
  }
  return res.json();
}

export const ruleGovernanceApi = {
  getSummary() {
    return getJson<{ ok: boolean; summary: any[] }>("/api/skill-layer/rule-governance");
  },
};

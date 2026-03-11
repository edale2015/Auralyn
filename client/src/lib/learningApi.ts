async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${url}`);
  }
  return res.json();
}

export const learningApi = {
  getDriftAlerts() {
    return getJson<{ ok: boolean; alerts: any[] }>("/api/skill-layer/drift-alerts");
  },
  getTuningSuggestions() {
    return getJson<{ ok: boolean; suggestions: any[] }>("/api/skill-layer/tuning-suggestions");
  },
};

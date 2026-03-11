async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${url}`);
  }
  return res.json();
}

export const caseReplayApi = {
  replayCompare(caseId: string, rawText?: string, complaintId?: string) {
    const params = new URLSearchParams();
    if (rawText) params.set("rawText", rawText);
    if (complaintId) params.set("complaintId", complaintId);
    const qs = params.toString();
    return getJson<{ ok: boolean; sequential: any; graph: any }>(
      `/api/skill-layer/cases/${encodeURIComponent(caseId)}/replay-compare${qs ? `?${qs}` : ""}`
    );
  },
};

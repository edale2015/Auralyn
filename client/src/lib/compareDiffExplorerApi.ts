async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const compareDiffExplorerApi = {
  query(params: {
    complaint?: string;
    sameDisposition?: boolean;
    sameComplaint?: boolean;
    limit?: number;
  }) {
    const qs = new URLSearchParams();
    if (params.complaint) qs.set("complaint", params.complaint);
    if (params.sameDisposition !== undefined)
      qs.set("sameDisposition", String(params.sameDisposition));
    if (params.sameComplaint !== undefined)
      qs.set("sameComplaint", String(params.sameComplaint));
    if (params.limit !== undefined) qs.set("limit", String(params.limit));

    return getJson<{ ok: boolean; result: any[] }>(
      `/api/platform/compare-diff-explorer?${qs.toString()}`
    );
  },
};

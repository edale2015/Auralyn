async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${url}`);
  }
  return res.json();
}

export const platformAdminApi = {
  getDeploymentReadiness() {
    return getJson<{ ok: boolean; result: any }>("/api/platform/deployment-readiness");
  },
  getReleaseGate(complaint: string, siteId = "default") {
    return getJson<{ ok: boolean; result: any }>(
      `/api/platform/release-gate/${encodeURIComponent(complaint)}?siteId=${encodeURIComponent(siteId)}`
    );
  },
  getReviewQueue() {
    return getJson<{ ok: boolean; queue: any[] }>("/api/platform/review-queue");
  },
  getConfig(siteId = "default") {
    return getJson<{ ok: boolean; config: any }>(
      `/api/platform/config?siteId=${encodeURIComponent(siteId)}`
    );
  },
  getTenantCases(siteId = "default") {
    return getJson<{ ok: boolean; rows: any[] }>(
      `/api/platform/tenant-cases?siteId=${encodeURIComponent(siteId)}`
    );
  },
  getCompareDiffs(limit = 100) {
    return getJson<{ ok: boolean; rows: any[] }>(
      `/api/platform/compare-diffs?limit=${limit}`
    );
  },
  getGraphMetrics() {
    return getJson<{ ok: boolean; result: any }>("/api/platform/graph-metrics");
  },
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${url}`);
  }
  return res.json();
}

export const platformApi = {
  getDeploymentReadiness() {
    return getJson<{ ok: boolean; result: any }>(
      "/api/platform/deployment-readiness"
    );
  },
  getReleaseGate(complaint: string, siteId = "default") {
    return getJson<{ ok: boolean; result: any }>(
      `/api/platform/release-gate/${encodeURIComponent(complaint)}?siteId=${siteId}`
    );
  },
  getReviewQueue() {
    return getJson<{ ok: boolean; queue: any[] }>("/api/platform/review-queue");
  },
  getPlatformConfig(siteId = "default") {
    return getJson<{ ok: boolean; config: any }>(
      `/api/platform/config?siteId=${siteId}`
    );
  },
  getTenantCases(siteId = "default", limit = 50) {
    return getJson<{ ok: boolean; records: any[] }>(
      `/api/platform/tenant-cases?siteId=${siteId}&limit=${limit}`
    );
  },
};

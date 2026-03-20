export interface RegionFetchOptions extends RequestInit {
  timeoutMs?: number;
}

async function fetchWithTimeout(url: string, options: RegionFetchOptions = {}): Promise<Response> {
  const { timeoutMs = 5000, ...fetchOpts } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export async function fetchWithFailover(urls: string[], options: RegionFetchOptions = {}): Promise<Response> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, options);
      if (res.ok) return res;
      errors.push(`${url} → HTTP ${res.status}`);
    } catch (e: any) {
      console.warn(`[MultiRegionFetch] Region failed: ${url} — ${e?.message}`);
      errors.push(`${url} → ${e?.message}`);
    }
  }
  throw new Error(`All regions failed: ${errors.join("; ")}`);
}

export async function fetchPrimary(path: string, options: RegionFetchOptions = {}): Promise<Response> {
  const primaryUrl = process.env.PRIMARY_API_URL;
  const secondaryUrl = process.env.SECONDARY_API_URL;
  const urls = [primaryUrl, secondaryUrl].filter(Boolean).map((base) => `${base}${path}`);
  if (urls.length === 0) throw new Error("[MultiRegionFetch] No API URLs configured");
  return fetchWithFailover(urls, options);
}

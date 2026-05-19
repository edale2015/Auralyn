/**
 * I001 — Shared HTTP fetch client for all public data sources.
 * Features: exponential backoff on 429, 30s timeout, per-call audit logging,
 * telemetry event emission.
 */

import { logFetch, hashPayload } from "../auditLog";
import type { AuthConfig, RateLimitConfig } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES        = 4;

export interface FetchOptions {
  source:    string;
  params?:   Record<string, string | number | boolean | undefined>;
  auth?:     AuthConfig;
  rateLimit?: RateLimitConfig;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchOptions,
): Promise<T> {
  const fullUrl = buildUrl(url, opts.params);
  const headers: Record<string, string> = {
    "Accept":     "application/json",
    "User-Agent": "Auralyn-Clinical-Ingestor/1.0 (clinical@auralyn.ai)",
  };
  if (opts.auth) {
    headers[opts.auth.header] = opts.auth.value;
  }

  let attempt    = 0;
  let lastError: Error | null = null;

  while (attempt < MAX_RETRIES) {
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      const resp = await fetch(fullUrl, { headers, signal: controller.signal });
      clearTimeout(timer);

      const durationMs = Date.now() - t0;

      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get("Retry-After") ?? "5", 10);
        const backoff    = Math.min(retryAfter * 1000, 60_000) * (2 ** attempt);
        await logFetch({ sourceId: opts.source, url: fullUrl, httpStatus: 429, durationMs });
        await sleep(backoff);
        attempt++;
        continue;
      }

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        await logFetch({
          sourceId: opts.source, url: fullUrl,
          httpStatus: resp.status, durationMs,
          error: `HTTP ${resp.status}: ${errText.slice(0, 200)}`,
        });
        throw new Error(`HTTP ${resp.status} from ${opts.source}: ${errText.slice(0, 200)}`);
      }

      const raw  = await resp.json() as T;
      const { hash, bytes } = hashPayload(raw);

      await logFetch({
        sourceId: opts.source, url: fullUrl,
        httpStatus: resp.status, durationMs,
        payloadHash: hash, payloadBytes: bytes,
      });

      return raw;

    } catch (err: any) {
      lastError    = err;
      const durationMs = Date.now() - t0;

      if (err?.name === "AbortError") {
        await logFetch({ sourceId: opts.source, url: fullUrl, durationMs, error: "timeout" });
        throw new Error(`Timeout fetching ${opts.source} after ${DEFAULT_TIMEOUT_MS}ms`);
      }

      if (attempt < MAX_RETRIES - 1) {
        await sleep(1000 * 2 ** attempt);
        attempt++;
        continue;
      }

      await logFetch({ sourceId: opts.source, url: fullUrl, durationMs, error: err?.message });
      throw err;
    }
  }

  throw lastError ?? new Error(`Failed to fetch from ${opts.source} after ${MAX_RETRIES} attempts`);
}

function buildUrl(base: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return base;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

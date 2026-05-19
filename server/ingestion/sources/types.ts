/**
 * I001 — Public ingestion framework types.
 * Every public data source implements PublicDataSource.
 * No source-specific code belongs here.
 */

export interface RateLimitConfig {
  requests:   number;
  perSeconds: number;
}

export interface AuthConfig {
  type:   "api_key" | "bearer";
  header: string;
  value:  string;
}

/** Shape that writeGlobalGuideline accepts */
export interface MemoryEntryDraft {
  key:        string;
  scope:      "global";
  content:    string;
  confidence: number;
  verifiedBy: "external_guideline";
  source:     string;
  metadata?:  Record<string, unknown>;
}

export interface RawPayload {
  [key: string]: unknown;
}

export interface FetchQuery {
  [key: string]: string | number | boolean | undefined;
}

/** Every public data source implements this interface. */
export interface PublicDataSource {
  /** Stable identifier used in audit logs — never change after creation */
  id:         string;
  name:       string;
  baseUrl:    string;
  rateLimit:  RateLimitConfig;
  auth?:      AuthConfig;

  fetch(query: FetchQuery): Promise<RawPayload>;
  normalize(raw: RawPayload): MemoryEntryDraft[];
}

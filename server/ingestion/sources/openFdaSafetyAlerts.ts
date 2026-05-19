/**
 * I003 — openFDA drug safety communications source.
 * Fetches FDA Drug Safety Communications from the last 90 days.
 * Free public API — https://api.fda.gov/drug/label.json (safety section)
 * and https://api.fda.gov/drug/drugsfda.json for safety communications.
 */

import type { PublicDataSource, RawPayload, FetchQuery, MemoryEntryDraft } from "./types";
import { fetchJson } from "./fetchClient";
import { buildEntry, toKeySlug } from "../normalize";

// FDA safety communications via openFDA adverse events + drug labels
const OPENFDA_LABEL_URL = "https://api.fda.gov/drug/label.json";

export const openFdaSafetyAlerts: PublicDataSource = {
  id:        "openfda_safety_alerts",
  name:      "openFDA Drug Safety Alerts",
  baseUrl:   "https://api.fda.gov",
  rateLimit: { requests: 240, perSeconds: 60 },
  auth:      undefined,

  async fetch(_query: FetchQuery): Promise<RawPayload> {
    // Fetch labels updated in the last 90 days with boxed warnings
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().slice(0, 10).replace(/-/g, "");

    const data = await fetchJson<{ results?: unknown[] }>(OPENFDA_LABEL_URL, {
      source: "openfda_safety_alerts",
      params: {
        search: `effective_time:[${dateStr}+TO+99991231]+AND+_exists_:boxed_warning`,
        limit: 50,
      },
    });

    return { results: data?.results ?? [], fetchedAt: new Date().toISOString() };
  },

  normalize(raw: RawPayload): MemoryEntryDraft[] {
    const results = (raw.results as any[]) ?? [];
    const entries: MemoryEntryDraft[] = [];

    for (const row of results) {
      const setId    = String(row.set_id ?? row.id ?? "").trim();
      const drugs    = (row.openfda?.brand_name ?? row.openfda?.generic_name ?? []) as string[];
      const drugName = drugs[0] ?? "Unknown drug";
      const rxcuis   = (row.openfda?.rxcui ?? []) as string[];
      const rxcui    = rxcuis[0] ?? toKeySlug(drugName);

      const boxedWarning = Array.isArray(row.boxed_warning)
        ? row.boxed_warning[0] as string
        : String(row.boxed_warning ?? "");

      if (!setId || !boxedWarning) continue;

      const alertId = toKeySlug(setId.slice(0, 20));
      const key = `safety:drug_alert:${alertId}`;

      entries.push(buildEntry({
        key,
        content:
          `FDA Boxed Warning — ${drugName}: ${boxedWarning.slice(0, 600)} ` +
          `When prescribing or reviewing this medication, consult the full FDA label ` +
          `and ensure the warning is addressed in the clinical plan.`,
        source: `openFDA Drug Label (effective ${row.effective_time ?? "unknown"})`,
        confidence: 0.99,
        metadata: {
          setId, drugName, rxcui, rxcuis,
          effectiveTime: row.effective_time,
        },
      }));
    }

    return entries;
  },
};

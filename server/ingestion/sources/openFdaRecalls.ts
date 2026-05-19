/**
 * I003 — openFDA drug enforcement (recall) source.
 * Free public API — no key required for basic use.
 * https://api.fda.gov/drug/enforcement.json
 */

import type { PublicDataSource, RawPayload, FetchQuery, MemoryEntryDraft } from "./types";
import { fetchJson } from "./fetchClient";
import { buildEntry, toKeySlug } from "../normalize";

const OPENFDA_RECALL_URL = "https://api.fda.gov/drug/enforcement.json";

export const openFdaRecalls: PublicDataSource = {
  id:        "openfda_recalls",
  name:      "openFDA Drug Recalls",
  baseUrl:   "https://api.fda.gov",
  rateLimit: { requests: 240, perSeconds: 60 },
  auth:      undefined,

  async fetch(_query: FetchQuery): Promise<RawPayload> {
    // Last 30 days of class I + II drug recalls
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().slice(0, 10).replace(/-/g, "");

    const data = await fetchJson<{ results?: unknown[] }>(OPENFDA_RECALL_URL, {
      source: "openfda_recalls",
      params: {
        search: `report_date:[${dateStr}+TO+99991231]+AND+classification:[Class+I+Class+II]`,
        limit: 100,
      },
    });

    return { results: data?.results ?? [], fetchedAt: new Date().toISOString() };
  },

  normalize(raw: RawPayload): MemoryEntryDraft[] {
    const results = (raw.results as any[]) ?? [];
    const entries: MemoryEntryDraft[] = [];

    for (const row of results) {
      const recallId  = String(row.recall_number ?? row.event_id ?? "").trim();
      const drugName  = String(row.product_description ?? row.brand_name_base ?? "").trim();
      const reason    = String(row.reason_for_recall ?? "").trim();
      const status    = String(row.status ?? "").trim();
      const recallClass = String(row.classification ?? "").trim();

      if (!recallId || !drugName) continue;

      // Extract RxCUI from openfda sub-object if present
      const rxcuis: string[] = row.openfda?.rxcui ?? [];
      const rxcui = rxcuis[0] ?? toKeySlug(drugName);

      const key = `safety:drug_recall:${rxcui}:${toKeySlug(recallId)}`;

      entries.push(buildEntry({
        key,
        content:
          `FDA Drug Recall (${recallClass}) — ${drugName}: ${reason}. ` +
          `Recall #${recallId}, Status: ${status}. ` +
          `When this drug appears in a patient's medication list, flag this recall ` +
          `during medication review and disposition planning.`,
        source: `openFDA Drug Enforcement ${row.report_date ?? ""}`,
        confidence: 0.99,
        metadata: {
          recallId, drugName, recallClass, status, reason: reason.slice(0, 300),
          rxcuis, reportDate: row.report_date,
        },
      }));
    }

    return entries;
  },
};

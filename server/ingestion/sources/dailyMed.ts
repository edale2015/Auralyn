/**
 * I004 — DailyMed structured drug labeling source.
 * NIH NLM DailyMed API — free, no auth required.
 * https://dailymed.nlm.nih.gov/dailymed/services
 *
 * On-demand (not scheduled) — triggered per drug as needed.
 */

import type { PublicDataSource, RawPayload, FetchQuery, MemoryEntryDraft } from "./types";
import { fetchJson } from "./fetchClient";
import { buildEntry, toKeySlug } from "../normalize";

const DAILYMED_SPL_URL  = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json";
const DAILYMED_DRUG_URL = "https://dailymed.nlm.nih.gov/dailymed/services/v2/drugnames.json";

export const dailyMed: PublicDataSource = {
  id:        "dailymed",
  name:      "DailyMed SPL",
  baseUrl:   "https://dailymed.nlm.nih.gov",
  rateLimit: { requests: 100, perSeconds: 60 },
  auth:      undefined,

  async fetch(query: FetchQuery): Promise<RawPayload> {
    const drugName = String(query.drugName ?? query.rxcui ?? "").trim();
    if (!drugName) throw new Error("DailyMed fetch requires drugName or rxcui");

    // Search for matching SPLs
    const search = await fetchJson<{ data?: unknown[] }>(DAILYMED_DRUG_URL, {
      source: "dailymed",
      params: { drug_name: drugName },
    });

    const results = search?.data ?? [];
    if (!Array.isArray(results) || results.length === 0) {
      return { results: [], drugName, fetchedAt: new Date().toISOString() };
    }

    // Take the first (most relevant) result's setid
    const firstResult = results[0] as any;
    const setId = String(firstResult?.setid ?? firstResult?.spl_id ?? "").trim();
    if (!setId) return { results: [], drugName, fetchedAt: new Date().toISOString() };

    const detail = await fetchJson<{ data?: unknown }>(
      `${DAILYMED_SPL_URL}/${setId}`, {
        source: "dailymed",
      }
    ).catch(() => ({ data: null }));

    return {
      results: [{ ...firstResult, detail: (detail as any)?.data ?? null }],
      drugName,
      setId,
      fetchedAt: new Date().toISOString(),
    };
  },

  normalize(raw: RawPayload): MemoryEntryDraft[] {
    const results  = (raw.results as any[]) ?? [];
    const drugName = String(raw.drugName ?? "").trim();
    const entries: MemoryEntryDraft[] = [];

    for (const row of results) {
      const setId   = String(row.setid ?? row.spl_id ?? "").trim();
      const name    = String(row.drug_name ?? row.title ?? drugName).trim();
      const rxcui   = String(row.rxcui ?? toKeySlug(name)).trim();
      const version = String(row.spl_version ?? row.version ?? "1").trim();

      const detail = row.detail as any;
      const indications       = detail?.indications_and_usage?.[0]     ?? "";
      const contraindications = detail?.contraindications?.[0]          ?? "";
      const warnings          = detail?.warnings_and_cautions?.[0]      ?? detail?.warnings?.[0] ?? "";
      const dosage            = detail?.dosage_and_administration?.[0]  ?? "";
      const interactions      = detail?.drug_interactions?.[0]          ?? "";

      const key = `labeling:drug:${rxcui}`;

      const contentParts = [
        `DailyMed SPL — ${name} (RxCUI: ${rxcui}, version ${version}).`,
        indications       ? `Indications: ${indications.slice(0, 300)}` : "",
        contraindications ? `Contraindications: ${contraindications.slice(0, 300)}` : "",
        warnings          ? `Warnings: ${warnings.slice(0, 300)}` : "",
        dosage            ? `Dosage: ${dosage.slice(0, 200)}` : "",
        interactions      ? `Drug interactions: ${interactions.slice(0, 200)}` : "",
      ].filter(Boolean).join(" ");

      entries.push(buildEntry({
        key,
        content: contentParts,
        source: `DailyMed SPL setid:${setId} v${version}`,
        confidence: 0.96,
        metadata: { setId, rxcui, name, version, splVersion: version },
      }));
    }

    return entries;
  },
};

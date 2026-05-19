/**
 * I005 — USPSTF preventive recommendations source.
 * USPSTF API — free, no auth required.
 * https://www.uspreventiveservicestaskforce.org/apps/api/uspstf
 */

import type { PublicDataSource, RawPayload, FetchQuery, MemoryEntryDraft } from "./types";
import { fetchJson } from "./fetchClient";
import { buildEntry, toKeySlug } from "../normalize";

const USPSTF_API_URL = "https://www.uspreventiveservicestaskforce.org/apps/api/json/getAllRecommendationFinal";

export const uspstf: PublicDataSource = {
  id:        "uspstf",
  name:      "USPSTF Preventive Recommendations",
  baseUrl:   "https://www.uspreventiveservicestaskforce.org",
  rateLimit: { requests: 60, perSeconds: 60 },
  auth:      undefined,

  async fetch(_query: FetchQuery): Promise<RawPayload> {
    const data = await fetchJson<unknown>(USPSTF_API_URL, {
      source: "uspstf",
    });

    // USPSTF API returns either array directly or { recs: [...] }
    const recs = Array.isArray(data)
      ? data
      : (data as any)?.uspstf ?? (data as any)?.recs ?? (data as any)?.recommendations ?? [];

    return { results: recs, fetchedAt: new Date().toISOString() };
  },

  normalize(raw: RawPayload): MemoryEntryDraft[] {
    const results = (raw.results as any[]) ?? [];
    const entries: MemoryEntryDraft[] = [];

    for (const rec of results) {
      // Only surface A/B/C-rated recommendations (actionable)
      const grade = String(rec.grade ?? rec.uspstfGrade ?? rec.letterGrade ?? "").toUpperCase().trim();
      if (!["A", "B", "C"].includes(grade)) continue;

      const topicId = String(rec.topicId ?? rec.id ?? rec.topic_id ?? "").trim();
      const title   = String(rec.title ?? rec.topicTitle ?? rec.topic ?? "").trim();
      if (!topicId || !title) continue;

      const key = `preventive:uspstf:${toKeySlug(topicId ?? title)}`;

      // Extract population criteria
      const population   = String(rec.population ?? rec.targetPop ?? rec.target ?? "").trim();
      const ageRange     = String(rec.ageRange ?? rec.age ?? "").trim();
      const sexFilter    = String(rec.sex ?? rec.gender ?? rec.applicableSex ?? "").trim();
      const intervention = String(rec.interventionText ?? rec.riskText ?? rec.recommendation ?? "").trim();

      const contentParts = [
        `USPSTF Grade ${grade} Recommendation — ${title}.`,
        population   ? `Population: ${population}.` : "",
        ageRange     ? `Age range: ${ageRange}.` : "",
        sexFilter    ? `Applies to: ${sexFilter}.` : "",
        intervention ? `Recommendation: ${intervention.slice(0, 500)}` : "",
        `When patient demographics match this population, include this preventive ` +
          `recommendation in the disposition note (PCP follow-up section).`,
      ].filter(Boolean).join(" ");

      entries.push(buildEntry({
        key,
        content: contentParts,
        source: `USPSTF Recommendation (Grade ${grade})`,
        confidence: 0.97,
        metadata: {
          topicId, title, grade, population, ageRange, sexFilter,
          url: rec.url ?? rec.topicUrl ?? "",
        },
      }));
    }

    return entries;
  },
};

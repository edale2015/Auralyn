/**
 * I002 — CDC respiratory surveillance source.
 * Fetches FluView ILI activity levels by state from CDC Open Data (Socrata API).
 * Free, no auth required. Public domain.
 */

import type { PublicDataSource, RawPayload, FetchQuery, MemoryEntryDraft } from "./types";
import { fetchJson } from "./fetchClient";
import { buildEntry, isoWeek, toKeySlug } from "../normalize";

// CDC Open Data — ILI activity level by state
// Dataset: ikwk-8lvh (ILINet activity indicators)
const CDC_FLUVIEW_URL =
  "https://data.cdc.gov/resource/ikwk-8lvh.json";

// RSV-NET hospitalizations
const CDC_RSV_URL =
  "https://data.cdc.gov/resource/29hc-w46k.json";

export const cdcRespiratory: PublicDataSource = {
  id:        "cdc_respiratory",
  name:      "CDC Respiratory Surveillance",
  baseUrl:   "https://data.cdc.gov",
  rateLimit: { requests: 100, perSeconds: 60 },
  auth:      undefined,

  async fetch(query: FetchQuery): Promise<RawPayload> {
    const limit = 200;
    const [fluRows, rsvRows] = await Promise.allSettled([
      fetchJson<unknown[]>(CDC_FLUVIEW_URL, {
        source: "cdc_respiratory",
        params: { "$limit": limit, "$order": "week_start DESC" },
      }),
      fetchJson<unknown[]>(CDC_RSV_URL, {
        source: "cdc_respiratory",
        params: { "$limit": 50, "$order": "mmwr_week DESC" },
      }),
    ]);

    return {
      flu: fluRows.status === "fulfilled" ? fluRows.value : [],
      rsv: rsvRows.status === "fulfilled" ? rsvRows.value : [],
      fetchedWeek: query.week ?? isoWeek(),
    };
  },

  normalize(raw: RawPayload): MemoryEntryDraft[] {
    const entries: MemoryEntryDraft[] = [];
    const week = String(raw.fetchedWeek ?? isoWeek());

    // --- FluView ILI state activity ---
    const fluRows = (raw.flu as any[]) ?? [];
    const seenFlu = new Set<string>();

    for (const row of fluRows) {
      const state = String(row.statename ?? row.region ?? "").trim();
      if (!state || state === "Region") continue;

      const stateSlug = toKeySlug(state);
      const activityLevel = String(
        row.activity_level_label ?? row.activity_level ?? row.activitylevel ?? "Unknown"
      ).trim();

      const key = `surveillance:respiratory:${stateSlug}:${week}`;
      if (seenFlu.has(key)) continue;
      seenFlu.add(key);

      const content =
        `CDC FluView — ${state}: Influenza activity level is "${activityLevel}" ` +
        `for week ${week}. When flu activity is High or Very High in a patient's ` +
        `region, increase differential weighting for influenza and tighten ` +
        `disposition threshold for ED referral in respiratory complaints.`;

      entries.push(buildEntry({
        key,
        content,
        source: `CDC FluView ILINet ${week}`,
        confidence: 0.97,
        metadata: { state, activityLevel, week, dataset: "ILINet" },
      }));
    }

    // --- RSV sentinel ---
    const rsvRows = (raw.rsv as any[]) ?? [];
    const seenRsv = new Set<string>();

    for (const row of rsvRows) {
      const state    = String(row.state ?? row.site ?? "").trim();
      const ageGroup = String(row.age_category ?? row.age ?? "overall").trim();
      if (!state) continue;

      const stateSlug = toKeySlug(state);
      const key = `surveillance:rsv:${stateSlug}:${toKeySlug(ageGroup)}:${week}`;
      if (seenRsv.has(key)) continue;
      seenRsv.add(key);

      const rate = row.rate ?? row.cumulative_rate ?? "N/A";

      entries.push(buildEntry({
        key,
        content:
          `CDC RSV-NET — ${state} (${ageGroup}): hospitalization rate ${rate} per 100,000 ` +
          `for week ${week}. Elevated RSV activity warrants higher suspicion in ` +
          `patients with cough, wheeze, or respiratory distress, especially infants and elderly.`,
        source: `CDC RSV-NET ${week}`,
        confidence: 0.95,
        metadata: { state, ageGroup, rate, week, dataset: "RSV-NET" },
      }));
    }

    return entries;
  },
};

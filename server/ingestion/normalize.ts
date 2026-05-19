/**
 * I001 — Normalization utilities.
 * Shared helpers for mapping source-specific payloads into MemoryEntryDraft
 * shape that writeGlobalGuideline accepts.
 */

import type { MemoryEntryDraft } from "./sources/types";

/** Truncate content to a safe length for clinical_memory */
export function truncate(text: string, maxLen = 1200): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/** Slugify a free-text string for use in memory keys */
export function toKeySlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

/** Build a global MemoryEntryDraft with required fields populated */
export function buildEntry(opts: {
  key:        string;
  content:    string;
  source:     string;
  confidence?: number;
  metadata?:  Record<string, unknown>;
}): MemoryEntryDraft {
  return {
    key:        opts.key,
    scope:      "global",
    content:    truncate(opts.content),
    confidence: opts.confidence ?? 0.95,
    verifiedBy: "external_guideline",
    source:     opts.source,
    metadata:   opts.metadata,
  };
}

/** ISO week string e.g. "2026-W20" from a Date */
export function isoWeek(date: Date = new Date()): string {
  const d    = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day  = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

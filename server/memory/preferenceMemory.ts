/**
 * Physician & Patient Preference Memory (Claude-Mem equivalent)
 *
 * Article: "Memory Bank creates a .memory folder that stores user preferences,
 *  project details, past decisions, coding standards. You explain once.
 *  Claude remembers forever."
 *
 * Clinical translation:
 *   Two memory scopes, permanently separate:
 *
 *   1. PHYSICIAN preferences — per-provider clinical working style, persisted
 *      across all their patients:
 *        "Dr. Smith: prefer narrow-spectrum antibiotics unless culture-confirmed"
 *        "Dr. Jones: always order troponin on any chest pain over 40y"
 *
 *   2. PATIENT standing memory — facts about a specific patient that must
 *      survive across every visit, session, and encounter:
 *        "Patient #P001: penicillin allergy — anaphylaxis 2019"
 *        "Patient #P001: declines IV contrast — claustrophobia"
 *        "Patient #P001: DNR/DNI on file — verified 2025-11-01"
 *
 * These are NOT case similarity records (that's cognitiveMemory.ts).
 * These are standing instructions and facts — always injected into context.
 *
 * Storage: in-memory Map (Redis-upgradeable — same pattern as cognitiveMemory.ts).
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PreferenceScope = "physician" | "patient" | "institution";
export type PreferenceCategory =
  | "antibiotic_stewardship"
  | "diagnostic_threshold"
  | "communication"
  | "safety"
  | "imaging"
  | "labs"
  | "disposition"
  | "allergy"
  | "advanced_directive"
  | "general";

export interface PreferenceEntry {
  id:          string;
  scope:       PreferenceScope;
  ownerId:     string;    // physicianId or patientId or "institution"
  category:    PreferenceCategory;
  key:         string;    // short machine-readable key, e.g. "antibiotic_first_line"
  value:       string;    // human-readable preference statement
  confidence:  number;    // 0–1, how firmly to apply (1 = always, 0.5 = prefer)
  tags:        string[];
  source:      "physician_explicit" | "patient_explicit" | "inferred" | "protocol";
  createdAt:   string;
  updatedAt:   string;
  expiresAt?:  string;    // optional TTL for temporary overrides
}

// ── Store ─────────────────────────────────────────────────────────────────────

const _store = new Map<string, PreferenceEntry[]>();   // key: `${scope}:${ownerId}`

function _key(scope: PreferenceScope, ownerId: string): string {
  return `${scope}:${ownerId}`;
}

function _now(): string { return new Date().toISOString(); }

// ── Write operations ──────────────────────────────────────────────────────────

/**
 * Store a preference (upsert by key within scope+owner).
 * Calling this twice with the same key updates the existing entry.
 */
export function remember(
  scope:    PreferenceScope,
  ownerId:  string,
  entry: Omit<PreferenceEntry, "id" | "scope" | "ownerId" | "createdAt" | "updatedAt">
): PreferenceEntry {
  const storeKey = _key(scope, ownerId);
  if (!_store.has(storeKey)) _store.set(storeKey, []);
  const list = _store.get(storeKey)!;

  // Upsert by preference key
  const existing = list.findIndex((e) => e.key === entry.key);
  const now = _now();
  const full: PreferenceEntry = {
    id:        randomUUID().slice(0, 8),
    scope,
    ownerId,
    createdAt: existing >= 0 ? list[existing].createdAt : now,
    updatedAt: now,
    ...entry,
  };

  if (existing >= 0) {
    list[existing] = full;
  } else {
    list.push(full);
  }
  return full;
}

/** Remove a specific preference by key */
export function forget(scope: PreferenceScope, ownerId: string, key: string): boolean {
  const list = _store.get(_key(scope, ownerId));
  if (!list) return false;
  const before = list.length;
  const filtered = list.filter((e) => e.key !== key);
  _store.set(_key(scope, ownerId), filtered);
  return filtered.length < before;
}

// ── Read operations ───────────────────────────────────────────────────────────

/** Retrieve all preferences for a scope+owner */
export function recall(
  scope:    PreferenceScope,
  ownerId:  string,
  filters?: { category?: PreferenceCategory; tags?: string[]; minConfidence?: number }
): PreferenceEntry[] {
  const list = _store.get(_key(scope, ownerId)) ?? [];
  const now  = new Date();

  return list.filter((e) => {
    if (e.expiresAt && new Date(e.expiresAt) < now) return false;
    if (filters?.category && e.category !== filters.category) return false;
    if (filters?.minConfidence !== undefined && e.confidence < filters.minConfidence) return false;
    if (filters?.tags?.length && !filters.tags.some((t) => e.tags.includes(t))) return false;
    return true;
  });
}

/** Retrieve a single preference by key */
export function recallOne(scope: PreferenceScope, ownerId: string, key: string): PreferenceEntry | null {
  return _store.get(_key(scope, ownerId))?.find((e) => e.key === key) ?? null;
}

/**
 * Compose a context injection string — the full memory block injected into
 * the agent's prompt before processing (the article's "Claude remembers" effect).
 */
export function composeMemoryContext(
  physicianId: string,
  patientId:   string,
  minConfidence = 0.5
): string {
  const physicianPrefs = recall("physician",    physicianId, { minConfidence });
  const patientPrefs   = recall("patient",      patientId,   { minConfidence });
  const institutionRules = recall("institution","global",     { minConfidence });

  const lines: string[] = ["## Standing Clinical Memory"];

  if (institutionRules.length > 0) {
    lines.push("\n### Institution Protocols");
    for (const p of institutionRules) lines.push(`  • [${p.category}] ${p.value}`);
  }

  if (physicianPrefs.length > 0) {
    lines.push(`\n### Physician Preferences (${physicianId})`);
    for (const p of physicianPrefs) {
      const conf = p.confidence >= 0.9 ? "ALWAYS" : p.confidence >= 0.7 ? "PREFER" : "CONSIDER";
      lines.push(`  • [${conf}][${p.category}] ${p.value}`);
    }
  }

  if (patientPrefs.length > 0) {
    lines.push(`\n### Patient Standing Orders (${patientId})`);
    for (const p of patientPrefs) {
      const marker = p.category === "allergy" ? "⚠ ALLERGY" :
                     p.category === "advanced_directive" ? "⚑ DIRECTIVE" : "•";
      lines.push(`  ${marker} [${p.category}] ${p.value}`);
    }
  }

  if (physicianPrefs.length + patientPrefs.length + institutionRules.length === 0) {
    lines.push("  (no standing memory for this physician/patient pair)");
  }

  return lines.join("\n");
}

/** List all owners for a given scope */
export function listOwners(scope: PreferenceScope): string[] {
  return [..._store.keys()]
    .filter((k) => k.startsWith(`${scope}:`))
    .map((k) => k.slice(scope.length + 1));
}

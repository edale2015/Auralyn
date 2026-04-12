/**
 * Clinical Context Compression — 3-tier (upgraded from 2-tier)
 *
 * TIER 1 — Active Window:   last ACTIVE_WINDOW turns, full fidelity
 * TIER 2 — Rolling Summary: middle section compressed into a structured block
 * TIER 3 — Archive:         oldest summaries stored and retrievable on-demand
 *
 * Original 2-tier API (compressContext / compressClinicalContext / buildClinicalSummary)
 * is preserved for backward compatibility.
 *
 * Why 3-tier matters:
 *   Claude Code operates at ~92% context utilisation before compressing.
 *   Clinical sessions can run 50+ turns (vitals, scoring, questions, results).
 *   Without tiered compression, either fidelity is lost (everything summarised)
 *   or context overflows (nothing compressed). 3-tier solves both.
 */

import { createHash } from "crypto";

export interface ClinicalMessage {
  role:    "system" | "user" | "assistant" | "tool";
  content: string | unknown;
}

export interface ClinicalSummary {
  chief_complaint: string | null;
  key_symptoms:    string[];
  red_flags:       string[];
  negatives:       string[];
  timeline:        string | null;
  positives:       string[];
}

// ── Tunable thresholds ────────────────────────────────────────────────────────
const COMPRESSION_THRESHOLD = 20;   // 2-tier compat threshold
const ACTIVE_WINDOW         = 10;   // Tier 1: always keep latest N turns
const ROLLING_WINDOW        = 30;   // Tier 2: summarise turns between 10–30
const ARCHIVE_TRIGGER       = 40;   // Tier 3: archive when history exceeds this

// ── Archive store (in-memory; upgrade to Redis/DB for persistence) ────────────
export interface ArchiveEntry {
  archiveId:   string;
  sessionId?:  string;
  summary:     ClinicalSummary;
  turnRange:   [number, number];  // [startIdx, endIdx] of original messages
  archivedAt:  string;
  hash:        string;            // SHA-256 of archived content for integrity
  turnCount:   number;
}

const _archive: ArchiveEntry[] = [];

// ── Extraction helpers (unchanged from 2-tier) ────────────────────────────────
const RED_FLAG_KEYWORDS = [
  "stridor", "drooling", "unable_to_swallow", "respiratory_distress",
  "altered_mental_status", "trismus", "neck_stiffness", "red_flag",
  "emergency", "911", "severe", "peritonsillar",
];

const SYMPTOM_KEYWORDS = [
  "fever", "cough", "exudate", "sore throat", "nodes", "rash",
  "dysphagia", "odynophagia", "fatigue", "myalgia",
];

function extractField(messages: ClinicalMessage[], key: string): string | null {
  for (const m of messages) {
    if (typeof m.content !== "string") continue;
    const lower = m.content.toLowerCase();
    if (lower.includes(key.replace("_", " ")) || lower.includes(key)) {
      const match = m.content.match(new RegExp(`${key}[:\\s]+([^.\\n]+)`, "i"));
      if (match) return match[1].trim();
    }
  }
  return null;
}

function extractList(messages: ClinicalMessage[], keywords: string[]): string[] {
  const found: string[] = [];
  for (const m of messages) {
    if (typeof m.content !== "string") continue;
    for (const kw of keywords) {
      const kwNorm = kw.toLowerCase().replace(/_/g, " ");
      if (m.content.toLowerCase().includes(kwNorm)) found.push(kw);
    }
  }
  return [...new Set(found)];
}

export function buildClinicalSummary(messages: ClinicalMessage[]): ClinicalSummary {
  return {
    chief_complaint: extractField(messages, "complaint") ?? extractField(messages, "chief"),
    key_symptoms:    extractList(messages, SYMPTOM_KEYWORDS),
    red_flags:       extractList(messages, RED_FLAG_KEYWORDS),
    negatives:       extractList(messages, ["no ", "denies", "without", "absent"]),
    positives:       extractList(messages, ["yes", "positive", "present", "confirmed"]),
    timeline:        extractField(messages, "onset") ?? extractField(messages, "duration"),
  };
}

// ── 2-tier API (backward compat) ──────────────────────────────────────────────
export function compressClinicalContext(messages: ClinicalMessage[]): ClinicalMessage[] {
  if (messages.length < COMPRESSION_THRESHOLD) return messages;
  const summary = buildClinicalSummary(messages);
  return [
    { role: "system", content: `[CLINICAL SUMMARY — auto-compressed]\n${JSON.stringify(summary, null, 2)}` },
    ...messages.slice(-6),
  ];
}

export function compressContext(messages: ClinicalMessage[]): ClinicalMessage[] {
  return compressClinicalContext(messages);
}

// ── 3-tier implementation ─────────────────────────────────────────────────────

export interface ThreeTierResult {
  tier:         1 | 2 | 3;
  messages:     ClinicalMessage[];     // messages to pass to the model
  tier2Summary: ClinicalSummary | null;
  archived:     ArchiveEntry | null;   // only set when Tier 3 triggered
  stats: {
    totalInput:  number;
    activeKept:  number;
    summarised:  number;
    archived:    number;
  };
}

function archiveMessages(
  messages: ClinicalMessage[],
  startIdx:  number,
  endIdx:    number,
  sessionId?: string
): ArchiveEntry {
  const slice   = messages.slice(startIdx, endIdx);
  const payload = JSON.stringify(slice);
  const entry: ArchiveEntry = {
    archiveId:  `ARC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    sessionId,
    summary:    buildClinicalSummary(slice),
    turnRange:  [startIdx, endIdx],
    archivedAt: new Date().toISOString(),
    hash:       createHash("sha256").update(payload).digest("hex"),
    turnCount:  slice.length,
  };
  _archive.push(entry);
  return entry;
}

export function compressThreeTier(
  messages:   ClinicalMessage[],
  sessionId?: string
): ThreeTierResult {
  const total = messages.length;

  // ── Tier 1: history is short, no compression needed ───────────────────────
  if (total <= ACTIVE_WINDOW) {
    return {
      tier: 1, messages, tier2Summary: null, archived: null,
      stats: { totalInput: total, activeKept: total, summarised: 0, archived: 0 },
    };
  }

  // ── Tier 2: summarise middle section, keep active window ──────────────────
  if (total <= ARCHIVE_TRIGGER) {
    const activeStart  = Math.max(0, total - ACTIVE_WINDOW);
    const middleSlice  = messages.slice(0, activeStart);
    const activeSlice  = messages.slice(activeStart);
    const tier2Summary = buildClinicalSummary(middleSlice);

    const summaryBlock: ClinicalMessage = {
      role:    "system",
      content: `[TIER-2 ROLLING SUMMARY — ${middleSlice.length} turns compressed]\n${JSON.stringify(tier2Summary, null, 2)}`,
    };

    return {
      tier: 2,
      messages:     [summaryBlock, ...activeSlice],
      tier2Summary,
      archived:     null,
      stats: { totalInput: total, activeKept: activeSlice.length, summarised: middleSlice.length, archived: 0 },
    };
  }

  // ── Tier 3: archive oldest, summarise middle, keep active window ──────────
  const activeStart  = Math.max(0, total - ACTIVE_WINDOW);
  const middleStart  = Math.max(0, activeStart - ROLLING_WINDOW);

  const archiveSlice = messages.slice(0, middleStart);
  const middleSlice  = messages.slice(middleStart, activeStart);
  const activeSlice  = messages.slice(activeStart);

  // Archive the oldest section
  const archived = archiveSlice.length > 0
    ? archiveMessages(messages, 0, middleStart, sessionId)
    : null;

  // Summarise the middle section
  const tier2Summary = buildClinicalSummary(middleSlice);

  const archiveRef: ClinicalMessage = archived
    ? { role: "system", content: `[TIER-3 ARCHIVE — ${archived.turnCount} turns archived | id=${archived.archiveId} | retrievable]` }
    : { role: "system", content: "[TIER-3 ARCHIVE — no additional history]" };

  const summaryBlock: ClinicalMessage = {
    role:    "system",
    content: `[TIER-2 ROLLING SUMMARY — ${middleSlice.length} turns compressed]\n${JSON.stringify(tier2Summary, null, 2)}`,
  };

  return {
    tier: 3,
    messages:     [archiveRef, summaryBlock, ...activeSlice],
    tier2Summary,
    archived,
    stats: {
      totalInput: total,
      activeKept: activeSlice.length,
      summarised: middleSlice.length,
      archived:   archiveSlice.length,
    },
  };
}

// ── Archive retrieval API ─────────────────────────────────────────────────────

export function getArchive(sessionId?: string): ArchiveEntry[] {
  return sessionId ? _archive.filter((a) => a.sessionId === sessionId) : [..._archive];
}

export function getArchiveEntry(archiveId: string): ArchiveEntry | undefined {
  return _archive.find((a) => a.archiveId === archiveId);
}

export function verifyArchiveEntry(entry: ArchiveEntry, original: ClinicalMessage[]): boolean {
  const slice   = original.slice(entry.turnRange[0], entry.turnRange[1]);
  const payload = JSON.stringify(slice);
  const hash    = createHash("sha256").update(payload).digest("hex");
  return hash === entry.hash;
}

export function getCompressionStats(): {
  archiveCount: number;
  totalArchivedTurns: number;
} {
  return {
    archiveCount:       _archive.length,
    totalArchivedTurns: _archive.reduce((s, a) => s + a.turnCount, 0),
  };
}

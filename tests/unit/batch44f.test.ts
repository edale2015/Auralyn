import { describe, it, expect } from "vitest";
import {
  buildClinicalSummary,
  compressContext,
  compressClinicalContext,
  compressThreeTier,
  getCompressionStats,
  getArchive,
  getArchiveEntry,
  type ClinicalMessage,
} from "../../server/context/compression";

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeMessages(n: number, contentFn?: (i: number) => string): ClinicalMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role:    (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: contentFn ? contentFn(i) : `Turn ${i}: patient complaint about fever and cough`,
  }));
}

// ── 1. Backward-compat 2-tier API ────────────────────────────────────────────
describe("Batch44f — compression (2-tier backward compat)", () => {
  it("compressContext returns unchanged if below threshold", () => {
    const msgs = makeMessages(5);
    const result = compressContext(msgs);
    expect(result).toHaveLength(5);
  });

  it("compressContext compresses above threshold", () => {
    const msgs = makeMessages(25);
    const result = compressContext(msgs);
    expect(result.length).toBeLessThan(25);
    expect(result[0].role).toBe("system");
    expect(result[0].content as string).toContain("CLINICAL SUMMARY");
  });

  it("compressClinicalContext = compressContext (alias)", () => {
    const msgs = makeMessages(22);
    expect(compressClinicalContext(msgs)).toEqual(compressContext(msgs));
  });

  it("buildClinicalSummary extracts red flags from content", () => {
    const msgs: ClinicalMessage[] = [
      { role: "user",      content: "Patient has severe stridor and respiratory distress" },
      { role: "assistant", content: "onset: 2 hours ago" },
    ];
    const summary = buildClinicalSummary(msgs);
    expect(summary.red_flags).toContain("stridor");
    expect(summary.red_flags).toContain("respiratory_distress");
    expect(summary.timeline).toContain("2 hours");
  });
});

// ── 2. Three-tier compression ─────────────────────────────────────────────────
describe("Batch44f — compressThreeTier", () => {
  it("Tier 1: returns messages unchanged when ≤ 10 turns", () => {
    const msgs = makeMessages(8);
    const r = compressThreeTier(msgs, "session-t1");
    expect(r.tier).toBe(1);
    expect(r.messages).toHaveLength(8);
    expect(r.tier2Summary).toBeNull();
    expect(r.archived).toBeNull();
    expect(r.stats.activeKept).toBe(8);
    expect(r.stats.summarised).toBe(0);
  });

  it("Tier 2: summarises middle when 11–40 turns", () => {
    const msgs = makeMessages(25);
    const r = compressThreeTier(msgs, "session-t2");
    expect(r.tier).toBe(2);
    // Should have: 1 summary block + up to 10 active turns
    expect(r.messages.length).toBeLessThanOrEqual(11);
    expect(r.messages[0].role).toBe("system");
    expect(r.messages[0].content as string).toContain("TIER-2 ROLLING SUMMARY");
    expect(r.tier2Summary).not.toBeNull();
    expect(r.archived).toBeNull();
    expect(r.stats.summarised).toBeGreaterThan(0);
    expect(r.stats.activeKept).toBe(10);
  });

  it("Tier 3: archives oldest, summarises middle, keeps active when > 40 turns", () => {
    const msgs = makeMessages(55);
    const r = compressThreeTier(msgs, "session-t3");
    expect(r.tier).toBe(3);
    // Should have: archive ref + summary block + 10 active turns = ≤ 12 messages
    expect(r.messages.length).toBeLessThanOrEqual(12);
    expect(r.archived).not.toBeNull();
    expect(r.archived?.archiveId).toContain("ARC-");
    expect(r.archived?.turnCount).toBeGreaterThan(0);
    expect(r.stats.archived).toBeGreaterThan(0);
    expect(r.stats.summarised).toBeGreaterThan(0);
    expect(r.stats.activeKept).toBe(10);
    // First message is archive reference
    expect(r.messages[0].content as string).toContain("TIER-3 ARCHIVE");
    // Second message is tier-2 summary
    expect(r.messages[1].content as string).toContain("TIER-2 ROLLING SUMMARY");
  });

  it("Tier 3 creates a retrievable archive entry", () => {
    const msgs = makeMessages(50, (i) => `Turn ${i}: patient with fever and cough onset 3 days ago`);
    const sessionId = `ses-arc-${Date.now()}`;
    const r = compressThreeTier(msgs, sessionId);
    if (r.archived) {
      const found = getArchiveEntry(r.archived.archiveId);
      expect(found?.archiveId).toBe(r.archived.archiveId);
      expect(found?.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("stats.totalInput = activeKept + summarised + archived", () => {
    const msgs = makeMessages(50);
    const r = compressThreeTier(msgs, "session-stats");
    const { activeKept, summarised, archived, totalInput } = r.stats;
    expect(activeKept + summarised + archived).toBe(totalInput);
  });

  it("context reduction: Tier 3 output is much shorter than input", () => {
    const msgs = makeMessages(60);
    const r = compressThreeTier(msgs);
    expect(r.messages.length).toBeLessThan(15);   // 60 → ≤ 12
    expect(r.stats.totalInput).toBe(60);
  });

  it("getCompressionStats accumulates across calls", () => {
    const before = getCompressionStats().archiveCount;
    const msgs   = makeMessages(55);
    compressThreeTier(msgs, `session-gs-${Date.now()}`);
    const after = getCompressionStats();
    expect(after.archiveCount).toBeGreaterThan(before);
    expect(after.totalArchivedTurns).toBeGreaterThan(0);
  });

  it("getArchive filters by sessionId", () => {
    const sid = `session-filter-${Date.now()}`;
    compressThreeTier(makeMessages(50), sid);
    const entries = getArchive(sid);
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((e) => expect(e.sessionId).toBe(sid));
  });

  it("tier2Summary contains clinical fields", () => {
    const msgs: ClinicalMessage[] = [
      ...makeMessages(8),
      { role: "user",      content: "patient has severe stridor, onset 1 hour ago" },
      { role: "assistant", content: "red flag confirmed: respiratory distress" },
      ...makeMessages(10),
    ];
    const r = compressThreeTier(msgs);
    if (r.tier2Summary) {
      expect(Array.isArray(r.tier2Summary.key_symptoms)).toBe(true);
      expect(Array.isArray(r.tier2Summary.red_flags)).toBe(true);
    }
  });
});

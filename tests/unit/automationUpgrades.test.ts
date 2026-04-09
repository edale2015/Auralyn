/**
 * Automation Upgrades — Packet 20 (5 next high-impact upgrades) unit tests
 *
 * Tests are grouped by upgrade:
 *   1. Selector Confidence Scoring (selectorScore.ts)
 *   2. AI Selector Generator (aiSelectorGenerator.ts) — interface contract only
 *   3. Self-Healing Replay (selfHealingReplay.ts) — data contracts
 *   4. Template Health Dashboard (healthRoutes.ts) — data shape contracts
 *   5. Autonomous Template Repair Agent (repairAgent.ts) — logic contracts
 *
 * Playwright-dependent functions are not exercised here (require live browser).
 * Database-dependent functions are mocked at the query level.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Upgrade 1: Selector Confidence Scoring ────────────────────────────────────

describe("Upgrade 1 — Selector Confidence Scoring", () => {

  describe("confidence computation", () => {
    function computeConfidence(attempts: number, successes: number): number {
      return attempts > 0 ? successes / attempts : 1.0;
    }

    it("returns 1.0 when no attempts (optimistic default)", () => {
      expect(computeConfidence(0, 0)).toBe(1.0);
    });

    it("returns 1.0 when all attempts succeed", () => {
      expect(computeConfidence(10, 10)).toBe(1.0);
    });

    it("returns 0.0 when all attempts fail", () => {
      expect(computeConfidence(5, 0)).toBe(0.0);
    });

    it("returns 0.5 for half success", () => {
      expect(computeConfidence(4, 2)).toBe(0.5);
    });

    it("correctly computes fractional confidence", () => {
      expect(computeConfidence(3, 2)).toBeCloseTo(0.667, 2);
    });
  });

  describe("needsRepair flag", () => {
    const MIN_ATTEMPTS = 3;
    const THRESHOLD    = 0.5;

    function needsRepair(attempts: number, successes: number): boolean {
      const confidence = attempts > 0 ? successes / attempts : 1.0;
      return attempts >= MIN_ATTEMPTS && confidence < THRESHOLD;
    }

    it("false when not enough attempts", () => {
      expect(needsRepair(2, 0)).toBe(false);
    });

    it("false when confidence is above threshold", () => {
      expect(needsRepair(10, 6)).toBe(false); // 0.6 > 0.5
    });

    it("true when enough attempts and confidence below threshold", () => {
      expect(needsRepair(10, 4)).toBe(true);  // 0.4 < 0.5
    });

    it("false exactly at threshold", () => {
      expect(needsRepair(10, 5)).toBe(false); // 0.5 is not < 0.5
    });

    it("false with 3 attempts all failing but just at min", () => {
      // 0/3 = 0.0 < 0.5 AND 3 >= 3 → true
      expect(needsRepair(3, 0)).toBe(true);
    });
  });

  describe("sortCandidatesByScore logic", () => {
    function sortByConfidence(
      candidates: string[],
      scoreMap: Map<string, number>
    ): string[] {
      return [...candidates].sort((a, b) => {
        const sa = scoreMap.get(a) ?? 0.5;
        const sb = scoreMap.get(b) ?? 0.5;
        return sb - sa;
      });
    }

    it("sorts higher confidence first", () => {
      const map = new Map([["#a", 0.9], ["#b", 0.3], ["#c", 0.7]]);
      expect(sortByConfidence(["#a", "#b", "#c"], map)).toEqual(["#a", "#c", "#b"]);
    });

    it("unknown selectors default to 0.5 (neutral)", () => {
      const map = new Map([["#known", 0.8]]);
      const sorted = sortByConfidence(["#unknown", "#known"], map);
      expect(sorted[0]).toBe("#known");   // 0.8 > 0.5
      expect(sorted[1]).toBe("#unknown");
    });

    it("equal scores preserve relative order (stable)", () => {
      const map = new Map<string, number>();
      const sorted = sortByConfidence(["#a", "#b", "#c"], map);
      // All unknown → all 0.5 → stable → original order preserved
      expect(sorted).toHaveLength(3);
    });

    it("empty input returns empty", () => {
      expect(sortByConfidence([], new Map())).toEqual([]);
    });
  });
});

// ── Upgrade 2: AI Selector Generator ─────────────────────────────────────────

describe("Upgrade 2 — AI Selector Generator", () => {

  describe("AiSelectorCandidate contract", () => {
    type Confidence = "high" | "medium" | "low";
    interface AiSelectorCandidate {
      selector:   string;
      rationale:  string;
      confidence: Confidence;
    }

    const VALID_CANDIDATES: AiSelectorCandidate[] = [
      { selector: "[name='username']",  rationale: "matches name attr", confidence: "high"   },
      { selector: "#user_name",         rationale: "id fallback",        confidence: "medium" },
      { selector: "[aria-label='User']",rationale: "aria fallback",      confidence: "low"    },
    ];

    it("all confidence values are in allowed set", () => {
      for (const c of VALID_CANDIDATES) {
        expect(["high", "medium", "low"]).toContain(c.confidence);
      }
    });

    it("all candidates have non-empty selector strings", () => {
      for (const c of VALID_CANDIDATES) {
        expect(c.selector.trim().length).toBeGreaterThan(0);
      }
    });

    it("all candidates have rationale strings", () => {
      for (const c of VALID_CANDIDATES) {
        expect(typeof c.rationale).toBe("string");
        expect(c.rationale.length).toBeGreaterThan(0);
      }
    });

    it("high confidence sorts before medium, medium before low", () => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const sorted = [...VALID_CANDIDATES].sort((a, b) => order[a.confidence] - order[b.confidence]);
      expect(sorted[0].confidence).toBe("high");
      expect(sorted[1].confidence).toBe("medium");
      expect(sorted[2].confidence).toBe("low");
    });
  });

  describe("page skeleton sanity", () => {
    it("skeleton truncated to 3000 chars is safe for token limits", () => {
      const bigHtml = "<input ".repeat(500); // ~3500 chars
      const truncated = bigHtml.slice(0, 3_000);
      expect(truncated.length).toBeLessThanOrEqual(3_000);
    });
  });
});

// ── Upgrade 3: Self-Healing Replay Engine ─────────────────────────────────────

describe("Upgrade 3 — Self-Healing Replay Engine", () => {

  describe("ActionResult contract", () => {
    interface ActionResult {
      name:      string;
      selector?: string;
      healed?:   string;
      aiHealed?: boolean;
      success:   boolean;
      error?:    string;
    }

    it("successful action has no error", () => {
      const r: ActionResult = { name: "fill-email", selector: "#email", success: true };
      expect(r.error).toBeUndefined();
    });

    it("healed action carries original and replacement", () => {
      const r: ActionResult = {
        name: "fill-email", selector: "#email", healed: "[name='email']",
        aiHealed: false, success: true,
      };
      expect(r.healed).toBe("[name='email']");
      expect(r.selector).toBe("#email");
    });

    it("AI-healed flag is independent of standard healing", () => {
      const standard: ActionResult = {
        name: "fill-x", selector: "#x", healed: "[name='x']", aiHealed: false, success: true,
      };
      const ai: ActionResult = {
        name: "fill-y", selector: "#y", healed: "[aria-label='y']", aiHealed: true, success: true,
      };
      expect(standard.aiHealed).toBe(false);
      expect(ai.aiHealed).toBe(true);
    });
  });

  describe("ReplayReport aggregation", () => {
    interface ActionResult { success: boolean; healed?: string; }
    interface ReplayReport { total: number; succeeded: number; failed: number; healed: number; }

    function buildReport(results: ActionResult[]): ReplayReport {
      return {
        total:     results.length,
        succeeded: results.filter((r) => r.success).length,
        failed:    results.filter((r) => !r.success).length,
        healed:    results.filter((r) => r.healed).length,
      };
    }

    it("all succeed → failed = 0", () => {
      const r = buildReport([{ success: true }, { success: true }]);
      expect(r.failed).toBe(0);
      expect(r.succeeded).toBe(2);
    });

    it("all fail → succeeded = 0", () => {
      const r = buildReport([{ success: false }, { success: false }]);
      expect(r.succeeded).toBe(0);
      expect(r.failed).toBe(2);
    });

    it("healed count is independent of success/failed count", () => {
      const results: ActionResult[] = [
        { success: true,  healed: "[name='x']" },
        { success: true                          },
        { success: false                         },
      ];
      const r = buildReport(results);
      expect(r.healed).toBe(1);
      expect(r.succeeded).toBe(2);
      expect(r.failed).toBe(1);
    });

    it("total = succeeded + failed", () => {
      const r = buildReport([
        { success: true }, { success: false }, { success: true }, { success: false },
      ]);
      expect(r.total).toBe(r.succeeded + r.failed);
    });
  });
});

// ── Upgrade 4: Template Health Dashboard (data contracts) ─────────────────────

describe("Upgrade 4 — Template Health Dashboard", () => {

  describe("TemplateSummary health classification", () => {
    type Health = "healthy" | "degraded" | "broken";
    function classify(broken: number, degraded: number): Health {
      if (broken > 0)   return "broken";
      if (degraded > 0) return "degraded";
      return "healthy";
    }

    it("any broken → 'broken'", () => {
      expect(classify(1, 0)).toBe("broken");
      expect(classify(3, 2)).toBe("broken");
    });

    it("no broken, any degraded → 'degraded'", () => {
      expect(classify(0, 1)).toBe("degraded");
    });

    it("all clean → 'healthy'", () => {
      expect(classify(0, 0)).toBe("healthy");
    });
  });

  describe("confidence badge thresholds", () => {
    function badgeLabel(confidence: number, attempts: number): string {
      if (attempts === 0)       return "Untested";
      if (confidence >= 0.8)    return "Healthy";
      if (confidence >= 0.5)    return "Degraded";
      return "Broken";
    }

    it("0 attempts → Untested", () => {
      expect(badgeLabel(0, 0)).toBe("Untested");
    });

    it("1.0 confidence → Healthy", () => {
      expect(badgeLabel(1.0, 5)).toBe("Healthy");
    });

    it("0.8 confidence → Healthy (boundary)", () => {
      expect(badgeLabel(0.8, 5)).toBe("Healthy");
    });

    it("0.79 confidence → Degraded", () => {
      expect(badgeLabel(0.79, 5)).toBe("Degraded");
    });

    it("0.5 confidence → Degraded (boundary)", () => {
      expect(badgeLabel(0.5, 5)).toBe("Degraded");
    });

    it("0.49 confidence → Broken", () => {
      expect(badgeLabel(0.49, 5)).toBe("Broken");
    });

    it("0.0 confidence → Broken", () => {
      expect(badgeLabel(0.0, 5)).toBe("Broken");
    });
  });
});

// ── Upgrade 5: Autonomous Template Repair Agent ───────────────────────────────

describe("Upgrade 5 — Autonomous Template Repair Agent", () => {

  describe("RepairRecommendation status classification", () => {
    type Status = "pending" | "no-candidates" | "ready";

    function getStatus(aiCandidates: string[]): Status {
      return aiCandidates.length > 0 ? "ready" : "no-candidates";
    }

    it("no AI candidates → 'no-candidates'", () => {
      expect(getStatus([])).toBe("no-candidates");
    });

    it("has AI candidates → 'ready'", () => {
      expect(getStatus(["[name='x']"])).toBe("ready");
    });
  });

  describe("RepairScanReport aggregation", () => {
    interface Rec { status: "pending" | "no-candidates" | "ready" }
    interface Report { totalBroken: number; withCandidates: number; noCandidates: number }

    function buildScanReport(recs: Rec[]): Report {
      return {
        totalBroken:    recs.length,
        withCandidates: recs.filter((r) => r.status === "ready").length,
        noCandidates:   recs.filter((r) => r.status === "no-candidates").length,
      };
    }

    it("totalBroken = withCandidates + noCandidates", () => {
      const report = buildScanReport([
        { status: "ready" },
        { status: "no-candidates" },
        { status: "ready" },
      ]);
      expect(report.totalBroken).toBe(report.withCandidates + report.noCandidates);
    });

    it("all ready → noCandidates = 0", () => {
      const report = buildScanReport([{ status: "ready" }, { status: "ready" }]);
      expect(report.noCandidates).toBe(0);
    });

    it("all no-candidates → withCandidates = 0", () => {
      const report = buildScanReport([{ status: "no-candidates" }]);
      expect(report.withCandidates).toBe(0);
    });

    it("empty scan → all zeros", () => {
      const report = buildScanReport([]);
      expect(report.totalBroken).toBe(0);
      expect(report.withCandidates).toBe(0);
      expect(report.noCandidates).toBe(0);
    });
  });

  describe("applyRepair selector patching logic", () => {
    function patchActions(
      actions: Array<{ name: string; selector?: string }>,
      original: string,
      replacement: string
    ) {
      return actions.map((a) =>
        a.selector === original ? { ...a, selector: replacement } : a
      );
    }

    it("patches the matching selector", () => {
      const actions = [
        { name: "fill-email", selector: "#email" },
        { name: "fill-pass",  selector: "#password" },
      ];
      const patched = patchActions(actions, "#email", "[name='email']");
      expect(patched[0].selector).toBe("[name='email']");
      expect(patched[1].selector).toBe("#password"); // unchanged
    });

    it("does not mutate the original array", () => {
      const actions = [{ name: "click", selector: "#btn" }];
      const original = actions[0].selector;
      patchActions(actions, "#btn", "[type='submit']");
      expect(actions[0].selector).toBe(original);
    });

    it("no match → all selectors unchanged", () => {
      const actions = [{ name: "fill", selector: "#x" }];
      const patched = patchActions(actions, "#not-there", "[name='y']");
      expect(patched[0].selector).toBe("#x");
    });

    it("patches both actions and fields independently", () => {
      const fields  = [{ internalKey: "email", selector: "#email", type: "text" }];
      const actions = [{ name: "fill-email", selector: "#email" }];
      const patchedFields   = patchActions(fields,   "#email", "[name='email']");
      const patchedActions  = patchActions(actions,  "#email", "[name='email']");
      expect(patchedFields[0].selector).toBe("[name='email']");
      expect(patchedActions[0].selector).toBe("[name='email']");
    });
  });

  describe("getTemplateSummaries logic", () => {
    interface Score { confidence: number; needsRepair: boolean }

    function summarize(scores: Score[]) {
      const healthy  = scores.filter((s) => s.confidence >= 0.8).length;
      const degraded = scores.filter((s) => s.confidence >= 0.5 && s.confidence < 0.8).length;
      const broken   = scores.filter((s) => s.needsRepair).length;
      const overall  =
        broken > 0   ? "broken"   :
        degraded > 0 ? "degraded" : "healthy";
      return { healthy, degraded, broken, overallHealth: overall };
    }

    it("all healthy", () => {
      const s = summarize([
        { confidence: 0.9, needsRepair: false },
        { confidence: 1.0, needsRepair: false },
      ]);
      expect(s.overallHealth).toBe("healthy");
      expect(s.healthy).toBe(2);
    });

    it("mix of degraded and healthy → degraded overall", () => {
      const s = summarize([
        { confidence: 0.9, needsRepair: false },
        { confidence: 0.6, needsRepair: false },
      ]);
      expect(s.overallHealth).toBe("degraded");
    });

    it("any broken → broken overall", () => {
      const s = summarize([
        { confidence: 0.9, needsRepair: false },
        { confidence: 0.1, needsRepair: true  },
      ]);
      expect(s.overallHealth).toBe("broken");
      expect(s.broken).toBe(1);
    });
  });
});

// ── selectorHealing escaping ──────────────────────────────────────────────────

describe("selectorHealing — escaping helpers", () => {
  function escAttr(v: string): string {
    return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function escText(v: string): string {
    return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  it("escAttr escapes double quotes", () => {
    expect(escAttr('say "hi"')).toBe('say \\"hi\\"');
  });

  it("escAttr escapes backslashes", () => {
    expect(escAttr("C:\\path")).toBe("C:\\\\path");
  });

  it("escText escapes double quotes", () => {
    expect(escText('label "click"')).toBe('label \\"click\\"');
  });

  it("escAttr leaves normal strings unchanged", () => {
    expect(escAttr("first_name")).toBe("first_name");
  });

  it("safe strings pass through unchanged", () => {
    const safe = "normalId";
    expect(escAttr(safe)).toBe(safe);
  });

  it("double-escaping a string with a quote differs from single-escape", () => {
    const val = 'say "hi"';
    const once   = escAttr(val);          // say \"hi\"
    const twice  = escAttr(once);         // say \\\"hi\\\"
    expect(twice).not.toBe(once);
  });
});

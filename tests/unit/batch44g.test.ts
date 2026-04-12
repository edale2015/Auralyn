import { describe, it, expect, vi } from "vitest";

// ─── 1. Skill Contracts & Pipeline Validator ───────────────────────────────
import {
  createFlowContext,
  validatePipeline,
  executePipeline,
  type AsyncSkill,
  type SkillMeta,
  type PipelineBlueprint,
} from "../../server/skills/skillContracts";

function makeSkill(meta: SkillMeta, impl?: (ctx: any) => Promise<void>): AsyncSkill {
  return {
    meta,
    async process(ctx) {
      if (impl) await impl(ctx);
      for (const key of meta.provides) ctx.set(key, `value_of_${key}`);
      return ctx;
    },
  };
}

const ingestionSkill = makeSkill({
  name: "ingestion", version: "1.0", description: "Collect vitals",
  provides: ["vitals", "demographics"], consumes: [],
});
const scoringSkill = makeSkill({
  name: "scoring", version: "1.0", description: "Compute NEWS2",
  provides: ["news2_score", "qsofa_score"], consumes: ["vitals"],
});
const sepsisSkill = makeSkill({
  name: "sepsis", version: "1.0", description: "Sepsis detection",
  provides: ["sepsis_risk"], consumes: ["vitals", "news2_score"],
});
const dispositionSkill = makeSkill({
  name: "disposition", version: "1.0", description: "Determine disposition",
  provides: ["final_disposition"], consumes: ["sepsis_risk", "news2_score", "demographics"],
});

const registry = new Map<string, AsyncSkill>([
  ["ingestion",   ingestionSkill],
  ["scoring",     scoringSkill],
  ["sepsis",      sepsisSkill],
  ["disposition", dispositionSkill],
]);

const blueprint: PipelineBlueprint = {
  name: "triage-pipeline", version: "1.0",
  skills: [
    { skillName: "ingestion" },
    { skillName: "scoring",     deps: ["ingestion"] },
    { skillName: "sepsis",      deps: ["scoring"] },
    { skillName: "disposition", deps: ["sepsis"] },
  ],
};

describe("Batch44g — skillContracts: FlowContext", () => {
  it("get/set/has work correctly", () => {
    const ctx = createFlowContext({ foo: 1 });
    expect(ctx.get("foo")).toBe(1);
    ctx.set("bar", "hello");
    expect(ctx.has("bar")).toBe(true);
    expect(ctx.get("bar")).toBe("hello");
  });

  it("snapshot is a copy, not a live reference", () => {
    const ctx = createFlowContext({ a: 1 });
    const snap = ctx.snapshot();
    ctx.set("a", 99);
    expect(snap.a).toBe(1);   // snapshot was taken before mutation
  });

  it("runId is a UUID", () => {
    const ctx = createFlowContext();
    expect(ctx.runId).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("Batch44g — skillContracts: validatePipeline", () => {
  it("validates a correct pipeline with no violations", () => {
    const r = validatePipeline(blueprint, registry);
    expect(r.valid).toBe(true);
    expect(r.violations).toHaveLength(0);
    expect(r.summary).toContain("satisfied");
  });

  it("detects a missing upstream key", () => {
    const badRegistry = new Map(registry);
    // disposition skill consumes "sepsis_risk" but remove sepsis skill
    badRegistry.delete("sepsis");
    const r = validatePipeline(blueprint, badRegistry);
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => v.key === "sepsis_risk")).toBe(true);
  });

  it("accepts initial context keys as satisfying consumer deps", () => {
    // If we seed "vitals" in initial context, scoring skill's dep is satisfied
    // even without ingestion skill
    const blueprintNoIngestion: PipelineBlueprint = {
      name: "no-ingestion", version: "1.0",
      skills: [{ skillName: "scoring" }],
    };
    const r = validatePipeline(blueprintNoIngestion, registry, ["vitals"]);
    expect(r.valid).toBe(true);
  });

  it("reports unregistered skills", () => {
    const bp: PipelineBlueprint = {
      name: "broken", version: "1.0",
      skills: [{ skillName: "nonexistent" }],
    };
    const r = validatePipeline(bp, registry);
    expect(r.valid).toBe(false);
    expect(r.violations[0].reason).toContain("not registered");
  });

  it("summary includes violation count when invalid", () => {
    const bp: PipelineBlueprint = {
      name: "bad", version: "1.0",
      skills: [{ skillName: "disposition" }],   // needs everything upstream
    };
    const r = validatePipeline(bp, registry);
    expect(r.summary).toContain("violation");
  });
});

describe("Batch44g — skillContracts: executePipeline", () => {
  it("executes a valid pipeline and populates context", async () => {
    const result = await executePipeline(blueprint, registry, { patientId: "p-001" });
    expect(result.success).toBe(true);
    expect(result.context.final_disposition).toBe("value_of_final_disposition");
    expect(result.context.news2_score).toBe("value_of_news2_score");
    expect(result.context.sepsis_risk).toBe("value_of_sepsis_risk");
  });

  it("emits events for each skill", async () => {
    const events: string[] = [];
    await executePipeline(blueprint, registry, {}, (e) => events.push(`${e.skillName}:${e.status}`));
    expect(events).toContain("ingestion:started");
    expect(events).toContain("ingestion:completed");
    expect(events).toContain("disposition:completed");
  });

  it("retries a failing skill with backoff", async () => {
    let attempts = 0;
    const flakySkill = makeSkill(
      { name: "flaky", version: "1.0", description: "Flaky", provides: ["data"], consumes: [], maxRetries: 2, retryDelayBase: 0.001 },
      async () => { if (++attempts < 3) throw new Error("transient"); }
    );
    const bp: PipelineBlueprint = { name: "retry-test", version: "1.0", skills: [{ skillName: "flaky" }] };
    const reg = new Map([["flaky", flakySkill]]);
    const result = await executePipeline(bp, reg);
    expect(attempts).toBe(3);
    expect(result.context.data).toBe("value_of_data");
  });

  it("includes runId and durationMs in result", async () => {
    const result = await executePipeline(blueprint, registry);
    expect(result.runId).toMatch(/[0-9a-f-]{36}/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── 2. Jitter Backoff ────────────────────────────────────────────────────────
import { computeBackoffMs, withJitterRetry, jitterSleep } from "../../server/utils/jitterBackoff";

describe("Batch44g — jitterBackoff", () => {
  it("computeBackoffMs returns value between 0 and cap", () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ms = computeBackoffMs(attempt, { baseMs: 1000, maxMs: 10_000 });
      const cap = Math.min(1000 * Math.pow(2, attempt), 10_000);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(cap + 1);   // +1 for float precision
    }
  });

  it("computeBackoffMs without jitter = capped exponential", () => {
    const ms = computeBackoffMs(3, { baseMs: 1000, maxMs: 5000, jitter: false });
    expect(ms).toBe(5000);   // min(1000*8, 5000) = 5000
  });

  it("withJitterRetry succeeds on first attempt", async () => {
    const result = await withJitterRetry(async () => 42);
    expect(result.value).toBe(42);
    expect(result.attempts).toBe(1);
  });

  it("withJitterRetry retries on failure and succeeds", async () => {
    let count = 0;
    const result = await withJitterRetry(
      async () => { if (++count < 3) throw new Error("transient"); return "ok"; },
      { baseMs: 1, maxMs: 5, maxRetries: 5 }
    );
    expect(result.value).toBe("ok");
    expect(result.attempts).toBe(3);
  });

  it("withJitterRetry throws after maxRetries", async () => {
    await expect(
      withJitterRetry(async () => { throw new Error("always fails"); }, { baseMs: 1, maxMs: 2, maxRetries: 2 })
    ).rejects.toThrow("always fails");
  });

  it("jitterSleep resolves without throwing", async () => {
    await expect(jitterSleep(1)).resolves.toBeUndefined();
  });

  it("onRetry callback is called with attempt number", async () => {
    const retries: number[] = [];
    let count = 0;
    await withJitterRetry(
      async () => { if (++count < 3) throw new Error("x"); return "done"; },
      { baseMs: 1, maxMs: 2 },
      (attempt) => retries.push(attempt)
    );
    expect(retries).toEqual([1, 2]);
  });
});

// ─── 3. Clinical Reasoning Chain ─────────────────────────────────────────────
import { summariseChain } from "../../server/knowledge/clinicalReasoningChain";
import type { ReasoningChain } from "../../server/knowledge/clinicalReasoningChain";

describe("Batch44g — clinicalReasoningChain: summariseChain", () => {
  const mockChain: ReasoningChain = {
    root: { id: "n1", type: "symptom", label: "fever" },
    chain: [
      { node: { id: "n1", type: "symptom",   label: "fever"   }, hop: 0, pathSoFar: ["n1"] },
      { node: { id: "n2", type: "diagnosis", label: "sepsis"  }, hop: 1, pathSoFar: ["n1","n2"],
        via: { id: "e1", from: "n1", to: "n2", relation: "suggests" } },
      { node: { id: "n3", type: "protocol",  label: "sepsis bundle" }, hop: 2, pathSoFar: ["n1","n2","n3"],
        via: { id: "e2", from: "n2", to: "n3", relation: "governed_by" } },
    ],
    maxHops:       3,
    direction:     "forward",
    uniqueTypes:   ["symptom", "diagnosis", "protocol"],
    terminalNodes: [{ id: "n3", type: "protocol", label: "sepsis bundle" }],
    truncated:     false,
  };

  it("produces a readable narrative", () => {
    const s = summariseChain(mockChain);
    expect(s).toContain("SYMPTOM(fever)");
    expect(s).toContain("DIAGNOSIS(sepsis)");
    expect(s).toContain("suggests");
  });

  it("handles empty chain gracefully", () => {
    const empty: ReasoningChain = { ...mockChain, chain: [] };
    const s = summariseChain(empty);
    expect(s).toContain("No chain");
  });

  it("includes relation labels in narrative", () => {
    const s = summariseChain(mockChain);
    expect(s).toContain("governed_by");
  });
});

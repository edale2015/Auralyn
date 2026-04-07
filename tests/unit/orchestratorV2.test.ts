import { describe, it, expect, vi, beforeEach } from "vitest";
import { topologicalSort, type Agent } from "../../server/agents/orchestrator";
import {
  MultiAgentCoordinator,
} from "../../server/agents/multiAgentCoordinator";
import {
  generateExecutionFingerprint,
  verifyFingerprint,
} from "../../server/audit/executionFingerprint";

// ── helpers ───────────────────────────────────────────────────────────────────
function makeAgent(
  name:      string,
  priority:  number,
  dependsOn: string[] = []
): Agent {
  return {
    name,
    priority,
    dependsOn,
    run: async () => ({ success: true, data: name }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. topologicalSort — correctness
// ═══════════════════════════════════════════════════════════════════════════════
describe("topologicalSort — ordering", () => {
  it("returns agents in dependency order (dep before dependent)", () => {
    const scorer    = makeAgent("scorer", 2, []);
    const formatter = makeAgent("formatter", 1, ["scorer"]);
    const sorted    = topologicalSort([formatter, scorer]);
    const names     = sorted.map(a => a.name);
    expect(names.indexOf("scorer")).toBeLessThan(names.indexOf("formatter"));
  });

  it("handles agents with no dependencies in priority order", () => {
    const a = makeAgent("a", 3);
    const b = makeAgent("b", 1);
    const c = makeAgent("c", 2);
    const sorted = topologicalSort([a, b, c]).map(a => a.name);
    expect(sorted).toEqual(["b", "c", "a"]);
  });

  it("handles a linear chain: A → B → C", () => {
    const a = makeAgent("a", 1);
    const b = makeAgent("b", 2, ["a"]);
    const c = makeAgent("c", 3, ["b"]);
    const sorted = topologicalSort([c, b, a]).map(n => n.name);
    expect(sorted).toEqual(["a", "b", "c"]);
  });

  it("handles a diamond DAG: A → B, A → C, B+C → D", () => {
    const a = makeAgent("a", 1);
    const b = makeAgent("b", 2, ["a"]);
    const c = makeAgent("c", 3, ["a"]);
    const d = makeAgent("d", 4, ["b", "c"]);
    const sorted = topologicalSort([d, c, b, a]).map(n => n.name);
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("c"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("d"));
    expect(sorted.indexOf("c")).toBeLessThan(sorted.indexOf("d"));
  });

  it("preserves idempotency — same input, same output", () => {
    const agents = [makeAgent("x", 2, ["y"]), makeAgent("y", 1)];
    const r1 = topologicalSort(agents).map(a => a.name);
    const r2 = topologicalSort(agents).map(a => a.name);
    expect(r1).toEqual(r2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. topologicalSort — cycle detection
// ═══════════════════════════════════════════════════════════════════════════════
describe("topologicalSort — cycle detection", () => {
  it("throws for a direct A ↔ B cycle", () => {
    const a = makeAgent("a", 1, ["b"]);
    const b = makeAgent("b", 2, ["a"]);
    expect(() => topologicalSort([a, b])).toThrow(/Circular dependency/i);
  });

  it("throws for a 3-node cycle: A → B → C → A", () => {
    const a = makeAgent("a", 1, ["c"]);
    const b = makeAgent("b", 2, ["a"]);
    const c = makeAgent("c", 3, ["b"]);
    expect(() => topologicalSort([a, b, c])).toThrow(/Circular dependency/i);
  });

  it("error message names the cycle path", () => {
    const a = makeAgent("a", 1, ["b"]);
    const b = makeAgent("b", 2, ["a"]);
    try {
      topologicalSort([a, b]);
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("a");
      expect(err.message).toContain("b");
    }
  });

  it("throws for a self-referential agent", () => {
    const a = makeAgent("a", 1, ["a"]);
    expect(() => topologicalSort([a])).toThrow(/Circular dependency/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. topologicalSort — missing dependency detection
// ═══════════════════════════════════════════════════════════════════════════════
describe("topologicalSort — missing dependency", () => {
  it("throws when a dependency is not registered", () => {
    const agent = makeAgent("formatter", 1, ["scorer"]);
    expect(() => topologicalSort([agent])).toThrow(/not registered/i);
  });

  it("error message includes the missing dependency name", () => {
    const agent = makeAgent("x", 1, ["ghost"]);
    try {
      topologicalSort([agent]);
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("ghost");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MultiAgentCoordinator — O(1) Map-based
// ═══════════════════════════════════════════════════════════════════════════════
describe("MultiAgentCoordinator — O(1) conflict detection", () => {
  let coordinator: MultiAgentCoordinator;

  beforeEach(() => {
    coordinator = new MultiAgentCoordinator();
  });

  it("first assign returns 'assigned'", () => {
    const r = coordinator.assign("agent_a", "task:001");
    expect(r.status).toBe("assigned");
  });

  it("second assign of same task returns 'blocked'", () => {
    coordinator.assign("agent_a", "task:001");
    const r = coordinator.assign("agent_b", "task:001");
    expect(r.status).toBe("blocked");
    expect(r.reason).toContain("agent_a");
  });

  it("task is reassignable after complete()", () => {
    coordinator.assign("agent_a", "task:001");
    coordinator.complete("agent_a", "task:001");
    const r = coordinator.assign("agent_b", "task:001");
    expect(r.status).toBe("assigned");
  });

  it("task is reassignable after fail()", () => {
    coordinator.assign("agent_a", "task:001");
    coordinator.fail("agent_a", "task:001");
    const r = coordinator.assign("agent_b", "task:001");
    expect(r.status).toBe("assigned");
  });

  it("expired TTL allows reassignment without explicit complete", async () => {
    coordinator.assign("agent_a", "task:002", 1);   // 1ms TTL
    await new Promise(r => setTimeout(r, 10));       // let it expire
    const r = coordinator.assign("agent_b", "task:002");
    expect(r.status).toBe("assigned");
  });

  it("rejects when at capacity", () => {
    const big = new MultiAgentCoordinator();
    // Directly fill the map to simulate capacity (using internal knowledge)
    const cap = (big as any);
    for (let i = 0; i < 10_000; i++) {
      cap.taskMap.set(`task:${i}`, {
        agent: "x", task: `task:${i}`,
        assignedAt: Date.now(), expiresAt: Date.now() + 99999, status: "active",
      });
    }
    const r = big.assign("x", "task:overflow");
    expect(r.status).toBe("rejected");
  });

  it("getSummary() returns correct active + completed counts", () => {
    coordinator.assign("a", "t1");
    coordinator.assign("b", "t2");
    coordinator.complete("a", "t1");
    const s = coordinator.getSummary();
    expect(s.activeTasks.length).toBe(1);
    expect(s.completedTasks).toBe(1);
  });

  it("complete() by wrong agent does not remove the task", () => {
    coordinator.assign("agent_a", "task:X");
    coordinator.complete("agent_b", "task:X");   // wrong agent
    const r = coordinator.assign("agent_c", "task:X");
    expect(r.status).toBe("blocked");   // still active
  });

  it("getActiveCount() tracks Map size", () => {
    coordinator.assign("a", "t1");
    coordinator.assign("b", "t2");
    expect(coordinator.getActiveCount()).toBe(2);
    coordinator.complete("a", "t1");
    expect(coordinator.getActiveCount()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Execution fingerprint — determinism + tamper detection
// ═══════════════════════════════════════════════════════════════════════════════
describe("generateExecutionFingerprint — determinism", () => {
  const ctx  = { text: "sore throat", patientId: "P001", channel: "web" };
  const plan = [
    { name: "triage", priority: 1, dependsOn: [] },
    { name: "scorer", priority: 2, dependsOn: ["triage"] },
  ];

  it("same inputs produce same fingerprint", () => {
    const f1 = generateExecutionFingerprint(ctx, plan);
    const f2 = generateExecutionFingerprint(ctx, plan);
    expect(f1).toBe(f2);
  });

  it("fingerprint is 64-char hex", () => {
    const f = generateExecutionFingerprint(ctx, plan);
    expect(f).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different text → different fingerprint", () => {
    const f1 = generateExecutionFingerprint({ ...ctx, text: "headache" }, plan);
    const f2 = generateExecutionFingerprint({ ...ctx, text: "chest pain" }, plan);
    expect(f1).not.toBe(f2);
  });

  it("different patientId → different fingerprint", () => {
    const f1 = generateExecutionFingerprint({ ...ctx, patientId: "P001" }, plan);
    const f2 = generateExecutionFingerprint({ ...ctx, patientId: "P002" }, plan);
    expect(f1).not.toBe(f2);
  });

  it("different plan order → different fingerprint", () => {
    const planRev = [...plan].reverse();
    const f1 = generateExecutionFingerprint(ctx, plan);
    const f2 = generateExecutionFingerprint(ctx, planRev);
    expect(f1).not.toBe(f2);
  });

  it("dependsOn order is canonicalised (sorted) — same semantic dep → same fingerprint", () => {
    const planA = [{ name: "x", priority: 1, dependsOn: ["b", "a"] }];
    const planB = [{ name: "x", priority: 1, dependsOn: ["a", "b"] }];
    expect(generateExecutionFingerprint(ctx, planA)).toBe(
      generateExecutionFingerprint(ctx, planB)
    );
  });

  it("extra plan agent → different fingerprint", () => {
    const planWith = [...plan, { name: "extra", priority: 3, dependsOn: [] }];
    expect(generateExecutionFingerprint(ctx, plan)).not.toBe(
      generateExecutionFingerprint(ctx, planWith)
    );
  });
});

describe("verifyFingerprint", () => {
  const ctx  = { text: "earache", patientId: "P010", channel: "web" };
  const plan = [{ name: "triage", priority: 1, dependsOn: [] }];

  it("passes for matching fingerprint", () => {
    const fp = generateExecutionFingerprint(ctx, plan);
    expect(verifyFingerprint(ctx, plan, fp)).toBe(true);
  });

  it("fails for tampered fingerprint", () => {
    const fp      = generateExecutionFingerprint(ctx, plan);
    const tampered = fp.replace(fp[0], fp[0] === "a" ? "b" : "a");
    expect(verifyFingerprint(ctx, plan, tampered)).toBe(false);
  });

  it("fails for different context", () => {
    const fp = generateExecutionFingerprint(ctx, plan);
    expect(verifyFingerprint({ ...ctx, text: "different" }, plan, fp)).toBe(false);
  });
});

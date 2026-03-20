import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/controlTower/eventBus", () => ({
  emitEvent: vi.fn(),
}));

describe("CircuitBreaker — integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through calls when closed", async () => {
    const { CircuitBreaker } = await import("../../server/utils/circuitBreaker");
    const cb = new CircuitBreaker("test-pass", 5, 30_000);
    const result = await cb.call(async () => "ok");
    expect(result).toBe("ok");
    expect(cb.getState().state).toBe("closed");
    expect(cb.getState().failures).toBe(0);
  });

  it("opens after threshold failures", async () => {
    const { CircuitBreaker } = await import("../../server/utils/circuitBreaker");
    const cb = new CircuitBreaker("test-open", 3, 30_000);

    for (let i = 0; i < 3; i++) {
      await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    }

    expect(cb.getState().state).toBe("open");
    expect(cb.getState().failures).toBe(3);
  });

  it("rejects calls immediately when open", async () => {
    const { CircuitBreaker } = await import("../../server/utils/circuitBreaker");
    const cb = new CircuitBreaker("test-reject", 2, 30_000);

    for (let i = 0; i < 2; i++) {
      await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    }

    const fn = vi.fn().mockResolvedValue("never");
    await expect(cb.call(fn)).rejects.toThrow("Circuit breaker OPEN");
    expect(fn).not.toHaveBeenCalled();
  });

  it("resets to closed state manually", async () => {
    const { CircuitBreaker } = await import("../../server/utils/circuitBreaker");
    const cb = new CircuitBreaker("test-reset", 2, 30_000);

    for (let i = 0; i < 2; i++) {
      await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    }

    expect(cb.getState().state).toBe("open");
    cb.reset();
    expect(cb.getState().state).toBe("closed");
    expect(cb.getState().failures).toBe(0);
  });

  it("resets failure count on success", async () => {
    const { CircuitBreaker } = await import("../../server/utils/circuitBreaker");
    const cb = new CircuitBreaker("test-recovery", 5, 30_000);

    await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    expect(cb.getState().failures).toBe(1);

    await cb.call(async () => "ok");
    expect(cb.getState().failures).toBe(0);
  });

  it("emits ALERT event when circuit opens", async () => {
    const { CircuitBreaker } = await import("../../server/utils/circuitBreaker");
    const { emitEvent } = await import("../../server/controlTower/eventBus");

    const cb = new CircuitBreaker("test-alert", 2, 30_000);
    for (let i = 0; i < 2; i++) {
      await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    }

    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ALERT",
        payload: expect.objectContaining({ severity: "CRITICAL" }),
      })
    );
  });

  it("getAllBreakerStates returns state for all 4 breakers", async () => {
    const { getAllBreakerStates } = await import("../../server/utils/circuitBreaker");
    const states = getAllBreakerStates();
    expect(states).toHaveLength(4);
    expect(states.map(s => s.name)).toEqual(expect.arrayContaining(["openai", "database", "twilio", "scoring"]));
    for (const s of states) {
      expect(["closed", "open", "half-open"]).toContain(s.state);
    }
  });
});

describe("HashChain audit — integration", () => {
  it("advances the hash chain with different hashes per entry", async () => {
    const { advanceChain } = await import("../../server/audit/hashChain");
    const r1 = advanceChain({ step: "INPUT_VALIDATION", traceId: "t1" } as any);
    const r2 = advanceChain({ step: "SAFETY_GATE", traceId: "t1" } as any);
    expect(r1.hash).toBeTruthy();
    expect(r2.hash).toBeTruthy();
    expect(r1.hash).not.toBe(r2.hash);
    expect(r2.prevHash).toBe(r1.hash);
  });

  it("verifies a valid chain link", async () => {
    const { advanceChain, verifyChainLink } = await import("../../server/audit/hashChain");
    const entry = { step: "BILLING", traceId: "verify-test" } as any;
    const { hash, prevHash } = advanceChain(entry);
    expect(verifyChainLink(entry, prevHash, hash)).toBe(true);
  });

  it("rejects a tampered chain link", async () => {
    const { advanceChain, verifyChainLink } = await import("../../server/audit/hashChain");
    const entry = { step: "EXPLANATION", traceId: "tamper-test" } as any;
    const { prevHash } = advanceChain(entry);
    const tamperedHash = "a".repeat(64);
    expect(verifyChainLink(entry, prevHash, tamperedHash)).toBe(false);
  });
});

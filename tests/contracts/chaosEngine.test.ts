import { describe, it, expect, beforeEach } from "vitest";
import {
  enableChaos,
  disableChaos,
  injectChaos,
  clearChaos,
  isChaosActive,
  getChaosState,
  maybeDelay,
  ChaosScenario,
} from "../../server/chaos/chaosEngine";

beforeEach(() => {
  disableChaos();
});

describe("Chaos Engine — enable / disable", () => {
  it("starts with chaos disabled", () => {
    const s = getChaosState();
    expect(s.enabled).toBe(false);
    expect(s.activeCount).toBe(0);
  });

  it("enables chaos", () => {
    enableChaos();
    expect(getChaosState().enabled).toBe(true);
  });

  it("disableChaos clears all scenarios", () => {
    enableChaos();
    injectChaos("db_down");
    injectChaos("redis_down");
    disableChaos();
    const s = getChaosState();
    expect(s.enabled).toBe(false);
    expect(s.activeCount).toBe(0);
  });
});

describe("Chaos Engine — injection and detection", () => {
  it("isChaosActive returns false when chaos disabled even if scenario set", () => {
    injectChaos("db_down");
    expect(isChaosActive("db_down")).toBe(false);
  });

  it("isChaosActive returns true when enabled and scenario injected", () => {
    enableChaos();
    injectChaos("db_down");
    expect(isChaosActive("db_down")).toBe(true);
  });

  it("isChaosActive returns false for non-injected scenario", () => {
    enableChaos();
    injectChaos("redis_down");
    expect(isChaosActive("db_down")).toBe(false);
    expect(isChaosActive("redis_down")).toBe(true);
  });

  it("clearChaos removes a single scenario", () => {
    enableChaos();
    injectChaos("db_down");
    injectChaos("redis_down");
    clearChaos("db_down");
    expect(isChaosActive("db_down")).toBe(false);
    expect(isChaosActive("redis_down")).toBe(true);
  });

  it("tracks activeCount correctly", () => {
    enableChaos();
    injectChaos("db_down");
    injectChaos("openai_down");
    expect(getChaosState().activeCount).toBe(2);
    clearChaos("db_down");
    expect(getChaosState().activeCount).toBe(1);
  });

  it("logs injections in recentInjections", () => {
    enableChaos();
    injectChaos("latency_spike");
    const log = getChaosState().recentInjections;
    expect(log.length).toBeGreaterThan(0);
    expect(log[log.length - 1].type).toBe("latency_spike");
  });
});

describe("Chaos Engine — all six scenarios", () => {
  const scenarios: ChaosScenario[] = [
    "db_down",
    "redis_down",
    "openai_down",
    "latency_spike",
    "queue_overload",
    "high_error_rate",
  ];

  it.each(scenarios)("can inject and detect scenario: %s", (scenario) => {
    enableChaos();
    injectChaos(scenario);
    expect(isChaosActive(scenario)).toBe(true);
    clearChaos(scenario);
    expect(isChaosActive(scenario)).toBe(false);
  });
});

describe("Chaos Engine — maybeDelay", () => {
  it("does not delay when chaos is disabled", async () => {
    const start = Date.now();
    await maybeDelay("latency_spike", 500);
    expect(Date.now() - start).toBeLessThan(200);
  });

  it("does not delay when scenario not injected", async () => {
    enableChaos();
    const start = Date.now();
    await maybeDelay("latency_spike", 500);
    expect(Date.now() - start).toBeLessThan(200);
  });

  it("delays when scenario is active", async () => {
    enableChaos();
    injectChaos("latency_spike");
    const start = Date.now();
    await maybeDelay("latency_spike", 100);
    expect(Date.now() - start).toBeGreaterThanOrEqual(95);
  });
});

describe("Chaos Engine — full chaos scenario", () => {
  it("enables all three failure modes simultaneously", () => {
    enableChaos();
    injectChaos("db_down");
    injectChaos("redis_down");
    injectChaos("openai_down");
    expect(isChaosActive("db_down")).toBe(true);
    expect(isChaosActive("redis_down")).toBe(true);
    expect(isChaosActive("openai_down")).toBe(true);
    expect(getChaosState().activeCount).toBe(3);
  });

  it("full chaos clears completely on disableChaos", () => {
    enableChaos();
    injectChaos("db_down");
    injectChaos("redis_down");
    injectChaos("openai_down");
    disableChaos();
    expect(isChaosActive("db_down")).toBe(false);
    expect(isChaosActive("redis_down")).toBe(false);
    expect(isChaosActive("openai_down")).toBe(false);
  });
});

describe("Chaos Engine — getChaosState", () => {
  it("returns enabledAt ISO timestamp when enabled", () => {
    enableChaos();
    const s = getChaosState();
    expect(s.enabledAt).not.toBeNull();
    expect(typeof s.enabledAt).toBe("string");
    expect(new Date(s.enabledAt!).getTime()).toBeGreaterThan(0);
  });

  it("returns null enabledAt when disabled", () => {
    const s = getChaosState();
    expect(s.enabledAt).toBeNull();
  });
});

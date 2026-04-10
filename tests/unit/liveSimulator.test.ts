import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  startLiveSimulation, stopLiveSimulation,
  getLiveSnapshot, getTickCount, isRunning, simBus,
} from "../../server/simulation/liveSimulator";
import {
  forecastSurge, forecastWithTrend, detectCapacityPressure,
  adjustCapacity, scaleWorkers, syncLearning, buildForecastReport,
} from "../../server/simulation/surgeForecast";
import {
  selectRegionByIp, getRegionUrl, globalFetch,
} from "../../server/infra/geoRouter";

// ── Live Simulator ───────────────────────────────────────────────────────────
describe("liveSimulator — start / stop / snapshot", () => {
  afterEach(() => stopLiveSimulation());

  it("isRunning() returns false before start", () => {
    expect(isRunning()).toBe(false);
  });

  it("startLiveSimulation() sets running state", () => {
    startLiveSimulation(10_000);
    expect(isRunning()).toBe(true);
    stopLiveSimulation();
    expect(isRunning()).toBe(false);
  });

  it("idempotent — calling start twice does not create two timers", () => {
    startLiveSimulation(10_000);
    startLiveSimulation(10_000);
    expect(isRunning()).toBe(true);
    stopLiveSimulation();
  });

  it("getLiveSnapshot() returns null before first tick", () => {
    expect(getLiveSnapshot()).toBeNull();
  });

  it("emits update events with correct shape", async () => {
    const snapshots: unknown[] = [];
    simBus.on("update", (snap) => snapshots.push(snap));
    startLiveSimulation(20);

    await new Promise(r => setTimeout(r, 70));
    stopLiveSimulation();
    simBus.removeAllListeners("update");

    expect(snapshots.length).toBeGreaterThan(0);
    const snap = snapshots[0] as any;
    expect(typeof snap.patients).toBe("number");
    expect(typeof snap.er).toBe("number");
    expect(typeof snap.critical).toBe("number");
    expect(["low", "normal", "high", "critical"]).toContain(snap.load);
    expect(snap.erRate).toBeGreaterThanOrEqual(0);
    expect(snap.erRate).toBeLessThanOrEqual(1);
  });

  it("getLiveSnapshot() returns latest snapshot after ticks", async () => {
    startLiveSimulation(20);
    await new Promise(r => setTimeout(r, 50));
    stopLiveSimulation();
    const snap = getLiveSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.tick).toBeGreaterThan(0);
  });

  it("getTickCount() increments with ticks", async () => {
    const before = getTickCount();
    startLiveSimulation(20);
    await new Promise(r => setTimeout(r, 70));
    stopLiveSimulation();
    expect(getTickCount()).toBeGreaterThan(before);
  });
});

// ── Surge Forecast ───────────────────────────────────────────────────────────
describe("surgeForecast — forecastSurge()", () => {
  it("returns 0 for empty history", () => {
    expect(forecastSurge([])).toBe(0);
  });

  it("forecasts 20% above average", () => {
    const h = [10, 20, 30];
    const avg = 20;
    expect(forecastSurge(h)).toBeCloseTo(avg * 1.2, 1);
  });

  it("forecastWithTrend() factors in growth trend", () => {
    const rising = [5, 10, 15, 20, 25];
    const stable = [20, 20, 20, 20, 20];
    const risingForecast = forecastWithTrend(rising);
    const stableForecast = forecastWithTrend(stable);
    expect(risingForecast).toBeGreaterThan(stableForecast);
  });
});

describe("surgeForecast — detectCapacityPressure()", () => {
  it("returns true when deviation exceeds 50%", () => {
    expect(detectCapacityPressure(20, 10)).toBe(true);
  });

  it("returns false when deviation is within threshold", () => {
    expect(detectCapacityPressure(11, 10)).toBe(false);
  });

  it("returns false for zero baseline", () => {
    expect(detectCapacityPressure(100, 0)).toBe(false);
  });
});

describe("surgeForecast — adjustCapacity()", () => {
  it("returns normal for low load", () => {
    expect(adjustCapacity(10)).toBe("normal");
  });

  it("returns restrict for load above threshold", () => {
    expect(adjustCapacity(35)).toBe("restrict");
  });

  it("returns overload for load 1.5x above threshold", () => {
    expect(adjustCapacity(50)).toBe("overload");
  });
});

describe("surgeForecast — scaleWorkers()", () => {
  it("returns 1 for empty queue", () => {
    expect(scaleWorkers(0)).toBe(1);
  });

  it("scales linearly with queue depth", () => {
    expect(scaleWorkers(25)).toBe(5);
    expect(scaleWorkers(50)).toBe(10);
  });

  it("caps at maxWorkers", () => {
    expect(scaleWorkers(1000, 20)).toBe(20);
  });
});

describe("surgeForecast — syncLearning()", () => {
  it("merges insights from all regions", () => {
    const regions = [
      { insights: ["a", "b"] },
      { insights: ["c"] },
      {},
    ];
    const merged = syncLearning(regions);
    expect(merged).toEqual(["a", "b", "c"]);
  });

  it("handles empty regions array", () => {
    expect(syncLearning([])).toEqual([]);
  });
});

describe("surgeForecast — buildForecastReport()", () => {
  it("returns complete report for valid history", () => {
    const r = buildForecastReport([10, 20, 30, 25, 35]);
    expect(typeof r.baseline).toBe("number");
    expect(typeof r.forecast).toBe("number");
    expect(typeof r.trendForecast).toBe("number");
    expect(["normal", "restrict", "overload"]).toContain(r.capacityState);
    expect(r.recommendedWorkers).toBeGreaterThanOrEqual(1);
    expect(typeof r.pressureDetected).toBe("boolean");
  });

  it("handles empty history gracefully", () => {
    const r = buildForecastReport([]);
    expect(r.baseline).toBe(0);
    expect(r.forecast).toBe(0);
  });
});

// ── Geo Router ───────────────────────────────────────────────────────────────
describe("geoRouter — selectRegionByIp()", () => {
  it("maps 172.x.x.x to us-east", () => {
    expect(selectRegionByIp("172.16.0.1")).toBe("us-east");
  });

  it("maps 10.x.x.x to us-west", () => {
    expect(selectRegionByIp("10.0.0.1")).toBe("us-west");
  });

  it("maps 192.x.x.x to eu-central", () => {
    expect(selectRegionByIp("192.168.1.1")).toBe("eu-central");
  });

  it("falls back to default for unknown IP", () => {
    expect(selectRegionByIp("1.2.3.4")).toBe("default");
  });

  it("handles ::ffff: IPv4-mapped IPv6 addresses", () => {
    const r = selectRegionByIp("::ffff:172.16.0.1");
    expect(r).toBe("us-east");
  });

  it("handles empty string gracefully", () => {
    const r = selectRegionByIp("");
    expect(["us-east", "us-west", "eu-central", "asia-pacific", "default"]).toContain(r);
  });
});

describe("geoRouter — getRegionUrl()", () => {
  it("returns null when env var not configured", () => {
    expect(getRegionUrl("us-east")).toBeNull();
  });
});

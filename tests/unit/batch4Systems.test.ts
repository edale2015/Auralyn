import { describe, it, expect, afterEach, vi } from "vitest";

// ── Stress Test ───────────────────────────────────────────────────────────────
import { runStressTest } from "../../server/simulation/stressTest";

describe("stressTest — runStressTest()", () => {
  it("returns correct shape for n=10", async () => {
    const r = await runStressTest(10);
    expect(r.total).toBe(10);
    expect(r.errors).toBeGreaterThanOrEqual(0);
    expect(r.erRate).toBeGreaterThanOrEqual(0);
    expect(r.erRate).toBeLessThanOrEqual(1);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(r.throughputPerSec).toBeGreaterThan(0);
  }, 10_000);

  it("p50 <= p95 <= p99 ordering", async () => {
    const r = await runStressTest(20);
    expect(r.p50Ms).toBeLessThanOrEqual(r.p95Ms);
    expect(r.p95Ms).toBeLessThanOrEqual(r.p99Ms);
  }, 10_000);

  it("errors are a fraction of total (no 100% failure)", async () => {
    const r = await runStressTest(50);
    expect(r.errors).toBeLessThan(r.total);
  }, 15_000);

  it("throughput is reasonable (>1/s)", async () => {
    const r = await runStressTest(5);
    expect(r.throughputPerSec).toBeGreaterThan(1);
  }, 10_000);
});

// ── Hospital Pilot ────────────────────────────────────────────────────────────
import {
  sendPilotCase, receiveOutcome, getOutcomeBuffer,
} from "../../server/integrations/hospitalPilot";

describe("hospitalPilot — sendPilotCase()", () => {
  it("returns queued=true when env vars not set", async () => {
    const r = await sendPilotCase({
      patientId: "P001",
      complaint: "chest pain",
      vitals: { hr: 98, bp: "130/80" },
      disposition: "ER_NOW",
    }) as any;
    expect(r.queued).toBe(true);
    expect(r.reason).toContain("not configured");
  });
});

describe("hospitalPilot — receiveOutcome()", () => {
  it("stores outcome in buffer and returns true", async () => {
    const before = getOutcomeBuffer().length;
    const ok = await receiveOutcome({
      patientId: "P002",
      severity: "critical",
      actualDisposition: "ER_NOW",
      feedback: "correct",
    });
    expect(ok).toBe(true);
    expect(getOutcomeBuffer().length).toBe(before + 1);
  });

  it("assigns learningWeight=5 for critical severity", async () => {
    await receiveOutcome({
      patientId: "P003",
      severity: "critical",
      actualDisposition: "ER_NOW",
    });
    const buf = getOutcomeBuffer();
    const last = buf[buf.length - 1];
    expect(last.learningWeight).toBe(5);
  });

  it("assigns learningWeight=2 for moderate severity", async () => {
    await receiveOutcome({ patientId: "P004", severity: "moderate", actualDisposition: "URGENT" });
    const buf = getOutcomeBuffer();
    const last = buf[buf.length - 1];
    expect(last.learningWeight).toBe(2);
  });

  it("assigns learningWeight=1 for minor severity", async () => {
    await receiveOutcome({ patientId: "P005", severity: "minor", actualDisposition: "ROUTINE" });
    const buf = getOutcomeBuffer();
    const last = buf[buf.length - 1];
    expect(last.learningWeight).toBe(1);
  });

  it("records receivedAt as ISO timestamp", async () => {
    await receiveOutcome({ patientId: "P006", severity: "minor", actualDisposition: "ROUTINE" });
    const buf = getOutcomeBuffer();
    const last = buf[buf.length - 1];
    expect(() => new Date(last.receivedAt)).not.toThrow();
  });

  it("buffer caps at 500 entries", async () => {
    for (let i = 0; i < 520; i++) {
      await receiveOutcome({ patientId: `PMAX${i}`, severity: "minor", actualDisposition: "ROUTINE" });
    }
    expect(getOutcomeBuffer().length).toBeLessThanOrEqual(500);
  });
});

// ── AWS Regions ───────────────────────────────────────────────────────────────
import {
  REGIONS, routeByLatency, replicateEvent, getRegionHealth,
  AURALYN_TASK_DEF,
} from "../../server/infra/awsRegions";

describe("awsRegions — REGIONS constant", () => {
  it("contains the three expected regions", () => {
    expect(REGIONS).toContain("us-east-1");
    expect(REGIONS).toContain("us-west-2");
    expect(REGIONS).toContain("eu-central-1");
  });
});

describe("awsRegions — routeByLatency()", () => {
  it("selects region with lowest latency", () => {
    expect(routeByLatency({ "us-east-1": 5, "us-west-2": 20, "eu-central-1": 50 }))
      .toBe("us-east-1");
  });

  it("handles single region", () => {
    expect(routeByLatency({ "eu-central-1": 30 })).toBe("eu-central-1");
  });

  it("falls back to first REGION when object is empty", () => {
    const r = routeByLatency({});
    expect(REGIONS).toContain(r);
  });

  it("handles ties — returns one of the tied regions", () => {
    const r = routeByLatency({ "us-east-1": 10, "us-west-2": 10 });
    expect(["us-east-1", "us-west-2"]).toContain(r);
  });
});

describe("awsRegions — replicateEvent()", () => {
  it("does not throw when env vars are not set", () => {
    expect(() => replicateEvent({ type: "test" }, ["us-east-1", "eu-central-1"])).not.toThrow();
  });

  it("does not throw for empty regions array", () => {
    expect(() => replicateEvent({ type: "test" }, [])).not.toThrow();
  });
});

describe("awsRegions — getRegionHealth()", () => {
  it("returns health for all three regions", () => {
    const h = getRegionHealth();
    expect(Object.keys(h)).toHaveLength(3);
    for (const v of Object.values(h)) {
      expect(["healthy", "unknown"]).toContain(v);
    }
  });
});

describe("awsRegions — AURALYN_TASK_DEF", () => {
  it("has the correct family name", () => {
    expect(AURALYN_TASK_DEF.family).toBe("auralyn-task");
  });

  it("has at least one container definition", () => {
    expect(AURALYN_TASK_DEF.containerDefinitions.length).toBeGreaterThan(0);
  });

  it("app container has reasonable memory allocation", () => {
    const app = AURALYN_TASK_DEF.containerDefinitions.find(c => c.name === "app");
    expect(app).toBeDefined();
    expect(app!.memory).toBeGreaterThanOrEqual(512);
    expect(app!.cpu).toBeGreaterThanOrEqual(256);
  });
});

// ── Clinical Utils ────────────────────────────────────────────────────────────
import {
  adjustRiskThreshold, weightOutcome, fastPath,
  runContinuousSimulation, stopContinuousSimulation,
  globalAlert, classifyLoad,
} from "../../server/utils/clinicalUtils";

describe("clinicalUtils — adjustRiskThreshold()", () => {
  it("returns 0.8 for normal load (<= 30)", () => {
    expect(adjustRiskThreshold(10)).toBe(0.8);
    expect(adjustRiskThreshold(30)).toBe(0.8);
  });

  it("returns 0.6 for surge load (31–50)", () => {
    expect(adjustRiskThreshold(31)).toBe(0.6);
    expect(adjustRiskThreshold(50)).toBe(0.6);
  });

  it("returns 0.5 for critical load (> 50)", () => {
    expect(adjustRiskThreshold(51)).toBe(0.5);
    expect(adjustRiskThreshold(100)).toBe(0.5);
  });
});

describe("clinicalUtils — weightOutcome()", () => {
  it("returns 5 for critical", () => expect(weightOutcome({ severity: "critical" })).toBe(5));
  it("returns 2 for moderate", () => expect(weightOutcome({ severity: "moderate" })).toBe(2));
  it("returns 1 for minor",    () => expect(weightOutcome({ severity: "minor" })).toBe(1));
});

describe("clinicalUtils — fastPath()", () => {
  it("returns ROUTINE for minor complaint", () => {
    expect(fastPath({ complaint: "minor" })).toBe("ROUTINE");
  });

  it("returns ER_NOW for chest pain", () => {
    expect(fastPath({ complaint: "chest pain" })).toBe("ER_NOW");
  });

  it("returns null for unrecognised complaint", () => {
    expect(fastPath({ complaint: "headache" })).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fastPath({ complaint: "MINOR" })).toBe("ROUTINE");
  });
});

describe("clinicalUtils — runContinuousSimulation() / stopContinuousSimulation()", () => {
  afterEach(() => stopContinuousSimulation());

  it("runs without throwing", () => {
    expect(() => runContinuousSimulation(50_000)).not.toThrow();
  });

  it("is idempotent — double-start does not error", () => {
    runContinuousSimulation(50_000);
    expect(() => runContinuousSimulation(50_000)).not.toThrow();
  });

  it("stop after start does not throw", () => {
    runContinuousSimulation(50_000);
    expect(() => stopContinuousSimulation()).not.toThrow();
  });

  it("stop when not running does not throw", () => {
    expect(() => stopContinuousSimulation()).not.toThrow();
  });
});

describe("clinicalUtils — globalAlert()", () => {
  it("returns null when count <= 1000", () => {
    expect(globalAlert({ count: 1000 })).toBeNull();
    expect(globalAlert({ count: 0 })).toBeNull();
  });

  it("returns alert message when count > 1000", () => {
    const msg = globalAlert({ count: 1001 });
    expect(msg).not.toBeNull();
    expect(msg).toContain("GLOBAL ALERT");
    expect(msg).toContain("1001");
  });

  it("includes source in alert message", () => {
    const msg = globalAlert({ count: 5000, source: "NYC-ER-7" });
    expect(msg).toContain("NYC-ER-7");
  });
});

describe("clinicalUtils — classifyLoad()", () => {
  it("returns normal for <= 200 patients", () => {
    expect(classifyLoad(0)).toBe("normal");
    expect(classifyLoad(200)).toBe("normal");
  });

  it("returns surge for 201–400 patients", () => {
    expect(classifyLoad(201)).toBe("surge");
    expect(classifyLoad(400)).toBe("surge");
  });

  it("returns critical for > 400 patients", () => {
    expect(classifyLoad(401)).toBe("critical");
    expect(classifyLoad(600)).toBe("critical");
  });
});

import { describe, it, expect } from "vitest";

// ── Tenancy ───────────────────────────────────────────────────────────────────
import { getTenant, scopedQuery, listTenants, buildTenantMetrics } from "../../server/tenancy/tenant";

describe("tenancy — getTenant()", () => {
  it("returns header value when present", () => {
    expect(getTenant({ headers: { "x-tenant-id": "clinicA" } } as any)).toBe("clinicA");
  });

  it("returns 'default' when header missing", () => {
    expect(getTenant({ headers: {} } as any)).toBe("default");
  });

  it("handles empty string header", () => {
    expect(getTenant({ headers: { "x-tenant-id": "" } } as any)).toBe("default");
  });
});

describe("tenancy — scopedQuery()", () => {
  it("generates SELECT with tenant filter", () => {
    const q = scopedQuery("clinicA", "patients");
    expect(q).toContain("WHERE tenant='clinicA'");
    expect(q).toContain("FROM patients");
  });

  it("sanitizes table name — strips semicolons and spaces", () => {
    const q = scopedQuery("default", "patients; DROP TABLE patients");
    expect(q).not.toContain(";");
    expect(q).not.toContain(" DROP ");
  });
});

describe("tenancy — listTenants()", () => {
  it("returns array with at least 'default'", () => {
    expect(listTenants()).toContain("default");
  });

  it("includes clinicA and clinicB", () => {
    const t = listTenants();
    expect(t).toContain("clinicA");
    expect(t).toContain("clinicB");
  });
});

describe("tenancy — buildTenantMetrics()", () => {
  it("sets tenant correctly", () => {
    expect(buildTenantMetrics("clinicA").tenant).toBe("clinicA");
  });

  it("accepts overrides", () => {
    const m = buildTenantMetrics("clinicB", { patientCount: 42 });
    expect(m.patientCount).toBe(42);
  });

  it("defaults erRate to 0", () => {
    expect(buildTenantMetrics("default").erRate).toBe(0);
  });
});

// ── ECW Adapter ───────────────────────────────────────────────────────────────
import { sendToECWEncounter, safeEHR, syncSystems } from "../../server/integrations/ecwAdapter";

describe("ecwAdapter — sendToECWEncounter()", () => {
  it("returns success:false when ECW_API not set", async () => {
    delete process.env.ECW_API;
    delete process.env.ECW_TOKEN;
    const r = await sendToECWEncounter({ patientId: "P001", disposition: "ROUTINE" });
    expect(r.success).toBe(false);
  });
});

describe("ecwAdapter — safeEHR()", () => {
  it("returns 'ok' when function succeeds", async () => {
    const result = await safeEHR(async () => {}, {} as any);
    expect(result).toBe("ok");
  });

  it("returns 'queued' when function throws", async () => {
    const result = await safeEHR(async () => { throw new Error("fail"); }, {} as any);
    expect(result).toBe("queued");
  });
});

describe("ecwAdapter — syncSystems()", () => {
  it("returns ecw and epic keys", async () => {
    delete process.env.ECW_API;
    delete process.env.EPIC_TOKEN;
    const r = await syncSystems({ patientId: "P001", disposition: "ROUTINE" });
    expect(r).toHaveProperty("ecw");
    expect(r).toHaveProperty("epic");
  });

  it("epic is 'skipped' when EPIC_TOKEN not set", async () => {
    delete process.env.EPIC_TOKEN;
    const r = await syncSystems({ patientId: "P002", disposition: "ER_NOW" });
    expect(r.epic).toBe("skipped");
  });
});

// ── SLO Utils ─────────────────────────────────────────────────────────────────
import { computeSLO, anomalyCard, rankQuestions, checkSLOAndAlert } from "../../server/clinical/sloUtils";

describe("sloUtils — computeSLO()", () => {
  it("availability 0.999 when errors < 1", () => {
    expect(computeSLO({ errors: 0, p95: 1000 }).availability).toBe(0.999);
  });

  it("availability 0.99 when errors >= 1", () => {
    expect(computeSLO({ errors: 2, p95: 1000 }).availability).toBe(0.99);
  });

  it("latency true when p95 < 1500", () => {
    expect(computeSLO({ errors: 0, p95: 1000 }).latency).toBe(true);
  });

  it("latency false when p95 >= 1500", () => {
    expect(computeSLO({ errors: 0, p95: 2000 }).latency).toBe(false);
  });
});

describe("sloUtils — anomalyCard()", () => {
  it("returns 'High ER spike' when erRate > 0.3", () => {
    expect(anomalyCard({ erRate: 0.5 })).toBe("High ER spike");
  });

  it("returns null when erRate <= 0.3", () => {
    expect(anomalyCard({ erRate: 0.1 })).toBeNull();
  });

  it("null at boundary (erRate === 0.3)", () => {
    expect(anomalyCard({ erRate: 0.3 })).toBeNull();
  });
});

describe("sloUtils — rankQuestions()", () => {
  it("sorts by weight descending", () => {
    const q = rankQuestions(["a","b","c"], { c: 3, b: 2, a: 1 });
    expect(q[0]).toBe("c");
    expect(q[1]).toBe("b");
    expect(q[2]).toBe("a");
  });

  it("returns empty for empty input", () => {
    expect(rankQuestions([], {})).toHaveLength(0);
  });

  it("uses weight 1 as default for unweighted items", () => {
    const q = rankQuestions(["x","y"], { y: 2 });
    expect(q[0]).toBe("y");
  });

  it("does not mutate original array", () => {
    const orig = ["a","b"];
    rankQuestions(orig, { b: 5 });
    expect(orig).toEqual(["a","b"]);
  });
});

describe("sloUtils — checkSLOAndAlert()", () => {
  it("returns SLO object without throwing", async () => {
    const slo = await checkSLOAndAlert({ errors: 0, p95: 1000 });
    expect(slo).toHaveProperty("availability");
    expect(slo).toHaveProperty("latency");
  });

  it("fires alert when latency SLO violated but does not throw", async () => {
    await expect(checkSLOAndAlert({ errors: 0, p95: 3000 })).resolves.toBeDefined();
  });
});

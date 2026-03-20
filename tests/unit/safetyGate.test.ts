import { describe, it, expect } from "vitest";
import { runSafetyGate } from "../../server/safety/safetyGate";

describe("runSafetyGate", () => {
  it("returns LOW level and allows flow when no risks present", () => {
    const result = runSafetyGate({ age: 30 }, {});
    expect(result.level).toBe("LOW");
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks HIGH-risk chest pain for age > 50", () => {
    const result = runSafetyGate({ chestPain: true, age: 55 }, {});
    expect(result.reasons.some((r) => r.toLowerCase().includes("chest pain"))).toBe(true);
  });

  it("escalates infant (<1yr) with fever to CRITICAL", () => {
    const result = runSafetyGate({ ageYears: 0.5, fever: true }, {});
    expect(result.reasons.some((r) => r.toLowerCase().includes("infant"))).toBe(true);
  });

  it("flags hypoxia when SpO2 below 92", () => {
    const result = runSafetyGate({ oxygenSaturation: 88 }, {});
    expect(result.reasons.some((r) => r.toLowerCase().includes("hypoxia"))).toBe(true);
  });

  it("flags tachypnoea when RR > 25", () => {
    const result = runSafetyGate({ respiratoryRate: 28 }, {});
    expect(result.reasons.some((r) => r.toLowerCase().includes("tachypno"))).toBe(true);
  });

  it("flags pediatric high-risk when checks indicate HIGH", () => {
    const result = runSafetyGate({}, { pediatric: { risk: "HIGH", reason: "sepsis" } });
    expect(result.reasons.some((r) => r.toLowerCase().includes("pediatric"))).toBe(true);
  });

  it("flags pregnancy contraindication when checks indicate HIGH", () => {
    const result = runSafetyGate({}, { pregnancy: { risk: "HIGH", reason: "teratogenic medication" } });
    expect(result.reasons.some((r) => r.toLowerCase().includes("pregnancy"))).toBe(true);
  });

  it("flags drug interactions when drug array is non-empty", () => {
    const result = runSafetyGate({}, { drug: ["warfarin+aspirin"] });
    expect(result.reasons.some((r) => r.toLowerCase().includes("drug"))).toBe(true);
  });

  it("sets HIGH level when 3 or more reasons accumulate", () => {
    const result = runSafetyGate(
      { chestPain: true, age: 55, oxygenSaturation: 88, respiratoryRate: 30 },
      {}
    );
    expect(result.level).toBe("HIGH");
    expect(result.allowed).toBe(false);
    expect(result.blockedAt).toBeDefined();
  });

  it("sets MEDIUM level for 1-2 risks and still allows flow", () => {
    const result = runSafetyGate({ chestPain: true, age: 55 }, {});
    expect(result.level).toBe("MEDIUM");
    expect(result.allowed).toBe(true);
  });
});

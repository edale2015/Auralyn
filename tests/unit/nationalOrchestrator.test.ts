import { describe, it, expect } from "vitest";
import { aggregateRegionalStates } from "../../server/national/federationEngine";
import { mergeLearningSignals }    from "../../server/national/crossRegionLearning";
import { balanceAcrossRegions }    from "../../server/national/nationalLoadBalancer";
import { enforceRegionalPolicies } from "../../server/national/policyLayer";
import { computeScalingActions }   from "../../server/national/scalingController";
import { detectNationalPatterns }  from "../../server/national/nationalPopulation";

// ── Shared fixture ────────────────────────────────────────────────────────────

const makeRegion = (name: string, strain: number, state: "stable" | "strained" | "critical", surge: "none" | "watch" | "surge" | "critical", patients: number) => ({
  regionName: name,
  state:      "NY",
  summary:   { totalPatients: patients, erSuggested: Math.floor(patients * 0.15) },
  capacityState: { strainScore: strain, systemState: state },
  surgeState:    { status: surge },
  populationSignals: { topComplaints: [
    { complaint: "fever",  count: Math.floor(patients * 0.2) },
    { complaint: "cough",  count: Math.floor(patients * 0.15) },
  ]},
});

const NYC      = makeRegion("NYC",      7.2, "strained", "surge",   480);
const LA       = makeRegion("LA",       4.8, "stable",   "watch",   340);
const Chicago  = makeRegion("Chicago",  3.5, "stable",   "none",    260);
const Miami    = makeRegion("Miami",    8.9, "critical", "critical",180);
const Seattle  = makeRegion("Seattle",  2.1, "stable",   "none",    120);

const ALL_REGIONS = [NYC, LA, Chicago, Miami, Seattle];

// ── Federation Engine ─────────────────────────────────────────────────────────

describe("aggregateRegionalStates", () => {
  it("sums patient counts across all regions", () => {
    const result = aggregateRegionalStates(ALL_REGIONS);
    expect(result.totalPatients).toBe(480 + 340 + 260 + 180 + 120);
  });

  it("computes avgStrainScore correctly", () => {
    const result = aggregateRegionalStates(ALL_REGIONS);
    const expected = (7.2 + 4.8 + 3.5 + 8.9 + 2.1) / 5;
    expect(result.avgStrainScore).toBeCloseTo(expected, 2);
  });

  it("identifies critical regions", () => {
    const result = aggregateRegionalStates(ALL_REGIONS);
    expect(result.criticalRegions).toContain("Miami");
    expect(result.criticalRegions).not.toContain("Chicago");
  });

  it("identifies stable regions", () => {
    const result = aggregateRegionalStates(ALL_REGIONS);
    expect(result.stableRegions).toContain("LA");
    expect(result.stableRegions).toContain("Seattle");
    expect(result.stableRegions).not.toContain("Miami");
  });

  it("handles empty input gracefully", () => {
    const result = aggregateRegionalStates([]);
    expect(result.totalPatients).toBe(0);
    expect(result.avgStrainScore).toBe(0);
    expect(result.regions).toHaveLength(0);
  });

  it("avgLoad is normalized 0–1 (strain / 10)", () => {
    const result = aggregateRegionalStates(ALL_REGIONS);
    expect(result.avgLoad).toBeLessThanOrEqual(1);
    expect(result.avgLoad).toBeGreaterThan(0);
    expect(result.avgLoad).toBeCloseTo(result.avgStrainScore / 10, 2);
  });
});

// ── Cross-Region Learning ─────────────────────────────────────────────────────

describe("mergeLearningSignals", () => {
  it("aggregates complaint counts across regions", () => {
    const result = mergeLearningSignals(ALL_REGIONS);
    const feverSignal = result.topNationalSignals.find(([c]) => c === "fever");
    expect(feverSignal).toBeDefined();
    // fever = sum of 20% of each region's patients
    const expected = ALL_REGIONS.reduce((s, r) => s + Math.floor(r.summary.totalPatients * 0.2), 0);
    expect(feverSignal![1]).toBe(expected);
  });

  it("returns top 10 signals max", () => {
    const result = mergeLearningSignals(ALL_REGIONS);
    expect(result.topNationalSignals.length).toBeLessThanOrEqual(10);
  });

  it("generates a recommendation when signals exist", () => {
    const result = mergeLearningSignals(ALL_REGIONS);
    expect(result.recommendation).toBeTruthy();
    expect(result.recommendation).toContain("fever");
  });

  it("returns null recommendation for empty input", () => {
    const result = mergeLearningSignals([]);
    expect(result.recommendation).toBeNull();
  });

  it("tracks confidence score between 0 and 1", () => {
    const result = mergeLearningSignals(ALL_REGIONS);
    for (const s of result.learningSignals) {
      expect(s.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(s.confidenceScore).toBeLessThanOrEqual(1);
    }
  });

  it("generates cross-regional alerts for widespread complaints", () => {
    // All 5 regions report fever — should produce a cross-regional alert
    const result = mergeLearningSignals(ALL_REGIONS);
    expect(result.crossRegionalAlerts.length).toBeGreaterThan(0);
    expect(result.crossRegionalAlerts[0]).toContain("region");
  });
});

// ── Load Balancer ─────────────────────────────────────────────────────────────

describe("balanceAcrossRegions", () => {
  it("recommends the lowest strain region", () => {
    const result = balanceAcrossRegions({ regions: ALL_REGIONS });
    // Seattle has lowest strain (2.1)
    expect(result.recommendedShift).toBe("Seattle");
  });

  it("identifies overflow regions (strain >= 7)", () => {
    const result = balanceAcrossRegions({ regions: ALL_REGIONS });
    expect(result.overflowRegions).toContain("NYC");
    expect(result.overflowRegions).toContain("Miami");
  });

  it("generates transfer suggestions for critical regions", () => {
    const result = balanceAcrossRegions({ regions: ALL_REGIONS });
    // Miami is critical → should get a transfer suggestion
    const miamiTransfer = result.transferSuggestions.find(t => t.from === "Miami");
    expect(miamiTransfer).toBeDefined();
  });

  it("handles empty regions gracefully", () => {
    const result = balanceAcrossRegions({ regions: [] });
    expect(result.recommendedShift).toBeNull();
    expect(result.overflowRegions).toHaveLength(0);
  });

  it("marks telemed viable when avg strain is moderate", () => {
    const result = balanceAcrossRegions({ regions: [LA, Chicago, Seattle] });
    expect(result.telemedOverflowViable).toBe(true);
  });
});

// ── Policy Layer ──────────────────────────────────────────────────────────────

describe("enforceRegionalPolicies", () => {
  it("NY: telemed allowed, physician review required, not ILC", () => {
    const result = enforceRegionalPolicies({ state: "NY", country: "US" });
    expect(result.allowTelemed).toBe(true);
    expect(result.requiresPhysicianReview).toBe(true);
    expect(result.ilcCompactMember).toBe(false);
    expect(result.jurisdiction).toBe("NY");
  });

  it("TX: ILC member — cross-state prescribing allowed", () => {
    const result = enforceRegionalPolicies({ state: "TX", country: "US" });
    expect(result.ilcCompactMember).toBe(true);
    expect(result.crossStatePrescribingAllowed).toBe(true);
  });

  it("CA: telemed allowed, physician review not required", () => {
    const result = enforceRegionalPolicies({ state: "CA", country: "US" });
    expect(result.allowTelemed).toBe(true);
    expect(result.requiresPhysicianReview).toBe(false);
  });

  it("non-US country returns standard international policy", () => {
    const result = enforceRegionalPolicies({ country: "DE" });
    expect(result.allowTelemed).toBe(true);
    expect(result.jurisdiction).toBe("DE");
  });

  it("unknown state returns default policy", () => {
    const result = enforceRegionalPolicies({ state: "ZZ", country: "US" });
    expect(result.allowTelemed).toBe(true);
    expect(result.ilcCompactMember).toBe(false);
  });
});

// ── Scaling Controller ────────────────────────────────────────────────────────

describe("computeScalingActions", () => {
  it("no actions when system is normal", () => {
    const result = computeScalingActions({ totalPatients: 200, avgStrainScore: 3, totalER: 20, criticalRegions: [], surgeRegions: [], nationalPatternAlert: false });
    expect(result.alertLevel).toBe("normal");
    expect(result.actions).toHaveLength(0);
    expect(result.autonomousScale).toBe(false);
  });

  it("triggers telemed scale-up above 1000 patients", () => {
    const result = computeScalingActions({ totalPatients: 1200, avgStrainScore: 4, totalER: 100, criticalRegions: [], surgeRegions: [], nationalPatternAlert: false });
    expect(result.actions.some(a => a.action.includes("telemed"))).toBe(true);
  });

  it("triggers fast-path triage when avg strain > 5", () => {
    const result = computeScalingActions({ totalPatients: 500, avgStrainScore: 6, totalER: 50, criticalRegions: [], surgeRegions: [], nationalPatternAlert: false });
    expect(result.actions.some(a => a.action.includes("fast-path"))).toBe(true);
  });

  it("cross-region redistribution triggered for critical regions", () => {
    const result = computeScalingActions({ totalPatients: 800, avgStrainScore: 7, totalER: 120, criticalRegions: ["Miami"], surgeRegions: [], nationalPatternAlert: false });
    expect(result.actions.some(a => a.action.includes("redistribution"))).toBe(true);
    expect(result.alertLevel).toBe("critical");
    expect(result.autonomousScale).toBe(true);
  });

  it("national pattern alert triggers public health action", () => {
    const result = computeScalingActions({ totalPatients: 300, avgStrainScore: 3, totalER: 30, criticalRegions: [], surgeRegions: [], nationalPatternAlert: true });
    expect(result.actions.some(a => a.action.includes("public health"))).toBe(true);
  });

  it("ER rate > 20% triggers parallel triage lanes", () => {
    const result = computeScalingActions({ totalPatients: 500, avgStrainScore: 4, totalER: 120, criticalRegions: [], surgeRegions: [], nationalPatternAlert: false });
    expect(result.actions.some(a => a.action.includes("parallel triage"))).toBe(true);
  });
});

// ── National Population Intelligence ─────────────────────────────────────────

describe("detectNationalPatterns", () => {
  it("returns no clusters for low-volume signals", () => {
    const tiny = [makeRegion("A", 2, "stable", "none", 10)];
    const result = detectNationalPatterns(tiny);
    expect(result.clusters).toHaveLength(0);
    expect(result.alert).toBe(false);
  });

  it("detects watch cluster at 20–49 cases", () => {
    const regions = ALL_REGIONS.slice(0, 3); // NYC + LA + Chicago
    const result  = detectNationalPatterns(regions);
    // fever = 96 + 68 + 52 = 216 across 3 regions → should trigger alert
    expect(result.clusters.some(c => c.complaint === "fever")).toBe(true);
  });

  it("alert or pandemic_signal when fever spans all regions", () => {
    const result = detectNationalPatterns(ALL_REGIONS);
    const feverCluster = result.clusters.find(c => c.complaint === "fever");
    // All 5 regions report fever with count > 200 total → pandemic_signal or alert
    expect(["alert", "pandemic_signal"]).toContain(feverCluster?.alertLevel);
    expect(result.alert).toBe(true);
  });

  it("provides public health alerts for alert-level clusters", () => {
    const result = detectNationalPatterns(ALL_REGIONS);
    expect(result.publicHealthAlerts.length).toBeGreaterThan(0);
    expect(result.publicHealthAlerts[0]).toContain("region");
  });

  it("attaches syndromic label for known complaints", () => {
    const result = detectNationalPatterns(ALL_REGIONS);
    const fever = result.clusters.find(c => c.complaint === "fever");
    expect(fever?.syndromicLabel).toContain("Influenza");
  });

  it("returns topComplaints sorted by count descending", () => {
    const result = detectNationalPatterns(ALL_REGIONS);
    for (let i = 1; i < result.topComplaints.length; i++) {
      expect(result.topComplaints[i - 1].count).toBeGreaterThanOrEqual(result.topComplaints[i].count);
    }
  });
});

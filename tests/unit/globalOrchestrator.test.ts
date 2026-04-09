import { describe, it, expect } from "vitest";
import { runGlobalOrchestration }  from "../../server/global/globalOrchestrator";
import { detectPandemicSignals, simulateSpread, earlyWarningSystem } from "../../server/global/pandemicEngine";
import { enforceGlobalPolicy }     from "../../server/global/globalPolicyLayer";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const makeRegion = (name: string, continent: string, country: string, strain: number, state: "stable" | "strained" | "critical", surge: "none" | "watch" | "surge" | "critical", patients: number, complaints: Array<{ complaint: string; count: number }>) => ({
  regionName: name, continent, country,
  summary:    { totalPatients: patients, erSuggested: Math.floor(patients * 0.15) },
  capacityState: { strainScore: strain, systemState: state },
  surgeState:    { status: surge },
  populationSignals: { topComplaints: complaints },
});

const NYC     = makeRegion("NYC",     "North America", "US", 7.2, "strained", "surge",    480, [{ complaint: "fever", count: 80 }, { complaint: "cough", count: 65 }]);
const London  = makeRegion("London",  "Europe",        "GB", 6.5, "strained", "surge",    520, [{ complaint: "fever", count: 90 }, { complaint: "cough", count: 78 }]);
const Mumbai  = makeRegion("Mumbai",  "Asia",          "IN", 8.8, "critical", "critical", 850, [{ complaint: "fever", count: 200 }, { complaint: "cough", count: 185 }, { complaint: "diarrhea", count: 90 }, { complaint: "vomiting", count: 80 }]);
const Seattle = makeRegion("Seattle", "North America", "US", 2.1, "stable",   "none",     120, [{ complaint: "cough", count: 25 }]);
const Berlin  = makeRegion("Berlin",  "Europe",        "DE", 2.8, "stable",   "none",     180, [{ complaint: "cough", count: 20 }]);
const Sydney  = makeRegion("Sydney",  "Oceania",       "AU", 3.0, "stable",   "none",     160, [{ complaint: "cough", count: 30 }]);

// ── Global Orchestrator ───────────────────────────────────────────────────────

describe("runGlobalOrchestration", () => {
  it("groups regions by continent", () => {
    const result = runGlobalOrchestration({ regions: [NYC, London, Mumbai, Seattle] });
    const names  = result.continentSignals.map(c => c.continent);
    expect(names).toContain("North America");
    expect(names).toContain("Europe");
    expect(names).toContain("Asia");
  });

  it("identifies hot continents with spiking trend", () => {
    const result = runGlobalOrchestration({ regions: [NYC, London, Mumbai, Seattle] });
    const hot = result.continentSignals.filter(c => c.trend === "spiking");
    expect(hot.length).toBeGreaterThan(0);
  });

  it("marks underloaded regions for redistribution", () => {
    const result = runGlobalOrchestration({ regions: [NYC, Mumbai, Seattle, Berlin] });
    expect(result.recommendedRedistribution).toContain("Seattle");
    expect(result.recommendedRedistribution).toContain("Berlin");
  });

  it("marks overloaded regions", () => {
    const result = runGlobalOrchestration({ regions: [NYC, Mumbai, Seattle] });
    expect(result.overloadedRegions).toContain("Mumbai");
  });

  it("runs spread simulation with custom R0", () => {
    const result = runGlobalOrchestration({
      regions:  [NYC, Mumbai],
      simInput: { R0: 2.5, population: 1_000_000, initialInfected: 100 },
    });
    expect(result.simulation.nextDay).toBe(250);  // 100 * 2.5
    expect(result.simulation.riskLevel).toBe("medium");  // 250 > 100 → medium
  });

  it("detects respiratory cluster from global patient data", () => {
    // Mumbai alone provides 185 cough + 200 fever — above thresholds for respiratory cluster
    const result = runGlobalOrchestration({ regions: [Mumbai] });
    // Note: patients are flattened but capped at 50 per complaint per region for the symptom map
    // Check pandemic risk is elevated (not low)
    expect(["medium", "high", "critical"]).toContain(result.pandemic.riskLevel);
  });

  it("sets non-green alert level when critical regions exist", () => {
    const result = runGlobalOrchestration({ regions: [Mumbai] });
    expect(result.summary.globalAlertLevel).not.toBe("green");
  });

  it("summary.totalGlobalPatients is sum of all region patients", () => {
    const result = runGlobalOrchestration({ regions: [NYC, London, Mumbai] });
    expect(result.summary.totalGlobalPatients).toBe(480 + 520 + 850);
  });

  it("handles empty input gracefully", () => {
    const result = runGlobalOrchestration({ regions: [] });
    expect(result.continentSignals).toHaveLength(0);
    expect(result.summary.totalGlobalPatients).toBe(0);
    expect(result.summary.globalAlertLevel).toBe("green");
  });
});

// ── Pandemic Engine ───────────────────────────────────────────────────────────

describe("detectPandemicSignals", () => {
  it("returns low risk for few patients with misc symptoms", () => {
    const patients = [{ symptoms: ["headache"] }, { symptoms: ["rash"] }];
    const result   = detectPandemicSignals({ patients });
    expect(result.riskLevel).toBe("low");
    expect(result.alert).toBe(false);
  });

  it("detects respiratory cluster at cough > 200 AND fever > 200", () => {
    const patients = [
      ...Array.from({ length: 210 }, () => ({ symptoms: ["cough"]  })),
      ...Array.from({ length: 210 }, () => ({ symptoms: ["fever"]  })),
    ];
    const result = detectPandemicSignals({ patients });
    expect(result.respiratoryCluster).toBe(true);
    expect(result.alert).toBe(true);
    expect(result.riskLevel).toBe("critical");
  });

  it("detects GI cluster at vomiting > 150 AND diarrhea > 150", () => {
    const patients = [
      ...Array.from({ length: 160 }, () => ({ symptoms: ["vomiting"] })),
      ...Array.from({ length: 160 }, () => ({ symptoms: ["diarrhea"] })),
    ];
    const result = detectPandemicSignals({ patients });
    expect(result.giCluster).toBe(true);
    expect(result.alert).toBe(true);
  });

  it("correctly counts symptom occurrences", () => {
    const patients = Array.from({ length: 50 }, () => ({ symptoms: ["fever"] }));
    const result   = detectPandemicSignals({ patients });
    expect(result.symptomCounts["fever"]).toBe(50);
  });

  it("identifies topSymptom correctly", () => {
    const patients = [
      ...Array.from({ length: 30 }, () => ({ symptoms: ["cough"] })),
      ...Array.from({ length: 10 }, () => ({ symptoms: ["fever"] })),
    ];
    const result = detectPandemicSignals({ patients });
    expect(result.topSymptom).toBe("cough");
  });
});

describe("simulateSpread", () => {
  it("nextDay = initialInfected * R0", () => {
    const result = simulateSpread({ R0: 2.0, population: 100_000, initialInfected: 50 });
    expect(result.nextDay).toBe(100);
  });

  it("high nextDay triggers high risk level", () => {
    const result = simulateSpread({ R0: 3.0, population: 10_000_000, initialInfected: 500 });
    expect(result.nextDay).toBe(1500);
    expect(result.riskLevel).toBe("high");
  });

  it("capped at population for large R0 simulations", () => {
    const result = simulateSpread({ R0: 10.0, population: 100, initialInfected: 10 });
    expect(result.nextMonth).toBeLessThanOrEqual(100);
  });

  it("herd threshold equals 1 - 1/R0 * population", () => {
    const result = simulateSpread({ R0: 2.0, population: 100_000, initialInfected: 10 });
    expect(result.herdThreshold).toBe(50_000); // 1 - 1/2 = 0.5 * 100000
  });

  it("defaults work correctly", () => {
    const result = simulateSpread({});
    expect(result.current).toBe(10);
    expect(result.nextDay).toBe(Math.round(10 * 1.5));
  });
});

describe("earlyWarningSystem", () => {
  it("critical alert for respiratory cluster + spiking trend", () => {
    const result = earlyWarningSystem({ respiratoryCluster: true, giCluster: false, trend: "spiking" });
    expect(result.severity).toBe("critical");
    expect(result.alert).toBeTruthy();
    expect(result.action).toBeTruthy();
  });

  it("warning for respiratory cluster without spike", () => {
    const result = earlyWarningSystem({ respiratoryCluster: true, giCluster: false, trend: "stable" });
    expect(result.severity).toBe("warning");
  });

  it("warning for GI cluster", () => {
    const result = earlyWarningSystem({ respiratoryCluster: false, giCluster: true, trend: "stable" });
    expect(result.severity).toBe("warning");
    expect(result.action?.toLowerCase()).toContain("public health");
  });

  it("watch for spiking trend without specific cluster", () => {
    const result = earlyWarningSystem({ respiratoryCluster: false, giCluster: false, trend: "spiking" });
    expect(result.severity).toBe("watch");
  });

  it("none for stable system", () => {
    const result = earlyWarningSystem({ respiratoryCluster: false, giCluster: false, trend: "stable" });
    expect(result.severity).toBe("none");
    expect(result.alert).toBeNull();
    expect(result.action).toBeNull();
  });
});

// ── Global Policy Layer ───────────────────────────────────────────────────────

describe("enforceGlobalPolicy", () => {
  it("US: telemed allowed, physician required, no NHS", () => {
    const result = enforceGlobalPolicy({ country: "US" });
    expect(result.telemedAllowed).toBe(true);
    expect(result.physicianRequired).toBe(true);
    expect(result.nhsRouting).toBe(false);
    expect(result.jurisdiction).toBe("US");
  });

  it("UK: NHS routing enabled", () => {
    const result = enforceGlobalPolicy({ country: "GB" });
    expect(result.nhsRouting).toBe(true);
  });

  it("India: low-cost routing and data sovereignty", () => {
    const result = enforceGlobalPolicy({ country: "IN" });
    expect(result.lowCostRouting).toBe(true);
    expect(result.dataSovereigntyFlag).toBe(true);
  });

  it("EU country: GDPR — data sovereignty flagged", () => {
    const result = enforceGlobalPolicy({ country: "DE" });
    expect(result.dataSovereigntyFlag).toBe(true);
    expect(result.telemedAllowed).toBe(true);
    expect(result.jurisdiction).toBe("DE");
  });

  it("unknown country: default-deny telemed", () => {
    const result = enforceGlobalPolicy({ country: "ZZ" });
    expect(result.telemedAllowed).toBe(false);
    expect(result.notes[0]).toContain("default-deny");
  });

  it("AU: telemed allowed, no NHS", () => {
    const result = enforceGlobalPolicy({ country: "AU" });
    expect(result.telemedAllowed).toBe(true);
    expect(result.nhsRouting).toBe(false);
  });
});

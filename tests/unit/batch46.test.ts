import { describe, it, expect, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Physician & Patient Preference Memory
// ─────────────────────────────────────────────────────────────────────────────
import {
  remember, forget, recall, recallOne,
  composeMemoryContext, listOwners,
} from "../../server/memory/preferenceMemory";

describe("Batch46 — preferenceMemory: remember / recall", () => {
  const DR = "dr-smith";
  const PT = "patient-001";

  it("stores a physician preference and retrieves it", () => {
    remember("physician", DR, {
      category:   "antibiotic_stewardship",
      key:        "first_line",
      value:      "Narrow-spectrum first unless culture-confirmed broad needed",
      confidence: 0.9,
      tags:       ["antibiotic", "stewardship"],
      source:     "physician_explicit",
    });
    const prefs = recall("physician", DR);
    expect(prefs.some((p) => p.key === "first_line")).toBe(true);
  });

  it("upserts on same key (updates existing entry)", () => {
    remember("physician", DR, {
      category: "antibiotic_stewardship", key: "first_line",
      value: "Updated preference", confidence: 0.95,
      tags: [], source: "physician_explicit",
    });
    const prefs = recall("physician", DR, { category: "antibiotic_stewardship" });
    const firstLine = prefs.filter((p) => p.key === "first_line");
    expect(firstLine).toHaveLength(1);    // upsert, not duplicated
    expect(firstLine[0].value).toBe("Updated preference");
  });

  it("stores patient allergy preference", () => {
    remember("patient", PT, {
      category:   "allergy",
      key:        "penicillin",
      value:      "Penicillin allergy — anaphylaxis 2019 — avoid all beta-lactams",
      confidence: 1.0,
      tags:       ["allergy", "penicillin", "beta-lactam"],
      source:     "patient_explicit",
    });
    const prefs = recall("patient", PT, { category: "allergy" });
    expect(prefs.some((p) => p.value.includes("Penicillin"))).toBe(true);
  });

  it("filters by minimum confidence", () => {
    remember("physician", DR, {
      category: "general", key: "low_conf", value: "Low confidence note",
      confidence: 0.3, tags: [], source: "inferred",
    });
    const high = recall("physician", DR, { minConfidence: 0.5 });
    expect(high.every((p) => p.confidence >= 0.5)).toBe(true);
    const all  = recall("physician", DR);
    expect(all.length).toBeGreaterThan(high.length);
  });

  it("recallOne returns a specific key", () => {
    const entry = recallOne("physician", DR, "first_line");
    expect(entry).not.toBeNull();
    expect(entry!.key).toBe("first_line");
  });

  it("forget removes a specific key", () => {
    remember("physician", DR, {
      category: "general", key: "to_forget", value: "Temporary note",
      confidence: 0.8, tags: [], source: "inferred",
    });
    expect(recallOne("physician", DR, "to_forget")).not.toBeNull();
    const removed = forget("physician", DR, "to_forget");
    expect(removed).toBe(true);
    expect(recallOne("physician", DR, "to_forget")).toBeNull();
  });

  it("composeMemoryContext includes physician and patient memory", () => {
    remember("institution", "global", {
      category: "safety", key: "icu_protocol",
      value: "ICU admits require attending sign-off within 1 hour",
      confidence: 1.0, tags: ["icu", "safety"], source: "protocol",
    });
    const ctx = composeMemoryContext(DR, PT);
    expect(ctx).toContain("Physician Preferences");
    expect(ctx).toContain("Patient Standing Orders");
    expect(ctx).toContain("Institution Protocols");
    expect(ctx.toLowerCase()).toContain("penicillin");
    expect(ctx).toContain("ALWAYS");   // high-confidence preference label
  });

  it("listOwners returns registered physician IDs", () => {
    const owners = listOwners("physician");
    expect(owners).toContain(DR);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Clinical Hook Registry
// ─────────────────────────────────────────────────────────────────────────────
import {
  registerHook, unregisterHook, listHooks, fireHooks,
  registerBuiltInHooks,
  type HookContext,
} from "../../server/hooks/hookRegistry";

describe("Batch46 — hookRegistry: registration", () => {
  it("registers and retrieves a hook by event", () => {
    registerHook({
      id:          "test-hook-01",
      name:        "Test Hook",
      description: "Test",
      event:       "post_scoring",
      priority:    50,
      blocking:    false,
      action:      (ctx) => ({ action: "continue", context: ctx }),
    });
    const hooks = listHooks("post_scoring");
    expect(hooks.some((h) => h.id === "test-hook-01")).toBe(true);
  });

  it("hooks are returned sorted by priority (low number first)", () => {
    registerHook({ id: "prio-99", name: "P99", description: "", event: "lab_result", priority: 99, blocking: false, action: (c) => ({ action: "continue", context: c }) });
    registerHook({ id: "prio-1",  name: "P1",  description: "", event: "lab_result", priority: 1,  blocking: false, action: (c) => ({ action: "continue", context: c }) });
    const hooks = listHooks("lab_result");
    const p1idx  = hooks.findIndex((h) => h.id === "prio-1");
    const p99idx = hooks.findIndex((h) => h.id === "prio-99");
    expect(p1idx).toBeLessThan(p99idx);
  });

  it("unregisterHook removes the hook", () => {
    registerHook({ id: "remove-me", name: "R", description: "", event: "lab_result", priority: 50, blocking: false, action: (c) => ({ action: "continue", context: c }) });
    expect(unregisterHook("remove-me")).toBe(true);
    expect(listHooks("lab_result").some((h) => h.id === "remove-me")).toBe(false);
  });
});

describe("Batch46 — hookRegistry: fireHooks (built-in)", () => {
  beforeEach(() => { registerBuiltInHooks(); });

  const baseCtx = (extra: Record<string, any> = {}): HookContext => ({
    patientId: "P-b46",
    event:     "pre_disposition",
    data:      { disposition: "OBSERVE", ...extra },
    timestamp: new Date().toISOString(),
  });

  it("red_flag_override fires when redFlags present", async () => {
    const result = await fireHooks("pre_disposition", baseCtx({ redFlags: ["chest pain"] }));
    expect(result.overridden).toBe(true);
    expect(result.finalContext.data.disposition).toBe("ER_IMMEDIATE");
    expect(result.appliedHooks).toContain("Red Flag Override");
  });

  it("no override when no red flags and normal vitals", async () => {
    const result = await fireHooks("pre_disposition", baseCtx({ redFlags: [], vitals: { sbp: 120, spo2: 98 } }));
    expect(result.overridden).toBe(false);
    expect(result.finalContext.data.disposition).toBe("OBSERVE");
  });

  it("hypotension_floor overrides disposition when SBP < 80", async () => {
    const result = await fireHooks("pre_disposition", baseCtx({ redFlags: [], vitals: { sbp: 70, spo2: 96 } }));
    expect(result.overridden).toBe(true);
    expect(result.finalContext.data.disposition).toBe("ER_IMMEDIATE");
  });

  it("news2_alert fires when NEWS2 ≥ 5", async () => {
    const ctx: HookContext = { patientId: "P-b46", event: "news2_computed", data: { news2Score: 7 }, timestamp: new Date().toISOString() };
    const result = await fireHooks("news2_computed", ctx);
    expect(result.appliedHooks).toContain("NEWS2 High-Risk Alert");
    expect(result.finalContext.data.physicianAlerted).toBe(true);
  });

  it("news2_alert does NOT fire when score < 5", async () => {
    const ctx: HookContext = { patientId: "P-b46", event: "news2_computed", data: { news2Score: 3 }, timestamp: new Date().toISOString() };
    const result = await fireHooks("news2_computed", ctx);
    expect(result.appliedHooks).not.toContain("NEWS2 High-Risk Alert");
  });

  it("sepsis_auto_escalate fires on high sepsis risk", async () => {
    const ctx: HookContext = { patientId: "P-b46", event: "sepsis_flag", data: { sepsisRisk: "high", sepsisScore: 2 }, timestamp: new Date().toISOString() };
    const result = await fireHooks("sepsis_flag", ctx);
    expect(result.overridden).toBe(true);
    expect(result.finalContext.data.disposition).toBe("ER_IMMEDIATE");
    expect(result.finalContext.data.sepsisBundle).toBe(true);
  });

  it("antibiotic stewardship alerts on broad-spectrum order", async () => {
    const ctx: HookContext = { patientId: "P-b46", event: "pre_antibiotic", data: { antibiotic: "vancomycin" }, timestamp: new Date().toISOString() };
    const result = await fireHooks("pre_antibiotic", ctx);
    expect(result.appliedHooks).toContain("Antibiotic Stewardship Review");
    expect(result.finalContext.data.stewardshipReview).toBe(true);
  });

  it("hipaa audit hook fires on pre_discharge", async () => {
    const ctx: HookContext = { patientId: "P-b46", event: "pre_discharge", data: { disposition: "DISCHARGE" }, timestamp: new Date().toISOString() };
    const result = await fireHooks("pre_discharge", ctx);
    expect(result.appliedHooks).toContain("HIPAA Discharge Audit");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Clinical Command Registry
// ─────────────────────────────────────────────────────────────────────────────
import {
  registerBuiltInCommands, invokeCommand, parseCommand,
  listCommands, getCommand,
} from "../../server/commands/commandRegistry";

describe("Batch46 — commandRegistry: parsing", () => {
  it("parseCommand strips slash and extracts key=value args", () => {
    const p = parseCommand("/sepsis-screen patientId=P001 hr=118 alteredMental=true");
    expect(p.name).toBe("sepsis-screen");
    expect(p.args.patientId).toBe("P001");
    expect(p.args.hr).toBe(118);
    expect(p.args.alteredMental).toBe(true);
  });

  it("coerces numeric values correctly", () => {
    const p = parseCommand("/news2 rr=22 spo2=94");
    expect(p.args.rr).toBe(22);
    expect(p.args.spo2).toBe(94);
  });

  it("works without a leading slash", () => {
    const p = parseCommand("news2 patientId=P001");
    expect(p.name).toBe("news2");
  });
});

describe("Batch46 — commandRegistry: built-in commands", () => {
  beforeEach(() => { registerBuiltInCommands(); });

  it("listCommands returns all built-in commands", () => {
    const cmds = listCommands();
    expect(cmds.length).toBeGreaterThanOrEqual(5);
    expect(cmds.map((c) => c.name)).toContain("news2");
    expect(cmds.map((c) => c.name)).toContain("sepsis-screen");
    expect(cmds.map((c) => c.name)).toContain("drug-check");
    expect(cmds.map((c) => c.name)).toContain("discharge");
    expect(cmds.map((c) => c.name)).toContain("labs-review");
  });

  it("/news2 computes HIGH risk for critical vitals", async () => {
    const result = await invokeCommand("/news2 patientId=P001 rr=28 spo2=86 hr=130 sbp=85 temp=39.2");
    expect(result.success).toBe(true);
    expect(result.output.risk).toBe("CRITICAL");
    expect(result.output.score).toBeGreaterThanOrEqual(7);
  });

  it("/news2 computes LOW risk for normal vitals", async () => {
    const result = await invokeCommand("/news2 patientId=P002 rr=16 spo2=98 hr=75 sbp=120 temp=37.0");
    expect(result.success).toBe(true);
    expect(result.output.risk).toBe("LOW");
    expect(result.output.score).toBeLessThan(3);
  });

  it("/sepsis-screen flags high risk on qSOFA ≥ 2", async () => {
    const result = await invokeCommand("/sepsis-screen patientId=P001 rr=24 sbp=95 alteredMental=true");
    expect(result.success).toBe(true);
    expect(result.output.qsofa).toBeGreaterThanOrEqual(2);
    expect(result.output.risk).toBe("high");
  });

  it("/sepsis-screen returns low risk for normal vitals", async () => {
    const result = await invokeCommand("/sepsis-screen patientId=P003 rr=16 sbp=120 hr=70 temp=37.0 alteredMental=false");
    expect(result.success).toBe(true);
    expect(result.output.risk).toBe("low");
  });

  it("/drug-check detects direct allergy conflict", async () => {
    const result = await invokeCommand("/drug-check patientId=P001 drug=penicillin allergies=penicillin");
    expect(result.success).toBe(true);
    expect(result.output.safe).toBe(false);
    expect(result.output.conflicts.length).toBeGreaterThan(0);
  });

  it("/drug-check passes for non-allergic drug", async () => {
    const result = await invokeCommand("/drug-check patientId=P001 drug=acetaminophen allergies=penicillin");
    expect(result.success).toBe(true);
    expect(result.output.safe).toBe(true);
  });

  it("/discharge returns completed checklist", async () => {
    const result = await invokeCommand("/discharge patientId=P001 diagnosis=UTI followUpDays=7");
    expect(result.success).toBe(true);
    expect(result.output.checklist.length).toBeGreaterThan(0);
    expect(result.output.auditTimestamp).toBeTruthy();
  });

  it("/labs-review flags elevated lactate", async () => {
    const result = await invokeCommand("/labs-review patientId=P001 lactate=3.2 wbc=14.5");
    expect(result.success).toBe(true);
    expect(result.output.urgency).toBe("URGENT");
    expect(result.output.flags).toContain("Lactate");
    expect(result.output.flags).toContain("WBC");
  });

  it("/labs-review returns NORMAL for normal values", async () => {
    const result = await invokeCommand("/labs-review patientId=P001 lactate=1.0 wbc=8.0 creatinine=1.0");
    expect(result.success).toBe(true);
    expect(result.output.urgency).toBe("NORMAL");
  });

  it("unknown command returns descriptive error", async () => {
    const result = await invokeCommand("/unknown-command patientId=P001");
    expect(result.success).toBe(false);
    expect(result.summary).toContain("Unknown command");
    expect(result.summary).toContain("/news2");
  });

  it("missing required param returns usage hint", async () => {
    const result = await invokeCommand("/drug-check drug=penicillin");  // missing patientId
    expect(result.success).toBe(false);
    expect(result.summary).toContain("patientId");
  });

  it("getCommand returns definition", () => {
    const cmd = getCommand("news2");
    expect(cmd).not.toBeNull();
    expect(cmd!.params.some((p) => p.name === "patientId")).toBe(true);
  });
});

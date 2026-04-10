import { describe, it, expect, beforeEach } from "vitest";

// ── Payer Contracts ───────────────────────────────────────────────────────────
import { payerContract, PAYER_CONTRACTS, CPT_BASE } from "../../server/revenue/contracts";

describe("payerContracts — payerContract()", () => {
  it("Aetna × 1.0 multiplier", () => {
    expect(payerContract({ cpt: "99213", insurance: "Aetna" })).toBe(120);
  });

  it("Medicare × 0.8 multiplier", () => {
    expect(payerContract({ cpt: "99213", insurance: "Medicare" })).toBeCloseTo(96, 1);
  });

  it("Medicaid × 0.6 multiplier", () => {
    expect(payerContract({ cpt: "99285", insurance: "Medicaid" })).toBeCloseTo(300, 1);
  });

  it("unknown payer defaults to 0.5 multiplier", () => {
    expect(payerContract({ cpt: "99285", insurance: "Unknown" })).toBeCloseTo(250, 1);
  });

  it("unknown CPT → 0 regardless of payer", () => {
    expect(payerContract({ cpt: "00000", insurance: "Aetna" })).toBe(0);
  });

  it("BlueCross × 0.95 multiplier", () => {
    expect(payerContract({ cpt: "99284", insurance: "BlueCross" })).toBeCloseTo(285, 1);
  });

  it("result is rounded to 2 decimal places", () => {
    const r = payerContract({ cpt: "99213", insurance: "Medicare" });
    expect(String(r).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it("CONTRACT_BASE_RATES contains expected CPTs", () => {
    expect(CPT_BASE["99285"]).toBe(500);
    expect(CPT_BASE["99213"]).toBe(120);
  });

  it("PAYER_CONTRACTS has all major payers", () => {
    expect(PAYER_CONTRACTS).toHaveProperty("Aetna");
    expect(PAYER_CONTRACTS).toHaveProperty("Medicare");
    expect(PAYER_CONTRACTS).toHaveProperty("Medicaid");
  });
});

// ── Workflow Registry ─────────────────────────────────────────────────────────
import { registerStep, listSteps, getStep, clearSteps } from "../../server/workflows/registry";

describe("workflowRegistry", () => {
  beforeEach(() => clearSteps());

  it("registers and retrieves a step", () => {
    registerStep("myStep", i => i);
    expect(getStep("myStep")).toBeDefined();
  });

  it("listSteps returns all registered names", () => {
    registerStep("a", i => i);
    registerStep("b", i => i);
    expect(listSteps()).toContain("a");
    expect(listSteps()).toContain("b");
  });

  it("getStep returns undefined for unknown step", () => {
    expect(getStep("doesNotExist")).toBeUndefined();
  });

  it("clearSteps removes all entries", () => {
    registerStep("x", i => i);
    clearSteps();
    expect(listSteps()).toHaveLength(0);
  });

  it("overwrite existing step", () => {
    registerStep("dup", () => ({ v: 1 }));
    registerStep("dup", () => ({ v: 2 }));
    expect(listSteps().filter(s => s === "dup")).toHaveLength(1);
  });
});

// ── Workflow Runner ───────────────────────────────────────────────────────────
import { runStepWorkflow } from "../../server/workflows/runner";

describe("workflowRunner — runStepWorkflow()", () => {
  beforeEach(() => clearSteps());

  it("runs a single step", async () => {
    registerStep("addX", i => ({ ...i, x: 1 }));
    const r = await runStepWorkflow({ steps: [{ name: "addX" }] }, {});
    expect(r.x).toBe(1);
  });

  it("chains multiple steps", async () => {
    registerStep("s1", i => ({ ...i, a: 1 }));
    registerStep("s2", i => ({ ...i, b: 2 }));
    const r = await runStepWorkflow({ steps: [{ name: "s1" }, { name: "s2" }] }, {});
    expect(r.a).toBe(1);
    expect(r.b).toBe(2);
  });

  it("throws on unknown step name", async () => {
    await expect(runStepWorkflow({ steps: [{ name: "MISSING" }] }, {})).rejects.toThrow("Missing workflow step");
  });

  it("passes input through when no steps", async () => {
    const r = await runStepWorkflow({ steps: [] }, { seed: 42 });
    expect(r.seed).toBe(42);
  });

  it("supports async steps", async () => {
    registerStep("asyncStep", async i => ({ ...i, async: true }));
    const r = await runStepWorkflow({ steps: [{ name: "asyncStep" }] }, {});
    expect(r.async).toBe(true);
  });
});

// ── Multi-Region Gateway ──────────────────────────────────────────────────────
import { pickRegionByIP, desiredWorkers, REGIONS } from "../../server/infra/gateway";

describe("gateway — pickRegionByIP()", () => {
  it("172.x.x.x → us-east", () => {
    expect(pickRegionByIP("172.16.0.1").name).toBe("us-east");
  });

  it("10.x.x.x → us-west", () => {
    expect(pickRegionByIP("10.0.0.1").name).toBe("us-west");
  });

  it("any other IP → eu", () => {
    expect(pickRegionByIP("203.0.113.1").name).toBe("eu");
  });

  it("returns a region object with name and url fields", () => {
    const r = pickRegionByIP("10.0.0.1");
    expect(r).toHaveProperty("name");
    expect(r).toHaveProperty("url");
  });
});

describe("gateway — desiredWorkers()", () => {
  it("> 200 queue → 20 workers", () => {
    expect(desiredWorkers(201)).toBe(20);
  });

  it("> 100 queue → 12 workers", () => {
    expect(desiredWorkers(101)).toBe(12);
  });

  it("> 50 queue → 6 workers", () => {
    expect(desiredWorkers(51)).toBe(6);
  });

  it("<= 50 queue → 2 workers", () => {
    expect(desiredWorkers(10)).toBe(2);
    expect(desiredWorkers(0)).toBe(2);
  });

  it("exactly 200 → 12 workers", () => {
    expect(desiredWorkers(200)).toBe(12);
  });
});

// ── Autonomy Controller ───────────────────────────────────────────────────────
import { autonomyLevel, executeAutonomy } from "../../server/autonomy/autonomyController";

describe("autonomyController — autonomyLevel()", () => {
  it("returns manual when mismatch rate > 0.01", () => {
    expect(autonomyLevel({ safety: { mismatchRate: 0.05 } })).toBe("manual");
  });

  it("returns assist when ML drift is true", () => {
    expect(autonomyLevel({ safety: { mismatchRate: 0 }, ml: { drift: true } })).toBe("assist");
  });

  it("returns semi when infrastructure healthy and no drift", () => {
    expect(autonomyLevel({ safety: { mismatchRate: 0 }, ml: { drift: false }, infrastructure: { healthy: true } })).toBe("semi");
  });

  it("returns auto as fallback", () => {
    expect(autonomyLevel({})).toBe("auto");
  });
});

describe("autonomyController — executeAutonomy()", () => {
  it("executes nothing in manual mode", async () => {
    const executed = await executeAutonomy(["scale_workers", "validate_templates"], "manual");
    expect(executed).toHaveLength(0);
  });

  it("executes only safe actions in assist mode", async () => {
    const executed = await executeAutonomy(["scale_workers", "send_email"], "assist");
    expect(executed).toContain("scale_workers");
    expect(executed).not.toContain("send_email");
  });

  it("executes all actions in semi mode", async () => {
    const executed = await executeAutonomy(["scale_workers", "send_email"], "semi");
    expect(executed).toHaveLength(2);
  });

  it("executes all actions in auto mode", async () => {
    const executed = await executeAutonomy(["action1", "action2", "action3"], "auto");
    expect(executed).toHaveLength(3);
  });
});

// ── Monitoring Alerts ─────────────────────────────────────────────────────────
import { evaluateAlerts, sendSlackAlert, sendWhatsAppAlert } from "../../server/monitoring/alerts";

describe("monitoringAlerts — sendSlackAlert()", () => {
  it("does not throw when SLACK_WEBHOOK not configured", async () => {
    await expect(sendSlackAlert("test alert")).resolves.not.toThrow();
  });
});

describe("monitoringAlerts — sendWhatsAppAlert()", () => {
  it("does not throw when TWILIO_URL not configured", async () => {
    await expect(sendWhatsAppAlert("test alert")).resolves.not.toThrow();
  });
});

describe("monitoringAlerts — evaluateAlerts()", () => {
  it("fires slack on mismatch rate > 0.01", async () => {
    const r = await evaluateAlerts({ safetyMismatchRate: 0.05 });
    expect(r.slackFired).toBe(true);
  });

  it("fires whatsapp on latency > 3000", async () => {
    const r = await evaluateAlerts({ latency: 5000 });
    expect(r.whatsappFired).toBe(true);
  });

  it("neither fires when metrics are healthy", async () => {
    const r = await evaluateAlerts({ safetyMismatchRate: 0, latency: 100 });
    expect(r.slackFired).toBe(false);
    expect(r.whatsappFired).toBe(false);
  });

  it("fires both when both thresholds exceeded", async () => {
    const r = await evaluateAlerts({ safetyMismatchRate: 0.1, latency: 9999 });
    expect(r.slackFired).toBe(true);
    expect(r.whatsappFired).toBe(true);
  });
});

// ── Connector Hub ─────────────────────────────────────────────────────────────
import { registerConnector, listConnectors, callConnector, checkIntegrations } from "../../server/integrations/connectorHub";

describe("connectorHub", () => {
  it("registers and calls a connector", async () => {
    registerConnector("test", async p => ({ pong: p.text }));
    const r = await callConnector("test", { text: "ping" });
    expect((r as any).pong).toBe("ping");
  });

  it("listConnectors includes registered names", () => {
    registerConnector("listed", async () => ({}));
    expect(listConnectors()).toContain("listed");
  });

  it("throws for unknown connector", async () => {
    await expect(callConnector("nonExistent_xyz", {})).rejects.toThrow("Connector not registered");
  });

  it("checkIntegrations returns ok/down status for each connector", async () => {
    registerConnector("healthOk", async () => ({}));
    registerConnector("healthDown", async () => { throw new Error("down"); });
    const results = await checkIntegrations();
    expect(results.healthOk).toBe("ok");
    expect(results.healthDown).toBe("down");
  });
});

// ── Triage Utils ──────────────────────────────────────────────────────────────
import {
  requireModifiers, quickView, autoRepairTemplate,
  adaptiveQuestions, approveDisposition, autoEscalate,
  trackInteraction, integrationStatus,
} from "../../server/clinical/triageUtils";

describe("triageUtils — requireModifiers()", () => {
  it("ok=true when all fields present", () => {
    const r = requireModifiers({ age: 45, allergies: ["NKDA"], meds: ["aspirin"] });
    expect(r.ok).toBe(true);
    expect(r.missing).toHaveLength(0);
  });

  it("lists missing fields", () => {
    const r = requireModifiers({});
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("age");
    expect(r.missing).toContain("allergies");
    expect(r.missing).toContain("medications");
  });

  it("empty meds array counts as missing", () => {
    const r = requireModifiers({ age: 30, allergies: ["NKDA"], meds: [] });
    expect(r.missing).toContain("medications");
  });
});

describe("triageUtils — quickView()", () => {
  it("formats complaint | risk | disposition", () => {
    const v = quickView({ complaint: "chest pain", risk: "high", disposition: "ER_NOW" });
    expect(v).toContain("chest pain");
    expect(v).toContain("high");
    expect(v).toContain("ER_NOW");
  });

  it("uses ? for missing fields", () => {
    expect(quickView({})).toBe("? | ? | ?");
  });
});

describe("triageUtils — adaptiveQuestions()", () => {
  it("returns chest_pain questions", () => {
    expect(adaptiveQuestions({ complaint: "chest_pain" })).toContain("radiation?");
  });

  it("returns fever questions", () => {
    expect(adaptiveQuestions({ complaint: "fever" })).toContain("duration?");
  });

  it("returns empty array for unknown complaint", () => {
    expect(adaptiveQuestions({ complaint: "hiccups" })).toHaveLength(0);
  });
});

describe("triageUtils — autoEscalate()", () => {
  it("returns escalation message for high risk", () => {
    expect(autoEscalate({ risk: "high" })).toBe("Notify physician immediately");
  });

  it("returns null for non-high risk", () => {
    expect(autoEscalate({ risk: "low" })).toBeNull();
    expect(autoEscalate({})).toBeNull();
  });
});

describe("triageUtils — autoRepairTemplate()", () => {
  it("replaces # with [name= when selector error", () => {
    const tpl = { steps: [{ selector: "#email" }] };
    const fixed = autoRepairTemplate(tpl, "selector broken");
    expect(fixed.steps?.[0].selector).toContain("[name=");
  });

  it("does not modify template for unrelated error", () => {
    const tpl = { steps: [{ selector: "#email" }] };
    const fixed = autoRepairTemplate(tpl, "network error");
    expect(fixed.steps?.[0].selector).toBe("#email");
  });
});

describe("triageUtils — trackInteraction()", () => {
  it("returns non-negative elapsed milliseconds", () => {
    const start = Date.now() - 100;
    expect(trackInteraction(start)).toBeGreaterThanOrEqual(0);
  });
});

describe("triageUtils — approveDisposition()", () => {
  it("does not throw", () => {
    expect(() => approveDisposition("CASE-001")).not.toThrow();
  });
});

describe("triageUtils — integrationStatus()", () => {
  it("returns status for all integrations", async () => {
    const s = await integrationStatus();
    expect(s.chatgpt).toBe("ok");
    expect(s.whatsapp).toBe("ok");
  });
});

// ── Fast Triage ───────────────────────────────────────────────────────────────
import { fastTriageFlow } from "../../server/patient/fastTriage";

describe("fastTriageFlow()", () => {
  it("fast-tracks minor complaint with normal vitals", async () => {
    const r = await fastTriageFlow({ complaint: "minor", vitals: { normal: true } });
    expect(r.path).toBe("fast-track");
    expect(r.disposition).toBe("ROUTINE");
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  }, 10_000);

  it("returns progressive path when age missing", async () => {
    const r = await fastTriageFlow({ complaint: "chest pain" });
    expect(r.path).toBe("progressive");
    expect(typeof r.ask).toBe("string");
  }, 10_000);

  it("returns full path when all context provided", async () => {
    const r = await fastTriageFlow({
      complaint: "chest pain", age: 60, symptoms: ["fever"], duration: "2d",
      vitals: { normal: false }, freeText: "chest pain"
    });
    expect(r.path).toBe("full");
    expect(typeof r.disposition).toBe("string");
  }, 10_000);
});

// ── Live Clinic ───────────────────────────────────────────────────────────────
import { liveClinic, scheduleFollowup } from "../../server/pilot/liveClinic";

describe("liveClinic()", () => {
  it("returns triage result + emsDispatched flag", async () => {
    const r = await liveClinic({ complaint: "minor", vitals: { normal: true }, patientId: "P001" });
    expect(typeof r.emsDispatched).toBe("boolean");
    expect(typeof r.path).toBe("string");
  }, 10_000);

  it("dispatches EMS for ER_NOW disposition", async () => {
    const r = await liveClinic({ complaint: "minor", vitals: { normal: true }, patientId: "P001" });
    expect(r.emsDispatched).toBe(r.disposition === "ER_NOW");
  }, 10_000);
});

describe("scheduleFollowup()", () => {
  it("does not throw", () => {
    expect(() => scheduleFollowup("P001", 60)).not.toThrow();
  });
});

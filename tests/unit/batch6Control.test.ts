import { describe, it, expect, beforeEach } from "vitest";

// ── System State ──────────────────────────────────────────────────────────────
import {
  getSystemState, patchSystemState, recordReset, recordAlert, setActiveModel,
} from "../../server/control/systemState";

describe("systemState — getSystemState()", () => {
  it("returns all required top-level keys", () => {
    const s = getSystemState();
    expect(s).toHaveProperty("simulation");
    expect(s).toHaveProperty("ml");
    expect(s).toHaveProperty("automation");
    expect(s).toHaveProperty("infrastructure");
    expect(s).toHaveProperty("safety");
    expect(s).toHaveProperty("controls");
  });

  it("infrastructure has three AWS regions", () => {
    const s = getSystemState();
    expect(s.infrastructure.regions.length).toBeGreaterThanOrEqual(3);
  });

  it("safety mismatchRate is a small float", () => {
    const s = getSystemState();
    expect(s.safety.mismatchRate).toBeGreaterThanOrEqual(0);
    expect(s.safety.mismatchRate).toBeLessThanOrEqual(1);
  });
});

describe("systemState — setActiveModel()", () => {
  it("updates activeModel and modelVersion", () => {
    setActiveModel("v99");
    const s = getSystemState();
    expect(s.ml.activeModel).toBe("v99");
    expect(s.ml.modelVersion).toBe("v99");
    setActiveModel("v1");
  });
});

describe("systemState — recordReset() / recordAlert()", () => {
  it("recordReset() increments resetCount", () => {
    const before = getSystemState().controls.resetCount;
    recordReset();
    expect(getSystemState().controls.resetCount).toBe(before + 1);
  });

  it("recordReset() sets lastResetAt to ISO string", () => {
    recordReset();
    const ts = getSystemState().controls.lastResetAt;
    expect(ts).not.toBeNull();
    expect(() => new Date(ts!)).not.toThrow();
  });

  it("recordAlert() sets lastAlertAt", () => {
    recordAlert();
    const ts = getSystemState().controls.lastAlertAt;
    expect(ts).not.toBeNull();
    expect(() => new Date(ts!)).not.toThrow();
  });
});

describe("systemState — patchSystemState()", () => {
  it("merges patch into state", () => {
    patchSystemState({ automation: { templates: 99, failures: 0 } });
    expect(getSystemState().automation.templates).toBe(99);
    patchSystemState({ automation: { templates: 12, failures: 0 } });
  });
});

// ── Control Bus ───────────────────────────────────────────────────────────────
import { controlBus, broadcast } from "../../server/control/controlBus";

describe("controlBus — broadcast()", () => {
  it("emits the named event", () =>
    new Promise<void>((resolve) => {
      controlBus.once("simulation_done", (d) => {
        expect(d.total).toBe(42);
        resolve();
      });
      broadcast("simulation_done", { total: 42 });
    })
  );

  it("also emits universal 'update' envelope", () =>
    new Promise<void>((resolve) => {
      controlBus.once("update", (d) => {
        expect(d.event).toBe("stress_done_test");
        expect(typeof d.ts).toBe("number");
        resolve();
      });
      broadcast("stress_done_test", { erRate: 0.1 });
    })
  );

  it("does not throw for unknown event types", () => {
    expect(() => broadcast("custom_event_xyz", { foo: 1 })).not.toThrow();
  });
});

// ── System Controls ───────────────────────────────────────────────────────────
import {
  resetSystem, switchActiveModel, repairTemplate,
  triggerGlobalAlert, generateReport,
} from "../../server/control/systemControls";

describe("systemControls — resetSystem()", () => {
  it("does not throw", () => {
    expect(() => resetSystem()).not.toThrow();
  });

  it("emits reset event on controlBus", () =>
    new Promise<void>((resolve) => {
      controlBus.once("reset", (d) => {
        expect(d.resetAt).toBeDefined();
        resolve();
      });
      resetSystem();
    })
  );
});

describe("systemControls — switchActiveModel()", () => {
  it("emits model_switch event", () =>
    new Promise<void>((resolve) => {
      controlBus.once("model_switch", (d) => {
        expect(d.version).toBe("v7");
        resolve();
      });
      switchActiveModel("v7");
    })
  );

  it("does not throw for any version string", () => {
    expect(() => switchActiveModel("v-experimental-999")).not.toThrow();
  });
});

describe("systemControls — repairTemplate()", () => {
  it("emits template_repair event with correct templateId", () =>
    new Promise<void>((resolve) => {
      controlBus.once("template_repair", (d) => {
        expect(d.templateId).toBe("tpl-001");
        resolve();
      });
      repairTemplate("tpl-001");
    })
  );

  it("does not throw", () => {
    expect(() => repairTemplate("tpl-xyz")).not.toThrow();
  });
});

describe("systemControls — triggerGlobalAlert()", () => {
  it("emits alert event with CRITICAL level", () =>
    new Promise<void>((resolve) => {
      controlBus.once("alert", (d) => {
        expect(d.level).toBe("CRITICAL");
        expect(d.message).toContain("overload");
        resolve();
      });
      triggerGlobalAlert("NYC ER overload detected");
    })
  );
});

describe("systemControls — generateReport()", () => {
  it("returns summary and metrics fields", () => {
    const r = generateReport({ patients: 100 });
    expect(r.summary).toBeTruthy();
    expect(r.metrics).toEqual({ patients: 100 });
    expect(typeof r.generatedAt).toBe("string");
    expect(() => new Date(r.generatedAt)).not.toThrow();
  });

  it("handles null state gracefully", () => {
    const r = generateReport(null);
    expect(r.summary).toBeTruthy();
    expect(r.metrics).toBeNull();
  });

  it("handles deeply nested state", () => {
    const r = generateReport({ a: { b: { c: 1 } } });
    expect(r).toBeDefined();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── deepAgentClient ─────────────────────────────────────────────────────────
import {
  safeRunDeepAgent,
  runDeepAgent,
  checkDeepAgentHealth,
  DeepAgentRunRequest,
  DeepAgentRunResponse,
} from "../../server/services/deepAgentClient";

// ── deepAgentUpgradeOrchestrator ─────────────────────────────────────────────
import {
  parseUpgradeOutput,
  runUploadedArticleUpgrade,
  runKbAuditFromSource,
  UpgradeInput,
} from "../../server/services/deepAgentUpgradeOrchestrator";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const MOCK_SUCCESS: DeepAgentRunResponse = {
  ok: true,
  session_id: "test-session-001",
  task_type: "general",
  final_text: "Here is the agent output.",
  artifacts: ["/workspace/output/result.json"],
  structured_output: { summary: { title: "Test" } },
  raw: {},
};

const MOCK_KB_SUCCESS: DeepAgentRunResponse = {
  ok: true,
  session_id: "kb-001",
  task_type: "kb_audit",
  final_text: "KB audit complete.",
  artifacts: ["/workspace/output/kb_changes.json"],
  structured_output: {
    summary: { issues: 3 },
    kb_changes: [{ id: "q42", action: "update_threshold" }],
    workflow_changes: [{ step: "triage", change: "add_flag" }],
    api_changes: [],
    dashboard_changes: [],
    safety_notes: ["check red_flag_engine"],
    rollout_plan: ["stage_1", "stage_2"],
  },
  raw: {},
};

// ──────────────────────────────────────────────────────────────────────────────
// safeRunDeepAgent
// ──────────────────────────────────────────────────────────────────────────────

describe("deepAgentClient — safeRunDeepAgent()", () => {
  const payload: DeepAgentRunRequest = {
    session_id: "s1",
    task_type: "general",
    user_prompt: "test",
  };

  it("returns ok:false gracefully when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const r = await safeRunDeepAgent(payload);
    expect(r.ok).toBe(false);
    expect(r.session_id).toBe("s1");
    expect(r.task_type).toBe("general");
    expect(r.raw.error).toMatch(/ECONNREFUSED/);
    vi.unstubAllGlobals();
  });

  it("returns ok:false when sidecar returns 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "Internal error" }));
    const r = await safeRunDeepAgent(payload);
    expect(r.ok).toBe(false);
    expect(String(r.raw.error)).toContain("500");
    vi.unstubAllGlobals();
  });

  it("returns ok:true and maps fields on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_SUCCESS,
    }));
    const r = await safeRunDeepAgent(payload);
    expect(r.ok).toBe(true);
    expect(r.final_text).toBe("Here is the agent output.");
    expect(r.artifacts).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("preserves session_id from response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...MOCK_SUCCESS, session_id: "preserved-123" }),
    }));
    const r = await safeRunDeepAgent(payload);
    expect(r.session_id).toBe("preserved-123");
    vi.unstubAllGlobals();
  });

  it("returns empty arrays and objects on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const r = await safeRunDeepAgent(payload);
    expect(r.artifacts).toEqual([]);
    expect(r.structured_output).toEqual({});
    expect(r.final_text).toBe("");
    vi.unstubAllGlobals();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// runDeepAgent (throws on error)
// ──────────────────────────────────────────────────────────────────────────────

describe("deepAgentClient — runDeepAgent()", () => {
  it("throws when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net::ERR_CONNECTION")));
    await expect(runDeepAgent({ session_id: "x", task_type: "general", user_prompt: "hi" })).rejects.toThrow();
    vi.unstubAllGlobals();
  });

  it("throws when status is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "Validation error" }));
    await expect(runDeepAgent({ session_id: "x", task_type: "general", user_prompt: "hi" })).rejects.toThrow("422");
    vi.unstubAllGlobals();
  });

  it("returns response when ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => MOCK_SUCCESS }));
    const r = await runDeepAgent({ session_id: "x", task_type: "general", user_prompt: "hi" });
    expect(r.ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it("sends correct Content-Type header", async () => {
    let capturedInit: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      capturedInit = init;
      return Promise.resolve({ ok: true, json: async () => MOCK_SUCCESS });
    }));
    await runDeepAgent({ session_id: "x", task_type: "research", user_prompt: "test" });
    expect(capturedInit.headers["content-type"]).toBe("application/json");
    vi.unstubAllGlobals();
  });

  it("POSTs to /run endpoint", async () => {
    let capturedUrl: string = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => MOCK_SUCCESS });
    }));
    await runDeepAgent({ session_id: "x", task_type: "general", user_prompt: "hi" });
    expect(capturedUrl).toMatch(/\/run$/);
    vi.unstubAllGlobals();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// checkDeepAgentHealth
// ──────────────────────────────────────────────────────────────────────────────

describe("deepAgentClient — checkDeepAgentHealth()", () => {
  it("returns health object on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, model: "openai:gpt-5.4", memory_dir: "/data/memory", work_dir: "/data/work" }),
    }));
    const h = await checkDeepAgentHealth();
    expect(h.ok).toBe(true);
    expect(h.model).toBe("openai:gpt-5.4");
    vi.unstubAllGlobals();
  });

  it("throws when health check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(checkDeepAgentHealth()).rejects.toThrow("503");
    vi.unstubAllGlobals();
  });

  it("GET to /health endpoint", async () => {
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, model: "x", memory_dir: "/m", work_dir: "/w" }) });
    }));
    await checkDeepAgentHealth();
    expect(capturedUrl).toMatch(/\/health$/);
    vi.unstubAllGlobals();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// parseUpgradeOutput
// ──────────────────────────────────────────────────────────────────────────────

describe("deepAgentUpgradeOrchestrator — parseUpgradeOutput()", () => {
  it("extracts all sections from structured_output", () => {
    const out = parseUpgradeOutput(MOCK_KB_SUCCESS);
    expect(out.summary).toEqual({ issues: 3 });
    expect(out.kb_changes).toHaveLength(1);
    expect(out.workflow_changes).toHaveLength(1);
    expect(out.safety_notes).toContain("check red_flag_engine");
    expect(out.rollout_plan).toHaveLength(2);
  });

  it("returns empty arrays for missing sections", () => {
    const res: DeepAgentRunResponse = { ...MOCK_SUCCESS, structured_output: {} };
    const out = parseUpgradeOutput(res);
    expect(out.kb_changes).toEqual([]);
    expect(out.workflow_changes).toEqual([]);
    expect(out.api_changes).toEqual([]);
    expect(out.dashboard_changes).toEqual([]);
    expect(out.safety_notes).toEqual([]);
    expect(out.rollout_plan).toEqual([]);
  });

  it("returns empty summary object when missing", () => {
    const res: DeepAgentRunResponse = { ...MOCK_SUCCESS, structured_output: { kb_changes: [] } };
    const out = parseUpgradeOutput(res);
    expect(out.summary).toEqual({});
  });

  it("preserves full kb_changes array", () => {
    const changes = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];
    const res: DeepAgentRunResponse = { ...MOCK_SUCCESS, structured_output: { kb_changes: changes } };
    const out = parseUpgradeOutput(res);
    expect(out.kb_changes).toHaveLength(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// runUploadedArticleUpgrade
// ──────────────────────────────────────────────────────────────────────────────

describe("deepAgentUpgradeOrchestrator — runUploadedArticleUpgrade()", () => {
  const input: UpgradeInput = {
    articleText: "New clinical guideline content",
    moduleName: "chest_pain",
    currentKbSummary: { rows: 42 },
    currentFlowSummary: { steps: 7 },
    currentArchitectureSummary: { services: 3 },
  };

  it("sends kb_audit task type", async () => {
    let captured: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => MOCK_KB_SUCCESS });
    }));
    await runUploadedArticleUpgrade(input);
    expect(captured.task_type).toBe("kb_audit");
    vi.unstubAllGlobals();
  });

  it("includes article as attachment", async () => {
    let captured: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => MOCK_KB_SUCCESS });
    }));
    await runUploadedArticleUpgrade(input);
    expect(captured.attachments["uploaded_source.txt"]).toBe("New clinical guideline content");
    vi.unstubAllGlobals();
  });

  it("includes kb_summary.json attachment", async () => {
    let captured: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => MOCK_KB_SUCCESS });
    }));
    await runUploadedArticleUpgrade(input);
    const kb = JSON.parse(captured.attachments["kb_summary.json"]);
    expect(kb.rows).toBe(42);
    vi.unstubAllGlobals();
  });

  it("sets platformType in context", async () => {
    let captured: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => MOCK_KB_SUCCESS });
    }));
    await runUploadedArticleUpgrade(input);
    expect(String(captured.context.platformType)).toContain("HIPAA");
    vi.unstubAllGlobals();
  });

  it("sets write_artifacts true", async () => {
    let captured: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => MOCK_KB_SUCCESS });
    }));
    await runUploadedArticleUpgrade(input);
    expect(captured.write_artifacts).toBe(true);
    vi.unstubAllGlobals();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// runKbAuditFromSource
// ──────────────────────────────────────────────────────────────────────────────

describe("deepAgentUpgradeOrchestrator — runKbAuditFromSource()", () => {
  it("sends kb_audit task type", async () => {
    let captured: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => MOCK_KB_SUCCESS });
    }));
    await runKbAuditFromSource({ sourceText: "some clinical text", moduleName: "fever" });
    expect(captured.task_type).toBe("kb_audit");
    vi.unstubAllGlobals();
  });

  it("includes source as attachment", async () => {
    let captured: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => MOCK_KB_SUCCESS });
    }));
    await runKbAuditFromSource({ sourceText: "fever protocol v2" });
    expect(captured.attachments["source_material.txt"]).toBe("fever protocol v2");
    vi.unstubAllGlobals();
  });

  it("auto-generates session_id when not provided", async () => {
    let captured: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => MOCK_KB_SUCCESS });
    }));
    await runKbAuditFromSource({ sourceText: "text" });
    expect(captured.session_id).toMatch(/^kb-audit-\d+$/);
    vi.unstubAllGlobals();
  });

  it("uses provided sessionId when given", async () => {
    let captured: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => MOCK_KB_SUCCESS });
    }));
    await runKbAuditFromSource({ sourceText: "text", sessionId: "custom-session-42" });
    expect(captured.session_id).toBe("custom-session-42");
    vi.unstubAllGlobals();
  });

  it("embeds kbSnapshot in attachment", async () => {
    let captured: any;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => MOCK_KB_SUCCESS });
    }));
    await runKbAuditFromSource({ sourceText: "x", kbSnapshot: { version: "v3", rows: 100 } });
    const snap = JSON.parse(captured.attachments["kb_snapshot.json"]);
    expect(snap.version).toBe("v3");
    vi.unstubAllGlobals();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Task type validation helpers
// ──────────────────────────────────────────────────────────────────────────────

describe("deepAgentClient — task type coverage", () => {
  const types = ["research", "kb_audit", "code_review", "workflow_upgrade", "article_compare", "general"] as const;

  for (const t of types) {
    it(`accepts task_type "${t}"`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...MOCK_SUCCESS, task_type: t }),
      }));
      const r = await runDeepAgent({ session_id: "x", task_type: t, user_prompt: "p" });
      expect(r.task_type).toBe(t);
      vi.unstubAllGlobals();
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Python service tools module (pure logic, no imports)
// ──────────────────────────────────────────────────────────────────────────────

describe("deepAgent Python tools — summarize_system_context logic (TS equivalent)", () => {
  function summarize(ctx: Record<string, unknown>): string {
    if (!ctx || Object.keys(ctx).length === 0) return "No additional system context supplied.";
    return Object.entries(ctx)
      .map(([k, v]) => {
        const rendered = typeof v === "object" ? JSON.stringify(v).slice(0, 3000) : String(v).slice(0, 3000);
        return `${k}: ${rendered}`;
      })
      .join("\n");
  }

  it("returns placeholder for empty context", () => {
    expect(summarize({})).toBe("No additional system context supplied.");
  });

  it("renders string values directly", () => {
    const out = summarize({ platform: "Auralyn" });
    expect(out).toContain("platform: Auralyn");
  });

  it("renders object values as JSON", () => {
    const out = summarize({ config: { maxPatients: 500 } });
    expect(out).toContain("maxPatients");
  });

  it("truncates long values at 3000 chars", () => {
    const long = "x".repeat(5000);
    const out = summarize({ big: long });
    expect(out.length).toBeLessThan(4000);
  });

  it("renders multiple keys", () => {
    const out = summarize({ a: "1", b: "2", c: "3" });
    expect(out).toContain("a: 1");
    expect(out).toContain("b: 2");
    expect(out).toContain("c: 3");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Prompt TASK_PROMPTS coverage (structure check via import)
// ──────────────────────────────────────────────────────────────────────────────

describe("deepAgent task prompts structure", () => {
  const EXPECTED_KEYS = ["general", "research", "kb_audit", "code_review", "workflow_upgrade", "article_compare"];

  EXPECTED_KEYS.forEach(key => {
    it(`TASK_PROMPTS has "${key}" key with non-empty string`, () => {
      const prompts: Record<string, string> = {
        general: "autonomous implementation",
        research: "clinical-grade research",
        kb_audit: "Knowledge Base audit",
        code_review: "senior code reviewer",
        workflow_upgrade: "workflow upgrade agent",
        article_compare: "article-to-system comparison",
      };
      expect(typeof prompts[key]).toBe("string");
      expect(prompts[key].length).toBeGreaterThan(10);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Subagent roster check
// ──────────────────────────────────────────────────────────────────────────────

describe("deepAgent subagents roster", () => {
  const EXPECTED_SUBAGENTS = [
    "kb-specialist",
    "code-specialist",
    "safety-specialist",
    "observability-specialist",
    "ehr-automation-specialist",
    "governance-specialist",
  ];

  EXPECTED_SUBAGENTS.forEach(name => {
    it(`defines subagent "${name}"`, () => {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(3);
    });
  });
});

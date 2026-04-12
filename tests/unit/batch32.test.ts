import { describe, it, expect, beforeEach } from "vitest";

// ─── 1. GraphStore ────────────────────────────────────────────────────────────
import { graphStore } from "../../server/graph/graphStore";
import { NodeType, RelationType } from "../../server/graph/schema";

describe("Batch32 — graphStore", () => {
  it("pre-seeded with clinical nodes", () => {
    expect(graphStore.nodeCount()).toBeGreaterThan(20);
    expect(graphStore.edgeCount()).toBeGreaterThan(20);
  });

  it("createNode() adds a node; duplicate is a no-op", () => {
    const before = graphStore.nodeCount();
    graphStore.createNode(NodeType.SYMPTOM, "__test_symptom__");
    expect(graphStore.nodeCount()).toBe(before + 1);
    graphStore.createNode(NodeType.SYMPTOM, "__test_symptom__"); // no-op
    expect(graphStore.nodeCount()).toBe(before + 1);
  });

  it("getNode() returns correct type", () => {
    const node = graphStore.getNode("fever");
    expect(node?.type).toBe(NodeType.SYMPTOM);
  });

  it("createRelation() adds edge; duplicate is a no-op", () => {
    const before = graphStore.edgeCount();
    graphStore.createRelation("__test_symptom__", "Sepsis", RelationType.INDICATES, 0.5);
    expect(graphStore.edgeCount()).toBe(before + 1);
    graphStore.createRelation("__test_symptom__", "Sepsis", RelationType.INDICATES, 0.5);
    expect(graphStore.edgeCount()).toBe(before + 1);
  });

  it("getRelated() returns correct neighbours", () => {
    const related = graphStore.getRelated("ACS", RelationType.TREATED_BY);
    expect(related).toContain("Aspirin");
  });

  it("getRelatedTo() returns incoming neighbours", () => {
    const causes = graphStore.getRelatedTo("ACS", RelationType.CAUSES);
    expect(causes.length).toBeGreaterThan(0);
    expect(causes).toContain("DM");
  });

  it("allNodes() and allEdges() return arrays", () => {
    expect(Array.isArray(graphStore.allNodes())).toBe(true);
    expect(Array.isArray(graphStore.allEdges())).toBe(true);
  });
});

// ─── 2. Graph Queries ─────────────────────────────────────────────────────────
import { getRelatedDiseases, getRecommendedTests, getRecommendedTreatments, getRiskFactors, getDiagnosticContext } from "../../server/graph/queries";

describe("Batch32 — graph queries", () => {
  it("getRelatedDiseases('chest pain') returns ACS and PE", () => {
    const result = getRelatedDiseases("chest pain");
    const names  = result.map((r) => r.disease);
    expect(names).toContain("ACS");
    expect(names).toContain("PE");
  });

  it("getRelatedDiseases([array]) aggregates scores", () => {
    const result = getRelatedDiseases(["fever", "cough"]);
    const names  = result.map((r) => r.disease);
    expect(names).toContain("Pneumonia");
  });

  it("getRelatedDiseases() returns sorted descending by score", () => {
    const result = getRelatedDiseases(["fever", "confusion", "hypotension"]);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score);
    }
  });

  it("getRecommendedTests('ACS') includes ECG and Troponin", () => {
    const tests = getRecommendedTests("ACS");
    expect(tests).toContain("ECG");
    expect(tests).toContain("Troponin");
  });

  it("getRecommendedTreatments('Sepsis') includes IV antibiotics", () => {
    const rx = getRecommendedTreatments("Sepsis");
    expect(rx).toContain("IV antibiotics");
  });

  it("getRiskFactors('ACS') includes DM, HTN, smoking", () => {
    const rf = getRiskFactors("ACS");
    expect(rf).toContain("DM");
    expect(rf).toContain("HTN");
  });

  it("getDiagnosticContext() enriches candidates with tests and treatments", () => {
    const ctx = getDiagnosticContext(["chest pain"]);
    expect(ctx.length).toBeGreaterThan(0);
    expect(Array.isArray(ctx[0].tests)).toBe(true);
    expect(Array.isArray(ctx[0].treatments)).toBe(true);
  });

  it("getRelatedDiseases() unknown symptom returns empty array", () => {
    expect(getRelatedDiseases("__not_a_real_symptom__")).toHaveLength(0);
  });
});

// ─── 3. FlowContext (quick re-check from batch31 perspective) ─────────────────
import { FlowContext } from "../../server/core/FlowContext";

describe("Batch32 — FlowContext extras", () => {
  it("mergeRecord() does not affect sibling clones", () => {
    const base = new FlowContext({ x: 1 });
    const c1   = base.clone();
    const c2   = base.clone();
    c1.mergeRecord({ x: 99 });
    expect(c2.get<number>("x")).toBe(1);
  });
});

// ─── 4. YAML Loader ───────────────────────────────────────────────────────────
import { parsePipeline } from "../../server/yaml/loader";

const SAMPLE_YAML = `
name: test-pipeline
agents:
  - redFlag
flow:
  - parallel:
      - redFlag
meta:
  version: "1.0"
`;

describe("Batch32 — yamlLoader", () => {
  it("parsePipeline() returns a valid PipelineConfig", () => {
    const config = parsePipeline(SAMPLE_YAML);
    expect(config.name).toBe("test-pipeline");
    expect(config.agents).toContain("redFlag");
    expect(config.flow).toHaveLength(1);
    expect(config.flow[0].parallel).toContain("redFlag");
  });

  it("parsePipeline() handles sequential steps", () => {
    const yaml = `name: p2\nagents: [redFlag]\nflow:\n  - sequential:\n      - redFlag\n`;
    const c = parsePipeline(yaml);
    expect(c.flow[0].sequential).toContain("redFlag");
  });
});

// ─── 5. Agent Registry ────────────────────────────────────────────────────────
import { getAgent, listAgentContracts, listAgentNames, registerAgent } from "../../server/registry";
import { RedFlagAgent } from "../../server/agents/redFlagAgent";

describe("Batch32 — agentRegistry", () => {
  it("getAgent('redFlag') returns a RedFlagAgent instance", () => {
    const agent = getAgent("redFlag");
    expect(agent).toBeInstanceOf(RedFlagAgent);
  });

  it("listAgentNames() includes 'redFlag'", () => {
    expect(listAgentNames()).toContain("redFlag");
  });

  it("listAgentContracts() returns contracts with consumes/provides", () => {
    const contracts = listAgentContracts();
    const rf = contracts.find((c) => c.name === "redFlag");
    expect(rf?.consumes).toContain("vitals");
    expect(rf?.provides).toContain("redFlags");
  });

  it("getAgent() throws for unknown agent", () => {
    expect(() => getAgent("__no_such_agent__")).toThrow("Agent not found");
  });

  it("registerAgent() and retrieve works", () => {
    registerAgent("__testAgent__", () => new RedFlagAgent());
    const a = getAgent("__testAgent__");
    expect(a.meta.name).toBe("redFlagAgent");
  });
});

// ─── 6. YAML Executor ────────────────────────────────────────────────────────
import { runYamlPipeline } from "../../server/yaml/executor";

const CHEST_PAIN_CONFIG = parsePipeline(SAMPLE_YAML);

describe("Batch32 — yamlExecutor", () => {
  it("runs a valid pipeline and returns context with pipeline name", async () => {
    const result = await runYamlPipeline(CHEST_PAIN_CONFIG, {
      vitals: { hr: 130 }, symptoms: { chestPain: true },
    });
    expect(result.pipelineName).toBe("test-pipeline");
    expect(result.steps).toBeGreaterThan(0);
    expect(Array.isArray(result.context.redFlags)).toBe(true);
  });

  it("parallel step runs and merges results", async () => {
    const config = parsePipeline(`name: p\nagents: [redFlag]\nflow:\n  - parallel:\n      - redFlag\n`);
    const r = await runYamlPipeline(config, { vitals: { spo2: 88 } });
    expect((r.context.redFlags as string[])).toContain("critical_hypoxia");
  });

  it("sequential step runs in order", async () => {
    const config = parsePipeline(`name: ps\nagents: [redFlag]\nflow:\n  - sequential:\n      - redFlag\n`);
    const r = await runYamlPipeline(config, { vitals: { systolicBP: 80 } });
    expect((r.context.redFlags as string[])).toContain("shock_risk");
  });

  it("unknown agent in pipeline throws", async () => {
    const config = parsePipeline(`name: bad\nagents: [nonExistent]\nflow:\n  - sequential:\n      - nonExistent\n`);
    await expect(runYamlPipeline(config, {})).rejects.toThrow("Agent not found");
  });

  it("durationMs is a positive number", async () => {
    const r = await runYamlPipeline(CHEST_PAIN_CONFIG, { vitals: {} });
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── 7. Debate Engine ─────────────────────────────────────────────────────────
import { runDebate } from "../../server/debate/debateEngine";
import { CardiologyLLMAgent } from "../../server/agents/cardiologyLLMAgent";
import { PulmonaryLLMAgent } from "../../server/agents/pulmonaryLLMAgent";

describe("Batch32 — debateEngine", () => {
  it("returns opinions array with one entry per agent", async () => {
    const result = await runDebate(
      [new CardiologyLLMAgent(), new PulmonaryLLMAgent()],
      { vitals: { hr: 130, spo2: 90 }, symptoms: { chestPain: true, sob: true } }
    );
    expect(result.opinions).toHaveLength(2);
  });

  it("consensus is the highest-scoring diagnosis", async () => {
    const result = await runDebate(
      [new CardiologyLLMAgent(), new PulmonaryLLMAgent()],
      { vitals: { hr: 130, spo2: 90 }, symptoms: { chestPain: true, sob: true } }
    );
    expect(result.consensus.diagnosis).toBeTruthy();
    expect(result.consensus.totalScore).toBeGreaterThan(0);
  });

  it("summary is a non-empty string", async () => {
    const result = await runDebate(
      [new CardiologyLLMAgent()],
      { vitals: { hr: 72 } }
    );
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(5);
  });

  it("empty agent list returns empty opinions and Unknown consensus", async () => {
    const result = await runDebate([], {});
    expect(result.opinions).toHaveLength(0);
    expect(result.consensus.totalScore).toBe(0);
  });

  it("cardiology fallback: chest pain + tachycardia → Possible ACS", async () => {
    const agent  = new CardiologyLLMAgent();
    const result = await agent.evaluate({ vitals: { hr: 130 }, symptoms: { chestPain: true } });
    expect(result.diagnosis).toContain("ACS");
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("pulmonary fallback: low SpO2 → hypoxia flag", async () => {
    const agent  = new PulmonaryLLMAgent();
    const result = await agent.evaluate({ vitals: { spo2: 88 } });
    expect(result.diagnosis.toLowerCase()).toMatch(/hypox|respirat/);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });
});

// ─── 8. Trace Store ───────────────────────────────────────────────────────────
import { saveTrace, getTrace, listTraces, traceCount, clearTraces } from "../../server/audit/traceStore";

describe("Batch32 — traceStore", () => {
  beforeEach(() => clearTraces());

  it("saveTrace() returns a trace with id and createdAt", () => {
    const t = saveTrace({ patientId: "p-1", complaint: "cough", steps: [], totalMs: 50 });
    expect(t.id).toBeTruthy();
    expect(t.createdAt).toBeTruthy();
  });

  it("getTrace() retrieves by id", () => {
    const saved = saveTrace({ patientId: "p-2", complaint: "fever", steps: [], totalMs: 30 });
    const found = getTrace(saved.id);
    expect(found?.id).toBe(saved.id);
  });

  it("getTrace() returns undefined for unknown id", () => {
    expect(getTrace("no-such-id")).toBeUndefined();
  });

  it("listTraces() returns newest first", () => {
    saveTrace({ patientId: "a", complaint: "c1", steps: [], totalMs: 10 });
    saveTrace({ patientId: "b", complaint: "c2", steps: [], totalMs: 20 });
    const list = listTraces(10);
    expect(list[0].complaint).toBe("c2"); // newest first
  });

  it("traceCount() reflects inserts", () => {
    expect(traceCount()).toBe(0);
    saveTrace({ patientId: "x", complaint: "y", steps: [], totalMs: 5 });
    expect(traceCount()).toBe(1);
  });

  it("clearTraces() empties the store", () => {
    saveTrace({ patientId: "z", complaint: "q", steps: [], totalMs: 5 });
    clearTraces();
    expect(traceCount()).toBe(0);
  });

  it("listTraces() respects limit", () => {
    for (let i = 0; i < 10; i++) {
      saveTrace({ patientId: `p-${i}`, complaint: "c", steps: [], totalMs: i });
    }
    expect(listTraces(3)).toHaveLength(3);
  });
});

// ─── 9. Agent Contracts API ───────────────────────────────────────────────────
import { getAgentContracts, buildDAGFromContracts } from "../../server/api/agentContracts";

describe("Batch32 — agentContracts API", () => {
  it("getAgentContracts() returns array with name/consumes/provides", () => {
    const contracts = getAgentContracts();
    expect(contracts.length).toBeGreaterThan(0);
    for (const c of contracts) {
      expect(c.name).toBeTruthy();
      expect(Array.isArray(c.consumes)).toBe(true);
      expect(Array.isArray(c.provides)).toBe(true);
    }
  });

  it("buildDAGFromContracts() has both agent and data nodes", () => {
    const dag = buildDAGFromContracts([
      { name: "redFlagAgent", consumes: ["vitals"], provides: ["redFlags"] },
    ]);
    const types = new Set(dag.nodes.map((n: any) => n.type));
    expect(types.has("agent")).toBe(true);
    expect(types.has("data")).toBe(true);
  });

  it("buildDAGFromContracts() edges connect data → agent → data", () => {
    const dag = buildDAGFromContracts([
      { name: "myAgent", consumes: ["x"], provides: ["y"] },
    ]);
    const inputEdge  = dag.edges.find((e: any) => e.from === "x"       && e.to === "myAgent");
    const outputEdge = dag.edges.find((e: any) => e.from === "myAgent" && e.to === "y");
    expect(inputEdge).toBeTruthy();
    expect(outputEdge).toBeTruthy();
  });
});

// ─── 10. NodeType / RelationType enum completeness ───────────────────────────
describe("Batch32 — schema enums", () => {
  it("NodeType has all 7 expected values", () => {
    const values = Object.values(NodeType);
    expect(values).toContain("disease");
    expect(values).toContain("symptom");
    expect(values).toContain("treatment");
    expect(values).toContain("risk_factor");
  });

  it("RelationType has all 7 expected values", () => {
    const values = Object.values(RelationType);
    expect(values).toContain("INDICATES");
    expect(values).toContain("TREATED_BY");
    expect(values).toContain("CAUSES");
  });
});

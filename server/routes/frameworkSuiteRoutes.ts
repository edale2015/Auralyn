/**
 * frameworkSuiteRoutes.ts — All 5 framework implementations
 * Mounted at /api/frameworks
 *
 * BMAD:
 *   POST /api/frameworks/bmad/sessions             — create session
 *   POST /api/frameworks/bmad/sessions/:id/advance — advance phase + artifact
 *   POST /api/frameworks/bmad/sessions/:id/summon  — Party Mode: summon persona
 *   GET  /api/frameworks/bmad/sessions/:id         — get session
 *   GET  /api/frameworks/bmad/sessions             — list sessions
 *   POST /api/frameworks/bmad/assess-complexity    — classify case complexity
 *   GET  /api/frameworks/bmad/personas/:role       — get persona definition
 *
 * SpecKit:
 *   POST /api/frameworks/speckit/pipelines              — create pipeline
 *   POST /api/frameworks/speckit/pipelines/:id/constitution — set constitution
 *   POST /api/frameworks/speckit/pipelines/:id/spec     — set spec (runs gate)
 *   POST /api/frameworks/speckit/pipelines/:id/plan     — set plan (runs gate)
 *   POST /api/frameworks/speckit/pipelines/:id/orders   — add order
 *   POST /api/frameworks/speckit/pipelines/:id/execute  — try advance to execute (runs gates)
 *   GET  /api/frameworks/speckit/pipelines/:id          — get pipeline
 *   POST /api/frameworks/speckit/spec-completeness      — compute completeness without saving
 *
 * Context Rot Monitor (GSD):
 *   POST /api/frameworks/gsd/sessions                        — create context session
 *   POST /api/frameworks/gsd/sessions/:id/tokens             — record token usage
 *   POST /api/frameworks/gsd/sessions/:id/spawn              — spawn orchestra agent
 *   PATCH /api/frameworks/gsd/sessions/:id/agents/:agentId   — complete agent
 *   POST /api/frameworks/gsd/sessions/:id/research           — add research findings
 *   POST /api/frameworks/gsd/sessions/:id/plans              — add vertical-slice plan
 *   PATCH /api/frameworks/gsd/sessions/:id/plans/:planId/check — plan checker sign-off
 *   GET  /api/frameworks/gsd/sessions/:id                    — get session
 *   GET  /api/frameworks/gsd/thresholds                      — context rot % table
 *   POST /api/frameworks/gsd/debug-hypotheses                — build goal-backward hypotheses
 *
 * Superpowers:
 *   POST  /api/frameworks/superpowers/sessions               — create session
 *   POST  /api/frameworks/superpowers/sessions/:id/design    — submit design proposal
 *   PATCH /api/frameworks/superpowers/sessions/:id/approve   — approve brainstorm
 *   POST  /api/frameworks/superpowers/sessions/:id/tdd       — define TDD protocol
 *   POST  /api/frameworks/superpowers/sessions/:id/review    — submit for 2-stage review
 *   PATCH /api/frameworks/superpowers/reviews/:id/spec       — spec compliance review
 *   PATCH /api/frameworks/superpowers/reviews/:id/quality    — quality review
 *   POST  /api/frameworks/superpowers/check-rationalization  — detect named rationalizations
 *   GET   /api/frameworks/superpowers/rationalizations       — list all named rationalizations
 *
 * Shared Triad Registry:
 *   GET  /api/frameworks/triad                         — full summary
 *   GET  /api/frameworks/triad/agents                  — list agents (?framework=)
 *   GET  /api/frameworks/triad/workflows               — list workflows (?framework=)
 *   GET  /api/frameworks/triad/skills                  — list skills (?framework=)
 *   GET  /api/frameworks/triad/hybrids                 — list hybrid combinations
 *   GET  /api/frameworks/triad/hybrids/:id             — get specific hybrid
 */

import express from "express";

// BMAD
import {
  createBMADSession, getSession as getBMADSession, listSessions as listBMADSessions,
  advancePhase, summonPersona, addArtifact, assessComplexity,
  getPersonaDefinition, getComplexityProfile, generateClinicalBrief, generateUserStories,
  type ComplexityLevel, type PersonaRole,
} from "../frameworks/clinicalPersonaEngine";

// SpecKit
import {
  createPipeline, getPipeline, listPipelines,
  setConstitution, setSpec, setPlan, setDataModel, addOrder, tryAdvanceToExecute,
  computeSpecCompleteness,
} from "../frameworks/gatedSpecPipeline";

// GSD Context Rot
import {
  createContextSession, recordTokenUsage, spawnOrchestraAgent,
  completeOrchestraAgent, addResearchFindings, addPlan, checkPlan,
  getContextSession, listContextSessions,
  CONTEXT_ROT_ZONES, buildVerticalSlicePlan, buildDebugHypotheses, testHypothesis,
  getOrchestraDescriptions, type OrchestraRole,
} from "../frameworks/contextRotMonitor";

// Superpowers
import {
  createSuperpowersSession, getSuperpowersSession, listSuperpowersSessions,
  submitDesignProposal, approveBrainstorm, defineTDDProtocol, checkRationalization,
  submitForTwoStageReview, conductSpecComplianceReview, conductQualityReview,
  getReview as getSPReview,
  NAMED_RATIONALIZATIONS,
} from "../frameworks/clinicalSuperpowers";

// Triad Registry
import {
  getTriadSummary, listAgents, listWorkflows, listSkills, listHybrids, getHybrid,
  type FrameworkSource,
} from "../frameworks/agentTriadRegistry";

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// BMAD
// ──────────────────────────────────────────────────────────────────────────────

router.post("/bmad/assess-complexity", (req, res) => {
  const level = assessComplexity(req.body);
  res.json({ complexity: level, profile: getComplexityProfile(level) });
});

router.post("/bmad/sessions", (req, res) => {
  const { patientId, complexity, additionalPersonas } = req.body as {
    patientId?: string; complexity?: ComplexityLevel; additionalPersonas?: PersonaRole[];
  };
  if (!complexity) return void res.status(400).json({ error: "complexity is required" });
  const session = createBMADSession({ patientId, complexity, additionalPersonas });
  res.status(201).json(session);
});

router.get("/bmad/sessions", (_req, res) => {
  res.json({ sessions: listBMADSessions() });
});

router.get("/bmad/sessions/:id", (req, res) => {
  const s = getBMADSession(req.params.id);
  if (!s) return void res.status(404).json({ error: "Session not found" });
  res.json(s);
});

router.post("/bmad/sessions/:id/advance", (req, res) => {
  const s = advancePhase(req.params.id, req.body);
  if (!s) return void res.status(404).json({ error: "Session not found" });
  res.json(s);
});

router.post("/bmad/sessions/:id/summon", (req, res) => {
  const { persona, reason } = req.body as { persona?: PersonaRole; reason?: string };
  if (!persona || !reason) return void res.status(400).json({ error: "persona and reason required" });
  const ok = summonPersona(req.params.id, persona, reason);
  if (!ok) return void res.status(404).json({ error: "Session not found" });
  res.json({ ok: true, session: getBMADSession(req.params.id) });
});

router.post("/bmad/sessions/:id/artifacts", (req, res) => {
  const ok = addArtifact(req.params.id, req.body);
  if (!ok) return void res.status(404).json({ error: "Session not found" });
  res.status(201).json({ ok: true, session: getBMADSession(req.params.id) });
});

router.get("/bmad/personas/:role", (req, res) => {
  try {
    const persona = getPersonaDefinition(req.params.role as PersonaRole);
    res.json(persona);
  } catch { res.status(404).json({ error: "Persona not found" }); }
});

router.post("/bmad/brief", (req, res) => {
  const brief = generateClinicalBrief(req.body);
  res.json(brief);
});

router.post("/bmad/user-stories", (req, res) => {
  const { complexity } = req.body as { complexity?: ComplexityLevel };
  if (!complexity) return void res.status(400).json({ error: "complexity required" });
  res.json({ stories: generateUserStories(complexity) });
});

// ──────────────────────────────────────────────────────────────────────────────
// SpecKit
// ──────────────────────────────────────────────────────────────────────────────

router.post("/speckit/spec-completeness", (req, res) => {
  res.json({ completenessScore: computeSpecCompleteness(req.body) });
});

router.post("/speckit/pipelines", (req, res) => {
  const p = createPipeline(req.body.patientId);
  res.status(201).json(p);
});

router.get("/speckit/pipelines", (_req, res) => {
  res.json({ pipelines: listPipelines() });
});

router.get("/speckit/pipelines/:id", (req, res) => {
  const p = getPipeline(req.params.id);
  if (!p) return void res.status(404).json({ error: "Pipeline not found" });
  res.json(p);
});

router.post("/speckit/pipelines/:id/constitution", (req, res) => {
  const { ratifiedBy, overrides } = req.body as { ratifiedBy?: string; overrides?: Record<string, unknown> };
  if (!ratifiedBy) return void res.status(400).json({ error: "ratifiedBy required" });
  const p = setConstitution(req.params.id, ratifiedBy, overrides as Parameters<typeof setConstitution>[2]);
  if (!p) return void res.status(404).json({ error: "Pipeline not found" });
  res.json(p);
});

router.post("/speckit/pipelines/:id/spec", (req, res) => {
  const score = computeSpecCompleteness(req.body);
  const gate  = setSpec(req.params.id, { ...req.body, completenessScore: score });
  if (!gate) return void res.status(404).json({ error: "Pipeline not found" });
  res.json({ gate, pipeline: getPipeline(req.params.id) });
});

router.post("/speckit/pipelines/:id/plan", (req, res) => {
  const gate = setPlan(req.params.id, req.body);
  if (!gate) return void res.status(404).json({ error: "Pipeline not found" });
  res.json({ gate, pipeline: getPipeline(req.params.id) });
});

router.post("/speckit/pipelines/:id/data-model", (req, res) => {
  setDataModel(req.params.id, req.body);
  res.json({ ok: true, pipeline: getPipeline(req.params.id) });
});

router.post("/speckit/pipelines/:id/orders", (req, res) => {
  const order = addOrder(req.params.id, req.body);
  if (!order) return void res.status(404).json({ error: "Pipeline not found" });
  res.status(201).json({ order, pipeline: getPipeline(req.params.id) });
});

router.post("/speckit/pipelines/:id/execute", (req, res) => {
  const gate = tryAdvanceToExecute(req.params.id);
  if (!gate) return void res.status(404).json({ error: "Pipeline not found" });
  res.json({ gate, pipeline: getPipeline(req.params.id) });
});

// ──────────────────────────────────────────────────────────────────────────────
// GSD Context Rot Monitor
// ──────────────────────────────────────────────────────────────────────────────

router.get("/gsd/thresholds", (_req, res) => {
  res.json({ thresholds: CONTEXT_ROT_ZONES, orchestra: getOrchestraDescriptions() });
});

router.post("/gsd/sessions", (req, res) => {
  const { sessionId, maxTokens } = req.body as { sessionId?: string; maxTokens?: number };
  if (!sessionId) return void res.status(400).json({ error: "sessionId required" });
  const s = createContextSession(sessionId, maxTokens ?? 200_000);
  res.status(201).json(s);
});

router.get("/gsd/sessions", (_req, res) => {
  res.json({ sessions: listContextSessions() });
});

router.get("/gsd/sessions/:id", (req, res) => {
  const s = getContextSession(req.params.id);
  if (!s) return void res.status(404).json({ error: "Session not found" });
  res.json(s);
});

router.post("/gsd/sessions/:id/tokens", (req, res) => {
  const { tokensUsed, event } = req.body as { tokensUsed?: number; event?: string };
  if (!tokensUsed) return void res.status(400).json({ error: "tokensUsed required" });
  const checkpoint = recordTokenUsage(req.params.id, tokensUsed, event ?? "token_usage");
  if (!checkpoint) return void res.status(404).json({ error: "Session not found" });
  res.json({ checkpoint, session: getContextSession(req.params.id) });
});

router.post("/gsd/sessions/:id/spawn", (req, res) => {
  const { role, taskName } = req.body as { role?: OrchestraRole; taskName?: string };
  if (!role || !taskName) return void res.status(400).json({ error: "role and taskName required" });
  const agent = spawnOrchestraAgent(req.params.id, role, taskName);
  if (!agent) return void res.status(409).json({ error: "Cannot spawn agent — max for this role reached or session not found" });
  res.status(201).json(agent);
});

router.patch("/gsd/sessions/:id/agents/:agentId", (req, res) => {
  const ok = completeOrchestraAgent(req.params.id, req.params.agentId);
  if (!ok) return void res.status(404).json({ error: "Agent or session not found" });
  res.json({ ok: true, session: getContextSession(req.params.id) });
});

router.post("/gsd/sessions/:id/research", (req, res) => {
  const { agentId, ...findings } = req.body as { agentId?: string } & Record<string, unknown>;
  if (!agentId) return void res.status(400).json({ error: "agentId required" });
  const ok = addResearchFindings(req.params.id, findings as Parameters<typeof addResearchFindings>[1], agentId);
  if (!ok) return void res.status(404).json({ error: "Session not found" });
  res.status(201).json({ ok: true });
});

router.post("/gsd/sessions/:id/plans", (req, res) => {
  const { sliceName, tasks } = req.body as { sliceName?: string; tasks?: string[] };
  if (!sliceName || !Array.isArray(tasks)) return void res.status(400).json({ error: "sliceName and tasks[] required" });
  const plan = buildVerticalSlicePlan(sliceName, tasks);
  addPlan(req.params.id, plan);
  res.status(201).json({ plan });
});

router.patch("/gsd/sessions/:id/plans/:planId/check", (req, res) => {
  const { notes } = req.body as { notes?: string[] };
  const ok = checkPlan(req.params.id, req.params.planId, notes ?? []);
  if (!ok) return void res.status(404).json({ error: "Session or plan not found" });
  res.json({ ok: true, session: getContextSession(req.params.id) });
});

router.post("/gsd/debug-hypotheses", (req, res) => {
  const { goal } = req.body as { goal?: string };
  if (!goal) return void res.status(400).json({ error: "goal required" });
  const hypotheses = buildDebugHypotheses(goal);
  res.json({ goal, hypotheses });
});

router.post("/gsd/debug-hypotheses/test", (req, res) => {
  const { hypothesis, observedResult } = req.body;
  if (!hypothesis || !observedResult) return void res.status(400).json({ error: "hypothesis and observedResult required" });
  res.json(testHypothesis(hypothesis, observedResult));
});

// ──────────────────────────────────────────────────────────────────────────────
// Superpowers
// ──────────────────────────────────────────────────────────────────────────────

router.get("/superpowers/rationalizations", (_req, res) => {
  res.json({ rationalizations: NAMED_RATIONALIZATIONS.map((r) => ({ ...r, pattern: r.pattern.toString() })) });
});

router.post("/superpowers/check-rationalization", (req, res) => {
  const { sessionId, text } = req.body as { sessionId?: string; text?: string };
  if (!text) return void res.status(400).json({ error: "text required" });
  const detected = checkRationalization(sessionId ?? "anonymous", text);
  res.json({
    text,
    detected: detected.map((d) => ({ ...d, pattern: d.pattern.toString() })),
    blocked:  detected.some((d) => d.severity === "critical"),
  });
});

router.post("/superpowers/sessions", (req, res) => {
  const { objective } = req.body as { objective?: string };
  if (!objective) return void res.status(400).json({ error: "objective required" });
  const s = createSuperpowersSession(objective);
  res.status(201).json(s);
});

router.get("/superpowers/sessions", (_req, res) => {
  res.json({ sessions: listSuperpowersSessions() });
});

router.get("/superpowers/sessions/:id", (req, res) => {
  const s = getSuperpowersSession(req.params.id);
  if (!s) return void res.status(404).json({ error: "Session not found" });
  res.json(s);
});

router.post("/superpowers/sessions/:id/design", (req, res) => {
  const { proposal, proposedBy } = req.body as { proposal?: string; proposedBy?: string };
  if (!proposal || !proposedBy) return void res.status(400).json({ error: "proposal and proposedBy required" });
  const s = submitDesignProposal(req.params.id, proposal, proposedBy);
  if (!s) return void res.status(404).json({ error: "Session not found" });
  res.json(s);
});

router.patch("/superpowers/sessions/:id/approve", (req, res) => {
  const { approvedBy } = req.body as { approvedBy?: string };
  if (!approvedBy) return void res.status(400).json({ error: "approvedBy required" });
  const s = approveBrainstorm(req.params.id, approvedBy);
  if (!s) return void res.status(404).json({ error: "Session not found" });
  res.json(s);
});

router.post("/superpowers/sessions/:id/tdd", (req, res) => {
  const { interventionName, successCriteria, testConditions } = req.body as {
    interventionName?: string; successCriteria?: string[]; testConditions?: string[];
  };
  if (!interventionName || !Array.isArray(successCriteria) || successCriteria.length === 0) {
    return void res.status(400).json({ error: "interventionName and successCriteria[] (min 1) required" });
  }
  const s = defineTDDProtocol(req.params.id, interventionName, successCriteria, testConditions ?? []);
  if (!s) return void res.status(404).json({ error: "Session not found" });
  res.json(s);
});

router.post("/superpowers/sessions/:id/review", (req, res) => {
  const s = getSuperpowersSession(req.params.id);
  if (!s) return void res.status(404).json({ error: "Session not found" });
  const { output } = req.body as { output?: string };
  if (!output) return void res.status(400).json({ error: "output required" });
  const review = submitForTwoStageReview(req.params.id, output);
  res.status(201).json(review);
});

router.patch("/superpowers/reviews/:id/spec", (req, res) => {
  const { reviewer, violations } = req.body as { reviewer?: string; violations?: string[] };
  if (!reviewer) return void res.status(400).json({ error: "reviewer required" });
  const review = conductSpecComplianceReview(req.params.id, reviewer, violations ?? []);
  if (!review) return void res.status(404).json({ error: "Review not found" });
  res.json(review);
});

router.patch("/superpowers/reviews/:id/quality", (req, res) => {
  const { reviewer, issues } = req.body as { reviewer?: string; issues?: string[] };
  if (!reviewer) return void res.status(400).json({ error: "reviewer required" });
  const review = conductQualityReview(req.params.id, reviewer, issues ?? []);
  if (!review) return void res.status(404).json({ error: "Review not found" });
  res.json(review);
});

// ──────────────────────────────────────────────────────────────────────────────
// Shared Triad Registry
// ──────────────────────────────────────────────────────────────────────────────

router.get("/triad", (_req, res) => {
  res.json(getTriadSummary());
});

router.get("/triad/agents", (req, res) => {
  const framework = req.query.framework as FrameworkSource | undefined;
  res.json({ agents: listAgents(framework) });
});

router.get("/triad/workflows", (req, res) => {
  const framework = req.query.framework as FrameworkSource | undefined;
  res.json({ workflows: listWorkflows(framework) });
});

router.get("/triad/skills", (req, res) => {
  const framework = req.query.framework as FrameworkSource | undefined;
  res.json({ skills: listSkills(framework) });
});

router.get("/triad/hybrids", (_req, res) => {
  res.json({ hybrids: listHybrids() });
});

router.get("/triad/hybrids/:id", (req, res) => {
  const h = getHybrid(req.params.id);
  if (!h) return void res.status(404).json({ error: "Hybrid not found" });
  res.json(h);
});

export default router;

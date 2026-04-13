/**
 * deepAgentsRoutes.ts — Deep Agents / Skills / Subagents API
 * Mounted at /api/deep-agents
 *
 * Harness (write_todos, filesystem, shell, auto-summarization):
 *   POST   /api/deep-agents/harness/sessions          — create harness session
 *   POST   /api/deep-agents/harness/sessions/:id/todos — write_todos (plan first)
 *   PATCH  /api/deep-agents/harness/sessions/:id/todos/:tid — update todo status
 *   POST   /api/deep-agents/harness/sessions/:id/fs/read   — read_file
 *   POST   /api/deep-agents/harness/sessions/:id/fs/write  — write_file
 *   POST   /api/deep-agents/harness/sessions/:id/fs/edit   — edit_file
 *   POST   /api/deep-agents/harness/sessions/:id/fs/ls     — ls
 *   POST   /api/deep-agents/harness/sessions/:id/fs/glob   — glob
 *   POST   /api/deep-agents/harness/sessions/:id/fs/grep   — grep
 *   POST   /api/deep-agents/harness/sessions/:id/shell     — execute (sandboxed)
 *   GET    /api/deep-agents/harness/sessions/:id           — get session
 *   GET    /api/deep-agents/harness/sessions/:id/offload/:ref — resolve offload ref
 *   GET    /api/deep-agents/harness/tools               — list all harness tools
 *
 * Observability (LangSmith-style run tracing):
 *   POST   /api/deep-agents/runs                  — start run
 *   POST   /api/deep-agents/runs/:id/thinking     — log thinking event
 *   POST   /api/deep-agents/runs/:id/tool-use     — log tool_use event
 *   POST   /api/deep-agents/runs/:id/tool-result  — log tool_result event
 *   POST   /api/deep-agents/runs/:id/complete     — complete run with summary
 *   POST   /api/deep-agents/runs/:id/fail         — fail run
 *   GET    /api/deep-agents/runs/:id              — get run
 *   GET    /api/deep-agents/runs/:id/jsonl        — export as JSONL transcript
 *   GET    /api/deep-agents/runs/:id/debug        — debug analysis
 *   GET    /api/deep-agents/runs/stats            — run statistics
 *
 * Skills (progressive disclosure + grading):
 *   POST   /api/deep-agents/skills                — register skill
 *   POST   /api/deep-agents/skills/:id/content    — load Phase 2 content
 *   POST   /api/deep-agents/skills/:id/references — load Phase 3 reference file
 *   GET    /api/deep-agents/skills                — list all skill metadata (Phase 1 only)
 *   GET    /api/deep-agents/skills/:id            — get full skill
 *   GET    /api/deep-agents/skills/:id/grade      — grade skill quality
 *   POST   /api/deep-agents/skills/discover       — discover matching skills for request
 *   POST   /api/deep-agents/skills/validate-name  — validate gerund name
 *   POST   /api/deep-agents/skills/validate-description — validate what+when description
 *   GET    /api/deep-agents/skills/freedom/:level — get degree of freedom profile
 *
 * Subagents (hub-and-spoke, EPE, Agent Teams):
 *   POST   /api/deep-agents/subagents/decide          — delegation decision
 *   POST   /api/deep-agents/subagents/spawn           — spawn subagent
 *   PATCH  /api/deep-agents/subagents/:agentId/complete — complete + return summary
 *   PATCH  /api/deep-agents/subagents/:agentId/fail    — fail with error
 *   POST   /api/deep-agents/subagents/:agentId/resume  — resume via agentId
 *   GET    /api/deep-agents/subagents/:agentId         — get instance
 *   GET    /api/deep-agents/subagents                  — list instances
 *   GET    /api/deep-agents/subagents/builtin          — built-in definitions
 *   POST   /api/deep-agents/subagents/custom           — register custom agent
 *   POST   /api/deep-agents/subagents/validate-desc    — validate agent description
 *   POST   /api/deep-agents/epe                       — create EPE chain
 *   POST   /api/deep-agents/epe/:chainId/advance      — advance EPE stage
 *   GET    /api/deep-agents/epe/:chainId               — get EPE chain
 *   POST   /api/deep-agents/teams                     — create Agent Team
 *   POST   /api/deep-agents/teams/:id/message         — send mailbox message
 *   GET    /api/deep-agents/teams/:id/mailbox/:agentId — read mailbox
 */

import express from "express";

// Harness
import {
  createHarnessSession, getHarnessSession,
  writeTodos, updateTodo,
  readFile, writeFile, editFile, listDirectory, globSearch, grepSearch, executeShell,
  resolveOffloadRef, getHarnessTools, getSandboxAllowlist,
  type TodoPriority,
} from "../harness/agentHarness";

// Observability
import {
  startRun, logThinking, logToolUse, logToolResult, logFinalText,
  completeRun, failRun, getRun, listRuns, getRunStats, debugRun, exportJSONL,
} from "../harness/agentObservability";

// Skills
import {
  registerSkill, loadSkillContent, loadReferenceFile,
  getSkill, listAllSkillMetadata, gradeSkill, discoverSkills,
  validateGerundName, validateDescription, getFreedomProfile,
  buildFeedbackLoop,
  type DegreeOfFreedom, type SkillType,
} from "../skills/skillDiscovery";

// Subagents
import {
  decideDelegation, spawnSubagent, completeSubagent, failSubagent, resumeSubagent,
  registerCustomAgent, getSubagentInstance, listSubagentInstances, listDefinitions,
  getBuiltinDefinitions, validateAgentDescription,
  createEPEChain, advanceEPEChain, getEPEChain,
  createAgentTeam, sendTeamMessage, readTeamMailbox,
  type BuiltinSubagentType,
} from "../subagents/subagentCoordinator";

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// HARNESS
// ──────────────────────────────────────────────────────────────────────────────

router.get("/harness/tools", (_req, res) => {
  res.json({ tools: getHarnessTools(), sandboxAllowlist: getSandboxAllowlist() });
});

router.post("/harness/sessions", (req, res) => {
  const { agentName, config } = req.body as { agentName?: string; config?: Record<string, number> };
  if (!agentName) return void res.status(400).json({ error: "agentName required" });
  res.status(201).json(createHarnessSession(agentName, config));
});

router.get("/harness/sessions/:id", (req, res) => {
  const s = getHarnessSession(req.params.id);
  if (!s) return void res.status(404).json({ error: "Session not found" });
  res.json(s);
});

router.post("/harness/sessions/:id/todos", (req, res) => {
  const { tasks } = req.body as { tasks?: Array<{ description: string; priority?: TodoPriority }> };
  if (!Array.isArray(tasks) || tasks.length === 0) return void res.status(400).json({ error: "tasks[] required" });
  try {
    res.status(201).json({ todos: writeTodos(req.params.id, tasks) });
  } catch (e) { res.status(404).json({ error: String(e) }); }
});

router.patch("/harness/sessions/:id/todos/:tid", (req, res) => {
  const todo = updateTodo(req.params.id, req.params.tid, req.body);
  if (!todo) return void res.status(404).json({ error: "Session or todo not found" });
  res.json(todo);
});

router.post("/harness/sessions/:id/fs/read", (req, res) => {
  const { path } = req.body as { path?: string };
  if (!path) return void res.status(400).json({ error: "path required" });
  res.json(readFile(req.params.id, path));
});

router.post("/harness/sessions/:id/fs/write", (req, res) => {
  const { path, content } = req.body as { path?: string; content?: string };
  if (!path || content === undefined) return void res.status(400).json({ error: "path and content required" });
  res.json(writeFile(req.params.id, path, content));
});

router.post("/harness/sessions/:id/fs/edit", (req, res) => {
  const { path, oldStr, newStr } = req.body as { path?: string; oldStr?: string; newStr?: string };
  if (!path || !oldStr || newStr === undefined) return void res.status(400).json({ error: "path, oldStr, newStr required" });
  res.json(editFile(req.params.id, path, oldStr, newStr));
});

router.post("/harness/sessions/:id/fs/ls", (req, res) => {
  const { directory } = req.body as { directory?: string };
  if (!directory) return void res.status(400).json({ error: "directory required" });
  res.json(listDirectory(req.params.id, directory));
});

router.post("/harness/sessions/:id/fs/glob", (req, res) => {
  const { pattern } = req.body as { pattern?: string };
  if (!pattern) return void res.status(400).json({ error: "pattern required" });
  res.json(globSearch(req.params.id, pattern));
});

router.post("/harness/sessions/:id/fs/grep", (req, res) => {
  const { pattern, path } = req.body as { pattern?: string; path?: string };
  if (!pattern || !path) return void res.status(400).json({ error: "pattern and path required" });
  res.json(grepSearch(req.params.id, pattern, path));
});

router.post("/harness/sessions/:id/shell", (req, res) => {
  const { command } = req.body as { command?: string };
  if (!command) return void res.status(400).json({ error: "command required" });
  res.json(executeShell(req.params.id, command));
});

router.get("/harness/sessions/:id/offload/:ref", (req, res) => {
  const content = resolveOffloadRef(req.params.id, req.params.ref);
  if (content === null) return void res.status(404).json({ error: "Offload reference not found" });
  res.json({ ref: req.params.ref, content });
});

// ──────────────────────────────────────────────────────────────────────────────
// OBSERVABILITY
// ──────────────────────────────────────────────────────────────────────────────

router.get("/runs/stats", (_req, res) => {
  res.json(getRunStats());
});

router.post("/runs", (req, res) => {
  const { agentName, agentId, parentRunId, sessionId } = req.body as {
    agentName?: string; agentId?: string; parentRunId?: string; sessionId?: string;
  };
  if (!agentName) return void res.status(400).json({ error: "agentName required" });
  res.status(201).json(startRun(agentName, agentId, parentRunId, sessionId));
});

router.get("/runs/:id", (req, res) => {
  if (req.params.id === "stats") return void res.json(getRunStats());
  const run = getRun(req.params.id);
  if (!run) return void res.status(404).json({ error: "Run not found" });
  res.json(run);
});

router.get("/runs/:id/jsonl", (req, res) => {
  const jsonl = exportJSONL(req.params.id);
  if (!jsonl) return void res.status(404).json({ error: "Run not found" });
  res.type("text/plain").send(jsonl);
});

router.get("/runs/:id/debug", (req, res) => {
  const analysis = debugRun(req.params.id);
  if (!analysis) return void res.status(404).json({ error: "Run not found" });
  res.json(analysis);
});

router.post("/runs/:id/thinking", (req, res) => {
  const { reasoning } = req.body as { reasoning?: string };
  if (!reasoning) return void res.status(400).json({ error: "reasoning required" });
  logThinking(req.params.id, reasoning);
  res.json({ ok: true });
});

router.post("/runs/:id/tool-use", (req, res) => {
  const { toolName, toolInput } = req.body as { toolName?: string; toolInput?: unknown };
  if (!toolName) return void res.status(400).json({ error: "toolName required" });
  logToolUse(req.params.id, toolName, toolInput);
  res.json({ ok: true });
});

router.post("/runs/:id/tool-result", (req, res) => {
  const { toolName, result, isError } = req.body as { toolName?: string; result?: string; isError?: boolean };
  if (!toolName || result === undefined) return void res.status(400).json({ error: "toolName and result required" });
  logToolResult(req.params.id, toolName, result, isError ?? false);
  res.json({ ok: true });
});

router.post("/runs/:id/complete", (req, res) => {
  const run = completeRun(req.params.id, req.body.summary);
  if (!run) return void res.status(404).json({ error: "Run not found" });
  res.json(run);
});

router.post("/runs/:id/fail", (req, res) => {
  const { error } = req.body as { error?: string };
  if (!error) return void res.status(400).json({ error: "error message required" });
  const run = failRun(req.params.id, error);
  if (!run) return void res.status(404).json({ error: "Run not found" });
  res.json(run);
});

// ──────────────────────────────────────────────────────────────────────────────
// SKILLS
// ──────────────────────────────────────────────────────────────────────────────

router.get("/skills/freedom/:level", (req, res) => {
  const level = req.params.level.toUpperCase() as DegreeOfFreedom;
  if (!["LOW", "MEDIUM", "HIGH"].includes(level)) return void res.status(400).json({ error: "level must be LOW, MEDIUM, or HIGH" });
  res.json(getFreedomProfile(level));
});

router.post("/skills/validate-name", (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name) return void res.status(400).json({ error: "name required" });
  res.json({ name, ...validateGerundName(name) });
});

router.post("/skills/validate-description", (req, res) => {
  const { description } = req.body as { description?: string };
  if (!description) return void res.status(400).json({ error: "description required" });
  res.json({ description, ...validateDescription(description) });
});

router.post("/skills/discover", (req, res) => {
  const { request, maxResults } = req.body as { request?: string; maxResults?: number };
  if (!request) return void res.status(400).json({ error: "request required" });
  res.json({ matches: discoverSkills(request, maxResults ?? 5) });
});

router.post("/skills", (req, res) => {
  const { name, description, type, degreeOfFreedom, tags } = req.body as {
    name?: string; description?: string; type?: SkillType; degreeOfFreedom?: DegreeOfFreedom; tags?: string[];
  };
  if (!name || !description || !type || !degreeOfFreedom) {
    return void res.status(400).json({ error: "name, description, type, degreeOfFreedom required" });
  }
  const skill = registerSkill(name, description, type, degreeOfFreedom, tags ?? []);
  res.status(201).json(skill);
});

router.get("/skills", (_req, res) => {
  res.json({ skills: listAllSkillMetadata() });
});

router.get("/skills/:id", (req, res) => {
  const skill = getSkill(req.params.id);
  if (!skill) return void res.status(404).json({ error: "Skill not found" });
  res.json(skill);
});

router.get("/skills/:id/grade", (req, res) => {
  const grade = gradeSkill(req.params.id);
  if (!grade) return void res.status(404).json({ error: "Skill not found" });
  res.json(grade);
});

router.post("/skills/:id/content", (req, res) => {
  const skill = loadSkillContent(req.params.id, req.body);
  if (!skill) return void res.status(404).json({ error: "Skill not found" });
  res.json(skill);
});

router.post("/skills/:id/references", (req, res) => {
  const { path, content } = req.body as { path?: string; content?: string };
  if (!path || !content) return void res.status(400).json({ error: "path and content required" });
  try {
    const ok = loadReferenceFile(req.params.id, path, content);
    if (!ok) return void res.status(404).json({ error: "Skill not found" });
    res.json({ ok: true, skill: getSkill(req.params.id) });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// SUBAGENTS
// ──────────────────────────────────────────────────────────────────────────────

router.get("/subagents/builtin", (_req, res) => {
  res.json({ definitions: getBuiltinDefinitions() });
});

router.post("/subagents/validate-desc", (req, res) => {
  const { description } = req.body as { description?: string };
  if (!description) return void res.status(400).json({ error: "description required" });
  res.json(validateAgentDescription(description));
});

router.post("/subagents/decide", (req, res) => {
  const { task, requestedTools } = req.body as { task?: string; requestedTools?: string[] };
  if (!task) return void res.status(400).json({ error: "task required" });
  res.json(decideDelegation(task, requestedTools));
});

router.post("/subagents/custom", (req, res) => {
  const def = registerCustomAgent(req.body);
  res.status(201).json(def);
});

router.get("/subagents", (req, res) => {
  const { parentRunId } = req.query as { parentRunId?: string };
  res.json({ instances: listSubagentInstances(parentRunId) });
});

router.get("/subagents/:agentId", (req, res) => {
  const inst = getSubagentInstance(req.params.agentId);
  if (!inst) return void res.status(404).json({ error: "Subagent not found" });
  res.json(inst);
});

router.post("/subagents/spawn", (req, res) => {
  const { type, task, parentRunId, parallelGroup, customDefId } = req.body as {
    type?: string; task?: string; parentRunId?: string; parallelGroup?: string; customDefId?: string;
  };
  if (!type || !task) return void res.status(400).json({ error: "type and task required" });
  const inst = spawnSubagent(type as BuiltinSubagentType, task, parentRunId, parallelGroup, customDefId);
  res.status(201).json(inst);
});

router.patch("/subagents/:agentId/complete", (req, res) => {
  const { summary } = req.body as { summary?: string };
  if (!summary) return void res.status(400).json({ error: "summary required" });
  const inst = completeSubagent(req.params.agentId, summary);
  if (!inst) return void res.status(404).json({ error: "Subagent not found" });
  res.json(inst);
});

router.patch("/subagents/:agentId/fail", (req, res) => {
  const { error } = req.body as { error?: string };
  if (!error) return void res.status(400).json({ error: "error message required" });
  const inst = failSubagent(req.params.agentId, error);
  if (!inst) return void res.status(404).json({ error: "Subagent not found" });
  res.json(inst);
});

router.post("/subagents/:agentId/resume", (req, res) => {
  const { instruction } = req.body as { instruction?: string };
  if (!instruction) return void res.status(400).json({ error: "instruction required" });
  const inst = resumeSubagent(req.params.agentId, instruction);
  if (!inst) return void res.status(404).json({ error: "Subagent not found" });
  res.json(inst);
});

// ── EPE Chain ─────────────────────────────────────────────────────────────────

router.post("/epe", (req, res) => {
  const { sessionId, goal } = req.body as { sessionId?: string; goal?: string };
  if (!sessionId || !goal) return void res.status(400).json({ error: "sessionId and goal required" });
  res.status(201).json(createEPEChain(sessionId, goal));
});

router.get("/epe/:chainId", (req, res) => {
  const chain = getEPEChain(req.params.chainId);
  if (!chain) return void res.status(404).json({ error: "EPE chain not found" });
  res.json(chain);
});

router.post("/epe/:chainId/advance", (req, res) => {
  const { summary } = req.body as { summary?: string };
  if (!summary) return void res.status(400).json({ error: "summary required" });
  const chain = advanceEPEChain(req.params.chainId, summary);
  if (!chain) return void res.status(404).json({ error: "EPE chain not found" });
  res.json(chain);
});

// ── Agent Teams ───────────────────────────────────────────────────────────────

router.post("/teams", (req, res) => {
  const { name, agentTypes } = req.body as { name?: string; agentTypes?: string[] };
  if (!name || !Array.isArray(agentTypes)) return void res.status(400).json({ error: "name and agentTypes[] required" });
  res.status(201).json(createAgentTeam(name, agentTypes as BuiltinSubagentType[]));
});

router.post("/teams/:id/message", (req, res) => {
  const { fromAgentId, toAgentId, subject, content } = req.body as {
    fromAgentId?: string; toAgentId?: string; subject?: string; content?: string;
  };
  if (!fromAgentId || !toAgentId || !subject || !content) {
    return void res.status(400).json({ error: "fromAgentId, toAgentId, subject, content required" });
  }
  const ok = sendTeamMessage(req.params.id, fromAgentId, toAgentId, subject, content);
  if (!ok) return void res.status(404).json({ error: "Team or target agent not found" });
  res.json({ ok: true });
});

router.get("/teams/:id/mailbox/:agentId", (req, res) => {
  const messages = readTeamMailbox(req.params.id, req.params.agentId);
  res.json({ messages });
});

export default router;

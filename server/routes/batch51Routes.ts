/**
 * batch51Routes.ts — Subagent Runner, Hook Matcher Config, Clinical Plugin Bundler,
 *                    Agent Correction Log
 * Mounted at /api/agents/subagents, /api/hooks/matchers, /api/plugins/bundles,
 *             /api/agents/corrections
 */

import express from "express";

import {
  listSubagents, getSubagentSpec, runSubagent, runSubagentTeam,
  type SubagentRunInput,
} from "../agent/subagentRunner";

import {
  listMatcherConfigs, getMatcherConfig, registerMatcherConfig,
  unregisterMatcherConfig, toggleMatcherConfig, evaluateMatchers,
  type HookMatcherConfig, type MatcherHookType,
} from "../agent/hookMatcherConfig";

import {
  installBundle, uninstallBundle, listInstalledBundles, getBundleRecord,
  getBundleScopeRules, isBundleInstalled,
  SEPSIS_RESPONSE_BUNDLE, CHEST_PAIN_PROTOCOL_BUNDLE, PEDIATRIC_TRIAGE_BUNDLE,
} from "../plugins/clinicalPluginBundler";

import {
  logCorrection, getAllCorrections, getCorrectionsByAgent, getCorrectionStats,
  buildSessionPreamble, buildConcisePreamble, getCriticalCorrections,
  loadCorrectionsFromRedis,
} from "../memory/agentCorrectionLog";

const router = express.Router();

// ── 1. Subagent Runner ────────────────────────────────────────────────────────

router.get("/subagents", (_req, res) => {
  res.json({ subagents: listSubagents(), count: listSubagents().length });
});

router.get("/subagents/:name", (req, res) => {
  const spec = getSubagentSpec(req.params.name);
  if (!spec) return void res.status(404).json({ error: `Subagent not found: ${req.params.name}` });
  res.json(spec);
});

router.post("/subagents/:name/run", async (req, res) => {
  try {
    const { task, payload, sessionId, patientId } = req.body as SubagentRunInput & { task?: string };
    if (!task) return void res.status(400).json({ error: "task is required" });

    const result = await runSubagent(req.params.name, {
      task, payload: payload ?? {}, sessionId, patientId,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/subagents/team/run", async (req, res) => {
  try {
    const { tasks } = req.body as {
      tasks: Array<{ subagentName: string; input: SubagentRunInput }>;
    };
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return void res.status(400).json({ error: "tasks array is required" });
    }
    const results = await runSubagentTeam(tasks);
    res.json({ results, count: results.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── 2. Hook Matcher Config ────────────────────────────────────────────────────

router.get("/hooks/matchers", (_req, res) => {
  res.json({ matchers: listMatcherConfigs(), count: listMatcherConfigs().length });
});

router.get("/hooks/matchers/:id", (req, res) => {
  const m = getMatcherConfig(req.params.id);
  if (!m) return void res.status(404).json({ error: `Matcher not found: ${req.params.id}` });
  res.json(m);
});

router.post("/hooks/matchers", (req, res) => {
  try {
    const config = req.body as HookMatcherConfig;
    if (!config.id || !config.hookType || !config.toolMatcher) {
      return void res.status(400).json({ error: "id, hookType, toolMatcher required" });
    }
    registerMatcherConfig(config);
    res.status(201).json({ ok: true, id: config.id });
  } catch (err) {
    res.status(409).json({ error: String(err) });
  }
});

router.delete("/hooks/matchers/:id", (req, res) => {
  const ok = unregisterMatcherConfig(req.params.id);
  res.json({ ok, id: req.params.id });
});

router.patch("/hooks/matchers/:id/toggle", (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  if (typeof enabled !== "boolean") {
    return void res.status(400).json({ error: "enabled (boolean) required" });
  }
  const ok = toggleMatcherConfig(req.params.id, enabled);
  res.json({ ok, id: req.params.id, enabled });
});

router.post("/hooks/matchers/evaluate", (req, res) => {
  const { hookType, toolName, agentRole, payload, sessionId } = req.body;
  if (!hookType || !toolName || !agentRole) {
    return void res.status(400).json({ error: "hookType, toolName, agentRole required" });
  }
  const result = evaluateMatchers({
    hookType: hookType as MatcherHookType, toolName, agentRole, payload, sessionId,
  });
  res.json(result);
});

// ── 3. Clinical Plugin Bundler ────────────────────────────────────────────────

const BUILT_IN_BUNDLES = {
  "sepsis-response":      SEPSIS_RESPONSE_BUNDLE,
  "chest-pain-protocol":  CHEST_PAIN_PROTOCOL_BUNDLE,
  "pediatric-triage":     PEDIATRIC_TRIAGE_BUNDLE,
};

router.get("/plugins/bundles", (_req, res) => {
  const installed = listInstalledBundles();
  const available = Object.entries(BUILT_IN_BUNDLES).map(([id, b]) => ({
    id, name: b.name, specialty: b.specialty, installed: isBundleInstalled(id),
  }));
  res.json({ installed, available, installedCount: installed.length });
});

router.get("/plugins/bundles/:id", (req, res) => {
  const record = getBundleRecord(req.params.id);
  if (record) return void res.json(record);
  const builtIn = BUILT_IN_BUNDLES[req.params.id as keyof typeof BUILT_IN_BUNDLES];
  if (builtIn) return void res.json({ bundle: builtIn, installed: false });
  res.status(404).json({ error: `Bundle not found: ${req.params.id}` });
});

router.post("/plugins/bundles/:id/install", (req, res) => {
  const builtIn = BUILT_IN_BUNDLES[req.params.id as keyof typeof BUILT_IN_BUNDLES];
  const bundle  = builtIn ?? req.body;
  if (!bundle?.id) {
    return void res.status(400).json({ error: "bundle id required" });
  }
  const record = installBundle(bundle);
  const code   = record.status === "error" ? 500 : record.status === "installed" ? 201 : 207;
  res.status(code).json(record);
});

router.delete("/plugins/bundles/:id/uninstall", (req, res) => {
  const result = uninstallBundle(req.params.id);
  res.json(result);
});

router.get("/plugins/bundles/:id/scope-rules", (req, res) => {
  const rules = getBundleScopeRules(req.params.id);
  res.json({ bundleId: req.params.id, rules, count: rules.length });
});

// ── 4. Agent Correction Log ───────────────────────────────────────────────────

// Load from Redis on first request
let _loaded = false;
const ensureLoaded = async () => {
  if (!_loaded) { await loadCorrectionsFromRedis(); _loaded = true; }
};

router.get("/corrections", async (_req, res) => {
  await ensureLoaded();
  res.json({ corrections: getAllCorrections(), stats: getCorrectionStats() });
});

router.get("/corrections/critical", async (_req, res) => {
  await ensureLoaded();
  res.json({ corrections: getCriticalCorrections(), count: getCriticalCorrections().length });
});

router.get("/corrections/agent/:role", async (req, res) => {
  await ensureLoaded();
  const corrections = getCorrectionsByAgent(req.params.role);
  res.json({ agentRole: req.params.role, corrections, count: corrections.length });
});

router.get("/corrections/preamble/:role", async (req, res) => {
  await ensureLoaded();
  const { concise } = req.query;
  const preamble = concise === "true"
    ? buildConcisePreamble(req.params.role)
    : buildSessionPreamble(req.params.role);
  res.json({ agentRole: req.params.role, preamble, hasRules: preamble.length > 0 });
});

router.post("/corrections", async (req, res) => {
  try {
    const { sessionId, agentRole, mistake, correction, rule, severity,
            confirmedBy, appliesTo, category, caseId, patientId } = req.body;
    if (!sessionId || !agentRole || !mistake || !correction || !rule || !severity || !confirmedBy || !category) {
      return void res.status(400).json({
        error: "sessionId, agentRole, mistake, correction, rule, severity, confirmedBy, category required",
      });
    }
    const entry = await logCorrection({
      sessionId, agentRole, mistake, correction, rule, severity,
      confirmedBy, appliesTo: appliesTo ?? [agentRole], category, caseId, patientId,
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/corrections/stats", async (_req, res) => {
  await ensureLoaded();
  res.json(getCorrectionStats());
});

export default router;

/**
 * Agent System Routes — Control Tower MCP layer
 * Mounted at /api/agents
 *
 * POST /api/agents/reason        — Sequential Clinical Reasoner (step-by-step trace)
 * GET  /api/agents/context       — System Context Engine (TS file scan)
 * GET  /api/agents/evidence      — Evidence search (PubMed + ClinicalTrials)
 * GET  /api/agents/health        — Deployment self-diagnostic
 * POST /api/agents/debug         — Analyse log blob for failures
 * GET  /api/agents/plugins       — Plugin registry list
 * POST /api/agents/plugins/toggle— Toggle plugin status
 * GET  /api/agents/ehr/systems   — EHR configured systems
 * POST /api/agents/ehr/note      — Push clinical note (stub)
 * POST /api/agents/ehr/login     — EHR session init (stub)
 */

import express from "express";
import { sequentialReasoner }    from "../agents/sequentialClinicalReasoner";
import { scanProject }           from "../agents/systemContextEngine";
import { evidenceEngine }        from "../agents/evidenceEngine";
import { deploymentDebugger }    from "../agents/deploymentDebugger";
import { ehrAutomationAgent }    from "../agents/ehrAutomationAgent";
import { listPlugins, togglePlugin, recordPluginCall } from "../agents/pluginRegistry";

const router = express.Router();

// ── Sequential Clinical Reasoner ──────────────────────────────────────────────
router.post("/reason", async (req, res) => {
  try {
    recordPluginCall("diagnosis");
    const result = await sequentialReasoner.run(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Reasoner failed" });
  }
});

// ── System Context Engine ─────────────────────────────────────────────────────
router.get("/context", (_req, res) => {
  try {
    const ctx = scanProject();
    // Only expose stats + unused files for security (not full file paths in prod)
    res.json({
      scannedAt:   ctx.scannedAt,
      totalFiles:  ctx.totalFiles,
      stats:       ctx.stats,
      unusedCount: ctx.unusedFiles.length,
      unusedFiles: ctx.unusedFiles.slice(0, 30),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Full context (internal tooling only)
router.get("/context/full", (_req, res) => {
  try {
    res.json(scanProject());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Evidence Engine ───────────────────────────────────────────────────────────
router.get("/evidence", async (req, res) => {
  const q = String(req.query.q ?? "");
  if (!q) { res.status(400).json({ error: "query param q is required" }); return; }
  try {
    const results = await evidenceEngine.searchGuidelines(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/evidence/pubmed", async (req, res) => {
  const q = String(req.query.q ?? "");
  const n = Math.min(Number(req.query.n ?? 5), 20);
  if (!q) { res.status(400).json({ error: "query param q required" }); return; }
  try { res.json(await evidenceEngine.searchPubMed(q, n)); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/evidence/trials", async (req, res) => {
  const q = String(req.query.q ?? "");
  const n = Math.min(Number(req.query.n ?? 5), 20);
  if (!q) { res.status(400).json({ error: "query param q required" }); return; }
  try { res.json(await evidenceEngine.searchClinicalTrials(q, n)); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Deployment Debugger ───────────────────────────────────────────────────────
router.get("/health", async (_req, res) => {
  try {
    const health = await deploymentDebugger.getServiceHealth();
    res.json({ health, checkedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/debug", (req, res) => {
  const { logs = "" } = req.body;
  const diagnostics = deploymentDebugger.analyzeFailure(logs);
  const summary     = deploymentDebugger.summarizeLogs(logs);
  res.json({ diagnostics, summary });
});

// ── Plugin Registry ───────────────────────────────────────────────────────────
router.get("/plugins", (_req, res) => {
  res.json(listPlugins());
});

router.post("/plugins/toggle", (req, res) => {
  const { name, status } = req.body;
  if (!name || !status) { res.status(400).json({ error: "name and status required" }); return; }
  const ok = togglePlugin(name, status);
  if (!ok) { res.status(404).json({ error: `Plugin "${name}" not found` }); return; }
  res.json({ ok: true, name, status });
});

// ── EHR Automation Agent ──────────────────────────────────────────────────────
router.get("/ehr/systems", (_req, res) => {
  res.json({ configured: ehrAutomationAgent.getConfiguredSystems() });
});

router.post("/ehr/login", async (req, res) => {
  const { username = "demo", password = "", system = "athena" } = req.body;
  try {
    const session = system === "epic"
      ? await ehrAutomationAgent.loginEpic(username, password)
      : await ehrAutomationAgent.loginAthena(username, password);
    recordPluginCall("fhir");
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/ehr/note", async (req, res) => {
  const { note = "", system = "athena", patientId } = req.body;
  if (!note) { res.status(400).json({ error: "note is required" }); return; }
  try {
    const result = patientId
      ? await ehrAutomationAgent.pushDiagnosis(patientId, note, system)
      : await ehrAutomationAgent.enterClinicalNote(note, system);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

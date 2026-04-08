/**
 * councilRoutes.ts
 * API endpoints for multi-agent council and hierarchical specialist councils.
 *
 * POST /api/council/run                     — run base multi-agent council
 * POST /api/council/hierarchical/run       — run full hierarchical specialist council
 * GET  /api/council/hierarchical/telemetry — council activation stats (bandit)
 * POST /api/council/hierarchical/feedback  — record council usefulness feedback
 * POST /api/council/debate-preview         — preview debate output for a set of agents
 * POST /api/council/graph/run              — run graph-augmented hierarchical council (AgentInput)
 * GET  /api/council/graph/telemetry        — council run telemetry from Redis
 */

import { Router } from "express";
import { multiAgentCouncil }              from "../agents/multiAgentCouncil";
import { runHierarchicalCouncil }         from "../agents/hierarchicalCouncil";
import { councilActivationBandit }        from "../agents/councilActivationBandit";
import type { SpecialtyCouncil }          from "../agents/councilActivationBandit";
import { debateEngine }                   from "../agents/debateEngine";
import { consensusEngine }                from "../agents/consensusEngine";
import { hierarchicalGraphCouncil }       from "../agents/graphCouncils/hierarchicalCouncil";
import type { AgentInput }                from "../agents/graphCouncils/types";
import { getCouncilTelemetry }            from "../controlTower/councilTelemetry";

const router = Router();

router.post("/run", async (req, res) => {
  try {
    const result = await multiAgentCouncil.run({ patient: req.body ?? {} });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/hierarchical/run", async (req, res) => {
  try {
    const body = req.body ?? {};
    const result = await runHierarchicalCouncil({
      patientId:    body.patientId,
      symptoms:     body.symptoms     ?? [],
      answers:      body.answers      ?? {},
      vitals:       body.vitals,
      riskScore:    body.riskScore,
      riskLevel:    body.riskLevel,
      redFlags:     body.redFlags,
      differentials: body.differentials,
      brainOutput:  body.brainOutput,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/hierarchical/telemetry", async (_req, res) => {
  try {
    const stats = await councilActivationBandit.getStats();
    res.json({ councils: stats, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/hierarchical/feedback", async (req, res) => {
  try {
    const { council, helpful } = req.body ?? {};
    const validCouncils: SpecialtyCouncil[] = ["cardiology", "infectious_disease", "icu"];
    if (!validCouncils.includes(council)) {
      return res.status(400).json({ error: `council must be one of: ${validCouncils.join(", ")}` });
    }
    await councilActivationBandit.recordFeedback(council as SpecialtyCouncil, Boolean(helpful));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/debate-preview", async (req, res) => {
  try {
    const { agents } = req.body ?? {};
    if (!Array.isArray(agents)) {
      return res.status(400).json({ error: "agents must be an array" });
    }
    const critiques   = debateEngine.generateCritiques(agents);
    const adjusted    = debateEngine.apply(critiques, agents);
    const consensus   = consensusEngine.compute(adjusted);
    res.json({ critiques, adjustedAgents: adjusted, consensus });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/graph/run", async (req, res) => {
  try {
    const body = req.body || {};
    const input: AgentInput = {
      traceId: body.traceId || `trace_${Date.now()}`,
      council: "master",
      patient: body.patient || { patientId: "unknown", complaint: "undifferentiated" },
      features: body.features || [],
      sequence: body.sequence || [],
      mode: body.mode || "balanced",
    };
    const result = await hierarchicalGraphCouncil.run(input);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/graph/telemetry", async (_req, res) => {
  try {
    const telemetry = await getCouncilTelemetry();
    res.json(telemetry);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

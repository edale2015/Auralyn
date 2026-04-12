/**
 * NeuroCore-inspired routes — /api/neuro/*
 * Exposes typed skill contracts, jitter backoff, and clinical reasoning chains.
 */

import express from "express";
import {
  createFlowContext,
  validatePipeline,
  executePipeline,
  type AsyncSkill,
  type PipelineBlueprint,
} from "../skills/skillContracts";
import { withJitterRetry, computeBackoffMs } from "../utils/jitterBackoff";
import {
  getReasoningChain,
  summariseChain,
  getDispositionLineage,
  findChainsConnecting,
} from "../knowledge/clinicalReasoningChain";
import { detectSepsisRisk }   from "../sepsis/sepsisEngine";
import { runDigitalTwin }     from "../digitalTwin/digitalTwinEngine";

const router = express.Router();

// ── Pipeline validator ────────────────────────────────────────────────────────
router.post("/pipeline/validate", (req, res) => {
  try {
    const { blueprint, skillDefs, initialKeys } = req.body;
    if (!blueprint) { res.status(400).json({ error: "blueprint required" }); return; }

    const skills = new Map<string, AsyncSkill>();
    for (const [name, def] of Object.entries<any>(skillDefs ?? {})) {
      skills.set(name, {
        meta: { name, version: "1.0", description: def.description ?? name, provides: def.provides ?? [], consumes: def.consumes ?? [] },
        async process(ctx) {
          for (const key of def.provides ?? []) ctx.set(key, `${key}_produced`);
          return ctx;
        },
      });
    }
    res.json(validatePipeline(blueprint as PipelineBlueprint, skills, initialKeys ?? []));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Pipeline executor (demo — runs triage pipeline) ──────────────────────────
router.post("/pipeline/run", async (req, res) => {
  try {
    const patient = req.body;
    if (!patient?.id || !patient?.vitals) {
      res.status(400).json({ error: "id and vitals required" }); return;
    }

    const skills = new Map<string, AsyncSkill>([
      ["sepsis_detection", {
        meta: { name: "sepsis_detection", version: "1.0", description: "Sepsis risk",
                provides: ["sepsis_risk"], consumes: ["vitals"], maxRetries: 2, retryDelayBase: 0.01 },
        async process(ctx) {
          const vitals = ctx.get("vitals");
          const r = detectSepsisRisk({ id: patient.id, vitals, symptoms: patient.symptoms ?? [] });
          ctx.set("sepsis_risk", r);
          return ctx;
        },
      }],
      ["digital_twin", {
        meta: { name: "digital_twin", version: "1.0", description: "Digital twin",
                provides: ["twin_result"], consumes: ["vitals"], maxRetries: 1, retryDelayBase: 0.01 },
        async process(ctx) {
          const r = await runDigitalTwin(patient, 60);
          ctx.set("twin_result", r);
          return ctx;
        },
      }],
    ]);

    const blueprint: PipelineBlueprint = {
      name:   "triage-demo",
      version:"1.0",
      skills: [
        { skillName: "sepsis_detection" },
        { skillName: "digital_twin" },
      ],
    };

    const events: any[] = [];
    const result = await executePipeline(
      blueprint, skills,
      { vitals: patient.vitals, demographics: { age: patient.age } },
      (e) => events.push(e)
    );

    res.json({ ...result, events });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Jitter backoff info endpoint ──────────────────────────────────────────────
router.get("/backoff/preview", (req, res) => {
  const baseMs = Number(req.query.baseMs ?? 1000);
  const maxMs  = Number(req.query.maxMs  ?? 30_000);
  const maxAttempts = Math.min(Number(req.query.attempts ?? 5), 10);
  const preview = Array.from({ length: maxAttempts }, (_, i) => ({
    attempt:    i + 1,
    minDelayMs: 0,
    maxDelayMs: Math.round(Math.min(baseMs * Math.pow(2, i), maxMs)),
    sampleMs:   Math.round(computeBackoffMs(i, { baseMs, maxMs })),
  }));
  res.json({ baseMs, maxMs, preview });
});

// ── Clinical reasoning chain ──────────────────────────────────────────────────
router.post("/chain/query", async (req, res) => {
  try {
    const chain = await getReasoningChain(req.body);
    if (!chain) { res.status(404).json({ error: "Starting node not found" }); return; }
    res.json({ ...chain, narrative: summariseChain(chain) });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/chain/disposition/:label", async (req, res) => {
  try {
    const chain = await getDispositionLineage(req.params.label);
    if (!chain) { res.status(404).json({ error: "Disposition node not found" }); return; }
    res.json({ ...chain, narrative: summariseChain(chain) });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/chain/connect", async (req, res) => {
  try {
    const { from, to, maxHops } = req.body;
    if (!from || !to) { res.status(400).json({ error: "from and to required" }); return; }
    const chains = await findChainsConnecting(from, to, maxHops ?? 4);
    res.json({ count: chains.length, chains: chains.map((c) => ({ ...c, narrative: summariseChain(c) })) });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;

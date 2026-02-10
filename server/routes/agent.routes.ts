import { Router } from "express";
import { z } from "zod";
import { requireProviderAuth } from "../auth";
import { CaseStateSchema, AgentRunConfigSchema, AgentActionSchema } from "../../shared/agentTypes";
import { routeNextAction } from "../agent/router";
import { executeAction } from "../agent/executors";
import { runAgentLoop, buildAgentRunResponse } from "../agent/runtime";

const router = Router();

const NextReqSchema = z.object({
  state: CaseStateSchema,
  config: AgentRunConfigSchema,
});

router.post("/next", requireProviderAuth, (req, res) => {
  const parsed = NextReqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { state, config } = parsed.data;
  const next = routeNextAction(state, config);
  return res.json(next);
});

const ExecReqSchema = z.object({
  state: CaseStateSchema,
  config: AgentRunConfigSchema,
  action: AgentActionSchema,
  stepNo: z.number().default(1),
});

router.post("/execute", requireProviderAuth, async (req, res) => {
  const parsed = ExecReqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { state, config, action, stepNo } = parsed.data;
  const exec = await executeAction(state, action, config, stepNo);

  return res.json({
    state: exec.state,
    step: exec.step ?? null,
    events: exec.events ?? [],
    stop: exec.stop ?? null,
  });
});

const RunReqSchema = z.object({
  state: CaseStateSchema,
  config: AgentRunConfigSchema,
  env: z.object({
    sheetEnv: z.enum(["prod", "staging"]).default("staging"),
    rulesetHash: z.string().default("unknown"),
  }).default({ sheetEnv: "staging", rulesetHash: "unknown" }),
});

router.post("/run", requireProviderAuth, async (req, res) => {
  const parsed = RunReqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { state, config, env } = parsed.data;
  const out = await runAgentLoop(state, config);

  const response = buildAgentRunResponse(
    config.runId,
    env.sheetEnv,
    env.rulesetHash,
    out.finalState,
    out.steps,
    out.events
  );

  return res.json(response);
});

export default router;

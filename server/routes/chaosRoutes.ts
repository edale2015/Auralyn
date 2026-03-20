import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  enableChaos,
  disableChaos,
  injectChaos,
  clearChaos,
  getChaosState,
  ChaosScenario,
} from "../chaos/chaosEngine";
import { runRecovery } from "../recovery/recoveryEngine";
import { getRecoveryStats } from "../system/recoveryLoop";

const router = Router();
const VALID_SCENARIOS: ChaosScenario[] = [
  "db_down",
  "redis_down",
  "openai_down",
  "latency_spike",
  "queue_overload",
  "high_error_rate",
];

const adminOnly = requireRole(["admin"]);

function guardProduction(req: Request, res: Response, next: Function) {
  if (process.env.NODE_ENV === "production" && !process.env.CHAOS_ALLOWED_IN_PROD) {
    return res.status(403).json({ error: "Chaos endpoints disabled in production. Set CHAOS_ALLOWED_IN_PROD=true to override." });
  }
  next();
}

router.use(guardProduction as any);
router.use(adminOnly as any);

router.post("/enable", (_req: Request, res: Response) => {
  enableChaos();
  res.json({ chaos: "enabled", state: getChaosState() });
});

router.post("/disable", (_req: Request, res: Response) => {
  disableChaos();
  res.json({ chaos: "disabled", state: getChaosState() });
});

router.post("/inject/:type", (req: Request, res: Response) => {
  const type = req.params.type as ChaosScenario;
  if (!VALID_SCENARIOS.includes(type)) {
    return res.status(400).json({
      error: `Unknown scenario: ${type}`,
      valid: VALID_SCENARIOS,
    });
  }
  injectChaos(type);
  res.json({ injected: type, state: getChaosState() });
});

router.delete("/inject/:type", (req: Request, res: Response) => {
  const type = req.params.type as ChaosScenario;
  clearChaos(type);
  res.json({ cleared: type, state: getChaosState() });
});

router.get("/state", (_req: Request, res: Response) => {
  res.json({ ok: true, chaos: getChaosState(), recovery: getRecoveryStats() });
});

router.post("/recovery/run", async (_req: Request, res: Response) => {
  try {
    const actions = await runRecovery();
    res.json({ ok: true, actionsTriggered: actions.length, actions });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/scenario/full", (_req: Request, res: Response) => {
  enableChaos();
  injectChaos("db_down");
  injectChaos("redis_down");
  injectChaos("openai_down");
  res.json({
    ok: true,
    message: "Full chaos scenario active — db + redis + openai failures injected",
    state: getChaosState(),
  });
});

router.post("/scenario/reset", (_req: Request, res: Response) => {
  disableChaos();
  res.json({ ok: true, message: "All chaos cleared", state: getChaosState() });
});

export default router;

import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { autoDebuggerAgent } from "../agents/autoDebuggerAgent";
import { rootCauseEngine } from "../agents/rootCauseEngine";
import { multiAgentCoordinator } from "../agents/multiAgentCoordinator";
import { predictiveFailureEngine } from "../engines/predictiveFailureEngine";
import { memoryEngine } from "../engines/memoryEngine";
import { explainabilityGraphEngine } from "../engines/explainabilityGraphEngine";
import { autonomousDeploymentEngine } from "../deployment/autonomousDeploymentEngine";
import { selfImprovingBrain } from "../brain/selfImprovingBrain";

const router = Router();

router.get("/api/self-improving/cycle", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const cycle = selfImprovingBrain.runCycle();
  res.json(cycle);
});

router.get("/api/self-improving/history", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json({ cycles: selfImprovingBrain.getHistory() });
});

router.get("/api/auto-debugger/actions", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  autoDebuggerAgent.start();
  res.json({ actions: autoDebuggerAgent.getActions(), summary: autoDebuggerAgent.getSummary() });
});

router.get("/api/auto-debugger/root-cause", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(rootCauseEngine.analyze());
});

router.get("/api/predictive-failures", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const risks = predictiveFailureEngine.detectAll();
  const history = predictiveFailureEngine.getHistory();
  res.json({ risks, history, totalServices: Object.keys(history).length });
});

router.get("/api/agent-coordinator", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(multiAgentCoordinator.getSummary());
});

router.get("/api/clinical-memory", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json({ summary: memoryEngine.getSummary(), recent: memoryEngine.getRecent(30) });
});

router.post("/api/explainability-graph", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const trace = req.body.trace || [
    { layer: "interface", durationMs: 2 },
    { layer: "normalization", durationMs: 1 },
    { layer: "knowledge", durationMs: 5 },
    { layer: "safety", durationMs: 3 },
    { layer: "reasoning", durationMs: 8 },
    { layer: "decision", durationMs: 2 },
  ];
  const graph = explainabilityGraphEngine.build(trace);
  res.json(graph);
});

router.post("/api/autonomous-deploy", requireRole(["admin"]), async (req: Request, res: Response) => {
  const version = req.body.version || { id: "v_test", status: "approved" };
  const result = await autonomousDeploymentEngine.deploy(version);
  res.json(result);
});

router.get("/api/autonomous-deploy/history", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(autonomousDeploymentEngine.getSummary());
});

export default router;

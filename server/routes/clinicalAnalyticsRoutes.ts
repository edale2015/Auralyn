import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { differentialExplorer } from "../differential/differentialExplorer";
import { questionImpactAnalyzer } from "../questions/questionImpactAnalyzer";
import { protocolConflictDetector } from "../protocols/protocolConflictDetector";
import { caseClusterDiscovery } from "../cases/caseClusterDiscovery";
import { pubmedAgent } from "../research/pubmedAgent";

const router = Router();

router.get("/api/differential-explorer/graph", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const graph = differentialExplorer.buildGraph();
  res.json(graph);
});

router.post("/api/differential-explorer/graph", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const graph = differentialExplorer.buildGraph(req.body.diagnoses);
  res.json(graph);
});

router.get("/api/differential-explorer/from-graph", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const graph = differentialExplorer.buildGraphFromKnowledgeGraph();
  res.json(graph);
});

router.get("/api/question-impact", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const results = questionImpactAnalyzer.analyzeAllQuestions();
  res.json({ results, totalQuestions: results.length });
});

router.get("/api/protocol-conflicts", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const summary = protocolConflictDetector.getSummary();
  res.json(summary);
});

router.get("/api/case-clusters", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const summary = caseClusterDiscovery.getSummary();
  res.json(summary);
});

router.get("/api/pubmed-search", requireRole(["admin", "physician"]), async (req: Request, res: Response) => {
  const term = (req.query.term as string) || "ENT flu triage AI";
  const max = req.query.max ? parseInt(req.query.max as string, 10) : 5;
  const result = await pubmedAgent.search(term, max);
  res.json(result);
});

export default router;

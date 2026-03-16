import express from "express";
import { getKnowledgeGraph, getGraphStats } from "../knowledge/knowledgeGraphStore";
import {
  findComplaintPathway,
  getNeighborhood,
  searchKnowledgeGraph,
  getEscalationPaths,
} from "../knowledge/knowledgeGraphQueryEngine";
import { detectGraphGaps, getGapSummary } from "../knowledge/graphGapDetector";
import { scoreQuestionCoverage } from "../knowledge/questionCoverageEngine";
import { engineDependencies, getEngineDependencyList, getDownstreamDependents } from "../analysis/engineDependencyGraph";
import { chooseNextQuestion, getQuestionSequence } from "../engines/graphAwareQuestionEngine";

const router = express.Router();

router.get("/knowledge-graph", (_req, res) => {
  res.json(getKnowledgeGraph());
});

router.get("/knowledge-graph/stats", (_req, res) => {
  res.json(getGraphStats());
});

router.get("/knowledge-graph/search", (req, res) => {
  const q = String(req.query.q || "");
  res.json(searchKnowledgeGraph(q));
});

router.get("/knowledge-graph/node/:nodeType/:nodeKey", (req, res) => {
  const nodeId = `${req.params.nodeType}:${req.params.nodeKey}`;
  const data = getNeighborhood(nodeId);
  if (!data) return res.status(404).json({ error: "node_not_found" });
  res.json(data);
});

router.get("/knowledge-graph/pathway/:complaintType/:complaintKey", (req, res) => {
  const complaintId = `${req.params.complaintType}:${req.params.complaintKey}`;
  const data = findComplaintPathway(complaintId);
  if (!data) return res.status(404).json({ error: "complaint_not_found" });
  res.json(data);
});

router.get("/knowledge-graph/escalations", (_req, res) => {
  res.json(getEscalationPaths());
});

router.get("/knowledge-graph/gaps", (_req, res) => {
  res.json(getGapSummary());
});

router.get("/knowledge-graph/question-coverage", (_req, res) => {
  res.json(scoreQuestionCoverage());
});

router.get("/knowledge-graph/engine-dependencies", (_req, res) => {
  res.json({
    dependencies: engineDependencies,
    list: getEngineDependencyList(),
  });
});

router.get("/knowledge-graph/engine-dependencies/:engine", (req, res) => {
  const dependents = getDownstreamDependents(req.params.engine);
  res.json({ engine: req.params.engine, dependents });
});

router.get("/knowledge-graph/next-question/:complaint", (req, res) => {
  const answered = (req.query.answered as string || "").split(",").filter(Boolean);
  const result = chooseNextQuestion(req.params.complaint, answered);
  if (!result) return res.json({ done: true, message: "All questions answered" });
  res.json(result);
});

router.get("/knowledge-graph/question-sequence/:complaint", (req, res) => {
  res.json(getQuestionSequence(req.params.complaint));
});

export default router;

import express from "express";
import { intentEngine } from "../operator/intentEngine";
import { taskPlanner } from "../operator/taskPlanner";
import { eligibilityEngine } from "../operator/eligibilityEngine";
import { learningEngine } from "../operator/learningEngine";
import { batchProcessor } from "../operator/batchProcessor";
import { operatorOrchestrator } from "../operator/operatorOrchestrator";

const router = express.Router();

router.post("/parse-intent", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  const intent = intentEngine.parse(text);
  res.json(intent);
});

router.post("/check-eligibility", (req, res) => {
  const eligibility = eligibilityEngine.determine(req.body);
  res.json(eligibility);
});

router.post("/create-plan", (req, res) => {
  const { goal, program, userData } = req.body;
  if (!goal || !program) return res.status(400).json({ error: "goal and program required" });
  const plan = taskPlanner.createPlan(goal, program, userData || {});
  res.json(plan);
});

router.get("/templates", (_req, res) => {
  res.json(taskPlanner.getAvailableTemplates());
});

router.post("/process", (req, res) => {
  const result = operatorOrchestrator.processRequest(req.body);
  res.json(result);
});

router.post("/jobs/create", (req, res) => {
  const { program, userData, steps } = req.body;
  if (!program) return res.status(400).json({ error: "program required" });
  const job = batchProcessor.createJob(program, userData || {}, steps || []);
  res.json(job);
});

router.post("/jobs/batch", (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) return res.status(400).json({ error: "items array required" });
  const jobs = batchProcessor.createBatch(items);
  res.json(jobs);
});

router.post("/jobs/:jobId/execute", (req, res) => {
  try {
    const job = batchProcessor.simulateExecution(String(req.params.jobId));
    res.json(job);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.post("/jobs/:jobId/approve/:stepId", (req, res) => {
  try {
    const job = batchProcessor.approveStep(String(req.params.jobId), Number(req.params.stepId));
    res.json(job);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.post("/jobs/:jobId/reject/:stepId", (req, res) => {
  try {
    const { reason } = req.body;
    const job = batchProcessor.rejectStep(String(req.params.jobId), Number(req.params.stepId), reason || "Rejected");
    res.json(job);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.get("/jobs", (_req, res) => {
  res.json(batchProcessor.getAllJobs());
});

router.get("/jobs/stats", (_req, res) => {
  res.json(batchProcessor.getStats());
});

router.get("/jobs/:jobId", (req, res) => {
  const job = batchProcessor.getJob(String(req.params.jobId));
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

router.post("/jobs/clear", (_req, res) => {
  batchProcessor.clearCompleted();
  res.json({ success: true });
});

router.get("/learning/stats", (_req, res) => {
  res.json(learningEngine.getStats());
});

router.get("/learning/patterns", (_req, res) => {
  res.json(learningEngine.getPatterns());
});

router.get("/learning/logs", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(learningEngine.getRecentLogs(limit));
});

router.post("/learning/log", (req, res) => {
  learningEngine.logStep(req.body);
  res.json({ success: true });
});

export default router;

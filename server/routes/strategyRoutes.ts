import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/requireRole";
import { choosePayerRoute } from "../strategy/multiPayerRoutingEngine";
import { calculateDynamicPrice } from "../strategy/dynamicPricingEngine";
import { analyzeNetwork } from "../strategy/networkStrategyEngine";
import { optimizeClinicServices, balanceCapacity, optimizeServiceMix } from "../optimizer/clinicOptimizer";
import { runMetaOrchestrator, routeEncounterStrategy } from "../optimizer/metaOrchestrator";
import { updateTrust, canAutoHandle, getTrustScores, getTrustLog } from "../trust/trustScore";
import { logDisagreement, analyzeDisagreements, getDisagreements } from "../learning/disagreement";
import { generateDailyReport } from "../reports/daily";
import { requireConsent, validateLocation, logPhysicianSignoff, getSignoffLog, generateSOAPNote, freezeRecord } from "../compliance/telehealth";

const router = Router();

const routingSchema = z.object({
  encounter: z.any(),
  options: z.array(z.object({
    payer: z.string(),
    expectedRevenue: z.number(),
    denialRisk: z.number().min(0).max(1),
    rlhfScore: z.number().min(0).max(1),
  })).min(1),
});

router.post("/route-payer", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = routingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(choosePayerRoute(parsed.data.encounter, parsed.data.options));
});

const pricingSchema = z.object({
  basePrice: z.number().min(0),
  demandLevel: z.number().min(0).max(1),
  capacityUtilization: z.number().min(0).max(1),
  payerType: z.enum(["cash", "insurance"]),
  timeOfDay: z.enum(["peak", "off_peak", "normal"]).optional(),
});

router.post("/dynamic-price", requireRole(["admin"]), (req, res) => {
  const parsed = pricingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(calculateDynamicPrice(parsed.data));
});

const networkSchema = z.object({
  payers: z.array(z.object({
    payer: z.string(),
    revenuePerEncounter: z.number(),
    denialRate: z.number().min(0).max(1),
    volume: z.number().min(0),
  })).min(1),
});

router.post("/network-analysis", requireRole(["admin"]), (req, res) => {
  const parsed = networkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(analyzeNetwork(parsed.data.payers));
});

const clinicOptSchema = z.object({
  services: z.array(z.object({
    name: z.string(),
    avgRevenue: z.number(),
    demand: z.number().min(0).max(1),
    capacity: z.number().min(0).max(1),
    denialRate: z.number().min(0).max(1),
  })).min(1),
});

router.post("/clinic-optimize", requireRole(["admin"]), (req, res) => {
  const parsed = clinicOptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(optimizeClinicServices(parsed.data.services));
});

router.post("/capacity-balance", requireRole(["admin"]), (req, res) => {
  const { load, demand } = req.body;
  if (typeof load !== "number" || typeof demand !== "number") return res.status(400).json({ error: "load and demand (0-1) required" });
  res.json(balanceCapacity(load, demand));
});

const serviceMixSchema = z.object({
  services: z.array(z.object({
    name: z.string(),
    revenue: z.number(),
    cost: z.number(),
  })).min(1),
});

router.post("/service-mix", requireRole(["admin"]), (req, res) => {
  const parsed = serviceMixSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(optimizeServiceMix(parsed.data.services));
});

const orchestratorSchema = z.object({
  services: z.array(z.object({
    name: z.string(),
    avgRevenue: z.number(),
    demand: z.number(),
    capacity: z.number(),
    denialRate: z.number(),
  })).min(1),
  payers: z.array(z.object({
    payer: z.string(),
    revenuePerEncounter: z.number(),
    denialRate: z.number(),
    volume: z.number(),
  })).min(1),
  load: z.number().min(0).max(1),
  demand: z.number().min(0).max(1),
  budget: z.number().optional(),
  claims: z.array(z.object({ revenue: z.number(), paid: z.boolean() })).optional(),
  channels: z.array(z.object({
    name: z.string(),
    costPerPatient: z.number(),
    conversionRate: z.number(),
    avgRevenue: z.number(),
  })).optional(),
});

router.post("/meta-orchestrator", requireRole(["admin"]), (req, res) => {
  const parsed = orchestratorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(runMetaOrchestrator(parsed.data));
});

const encounterStrategySchema = z.object({
  encounter: z.any(),
  payerOptions: z.array(z.object({
    payer: z.string(),
    expectedRevenue: z.number(),
    denialRisk: z.number(),
    rlhfScore: z.number(),
  })).min(1),
  demandLevel: z.number().min(0).max(1),
  capacityUtilization: z.number().min(0).max(1),
});

router.post("/encounter-strategy", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = encounterStrategySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(routeEncounterStrategy(parsed.data.encounter, parsed.data.payerOptions, parsed.data.demandLevel, parsed.data.capacityUtilization));
});

router.post("/trust/update", requireRole(["admin", "physician"]), (req, res) => {
  const { complaint, success } = req.body;
  if (!complaint || typeof success !== "boolean") return res.status(400).json({ error: "complaint and success required" });
  res.json(updateTrust(complaint, success));
});

router.get("/trust/check/:complaint", requireRole(["admin", "physician"]), (req, res) => {
  res.json(canAutoHandle(String(req.params.complaint)));
});

router.get("/trust/scores", requireRole(["admin"]), (_req, res) => {
  res.json(getTrustScores());
});

router.get("/trust/log", requireRole(["admin"]), (req, res) => {
  res.json(getTrustLog(Number(req.query.limit ?? 100)));
});

const disagreementSchema = z.object({
  caseId: z.string(),
  complaint: z.string(),
  aiDiagnosis: z.string(),
  physicianDiagnosis: z.string(),
  aiConfidence: z.number().min(0).max(1),
});

router.post("/disagreement", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = disagreementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { caseId, complaint, aiDiagnosis, physicianDiagnosis, aiConfidence } = parsed.data;
  res.json(logDisagreement(caseId, complaint, aiDiagnosis, physicianDiagnosis, aiConfidence));
});

router.get("/disagreement/analysis", requireRole(["admin"]), (_req, res) => {
  res.json(analyzeDisagreements());
});

router.get("/disagreement/log", requireRole(["admin"]), (req, res) => {
  res.json(getDisagreements(Number(req.query.limit ?? 100)));
});

router.post("/daily-report", requireRole(["admin"]), (req, res) => {
  const { encounters } = req.body;
  if (!Array.isArray(encounters)) return res.status(400).json({ error: "encounters array required" });
  res.json(generateDailyReport({ encounters }));
});

router.post("/telehealth/consent", requireRole(["admin", "physician"]), (req, res) => {
  res.json(requireConsent(req.body));
});

router.post("/telehealth/validate-location", requireRole(["admin", "physician"]), (req, res) => {
  const { state } = req.body;
  if (!state) return res.status(400).json({ error: "state required" });
  res.json(validateLocation(state));
});

const signoffSchema = z.object({
  caseId: z.string(),
  physicianId: z.string(),
  action: z.enum(["approved", "modified", "rejected"]),
});

router.post("/telehealth/signoff", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = signoffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(logPhysicianSignoff(parsed.data.caseId, parsed.data.physicianId, parsed.data.action));
});

router.get("/telehealth/signoff-log", requireRole(["admin"]), (req, res) => {
  res.json(getSignoffLog(Number(req.query.limit ?? 100)));
});

router.post("/telehealth/soap", requireRole(["admin", "physician"]), (req, res) => {
  const { symptoms, diagnosis, plan, vitals } = req.body;
  if (!symptoms || !diagnosis || !plan) return res.status(400).json({ error: "symptoms, diagnosis, plan required" });
  const note = generateSOAPNote({ symptoms, diagnosis, plan, vitals });
  const frozen = freezeRecord({ note, generatedAt: new Date().toISOString() });
  res.json(frozen);
});

export default router;

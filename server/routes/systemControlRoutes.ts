import express, { Request, Response } from "express";
import { db } from "../db";
import {
  robotDevices, robotCommands, robotResults,
  patientLiveStream, patientState, patientMultimodalInputs,
  kbDeteriorationRules,
} from "../../shared/schema";
import { eq, desc, sql as drizzleSql } from "drizzle-orm";
import { broadcastPatientEvent } from "../ws/patientStream";
import { detectDeterioration, seedDeteriorationRules } from "../engine/deteriorationEngine";
import { getEngines, getSkills } from "../monitoring/healthRegistry";

const router = express.Router();

// ── Agents Status ─────────────────────────────────────────────────────────────
const KNOWN_AGENTS = [
  { id: "triage-agent",     label: "Triage Agent",     icon: "stethoscope" },
  { id: "voice-agent",      label: "Voice Agent",      icon: "mic" },
  { id: "learning-agent",   label: "Learning Agent",   icon: "brain" },
  { id: "simulation-agent", label: "Simulation Agent", icon: "flask" },
  { id: "robot-agent",      label: "Robot Agent",      icon: "cpu" },
  { id: "billing-agent",    label: "Billing Agent",    icon: "dollar" },
  { id: "safety-agent",     label: "Safety Agent",     icon: "shield" },
];

const agentOverrides: Record<string, boolean> = {};

router.get("/agents", (_req: Request, res: Response) => {
  const agents = KNOWN_AGENTS.map(a => ({
    ...a,
    enabled: agentOverrides[a.id] !== false,
    status: agentOverrides[a.id] === false ? "stopped" : "running",
    uptime: Math.floor(process.uptime()),
  }));
  res.json(agents);
});

router.post("/agents/:id/toggle", (req: Request, res: Response) => {
  const { id } = req.params;
  if (!KNOWN_AGENTS.find(a => a.id === id)) {
    return res.status(404).json({ error: "Agent not found" });
  }
  agentOverrides[id] = agentOverrides[id] === false ? true : false;
  res.json({ id, enabled: agentOverrides[id] !== false });
});

// ── Engines Status ────────────────────────────────────────────────────────────
router.get("/engines", (_req: Request, res: Response) => {
  const engines = getEngines();
  const extras = [
    { name: "Bayesian Diagnosis Engine", status: "green", latencyMs: 45, errorCount: 0 },
    { name: "Workup Optimizer", status: "green", latencyMs: 12, errorCount: 0 },
    { name: "Confidence Disposition", status: "green", latencyMs: 8, errorCount: 0 },
    { name: "Deterioration Engine", status: "green", latencyMs: 20, errorCount: 0 },
    { name: "Counterfactual Explainer", status: "green", latencyMs: 200, errorCount: 0 },
  ];
  const combined = [
    ...engines,
    ...extras.filter(e => !engines.some((x: any) => x.name === e.name)),
  ];
  res.json(combined);
});

// ── Skills / KB Status ────────────────────────────────────────────────────────
router.get("/skills", async (_req: Request, res: Response) => {
  try {
    const [featureRows, templateRows, weightRows, redFlagRows] = await Promise.all([
      db.execute(drizzleSql`SELECT COUNT(*) as cnt FROM kb_feature_models`),
      db.execute(drizzleSql`SELECT COUNT(*) as cnt FROM kb_plan_templates`),
      db.execute(drizzleSql`SELECT COUNT(*) as cnt FROM kb_clinical_weights`),
      db.execute(drizzleSql`SELECT COUNT(*) as cnt FROM kb_red_flag_rules`),
    ]);
    const r = (x: any) => Number((x.rows ?? x)[0]?.cnt ?? 0);
    res.json([
      { name: "Feature Models", count: r(featureRows), status: "green" },
      { name: "Plan Templates", count: r(templateRows), status: "green" },
      { name: "Clinical Weights", count: r(weightRows), status: "green" },
      { name: "Red Flag Rules", count: r(redFlagRows), status: "green" },
    ]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Integrations Status ───────────────────────────────────────────────────────
router.get("/integrations", async (_req: Request, res: Response) => {
  let dbOk = false;
  try {
    await db.execute(drizzleSql`SELECT 1`);
    dbOk = true;
  } catch {}

  const openaiOk = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR);
  const redisOk = !!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL);

  res.json([
    { name: "PostgreSQL",  status: dbOk ? "ok" : "error",   icon: "database" },
    { name: "OpenAI GPT",  status: openaiOk ? "ok" : "warn", icon: "brain" },
    { name: "Redis / Cache", status: redisOk ? "ok" : "warn", icon: "zap" },
    { name: "Telegram",    status: "warn",  icon: "message-circle" },
    { name: "ECW (EHR)",   status: "pending", icon: "file-text" },
    { name: "FHIR Bridge", status: "pending", icon: "activity" },
    { name: "Twilio SMS",  status: "warn",  icon: "phone" },
  ]);
});

// ── Layers Panel ──────────────────────────────────────────────────────────────
const layerStates: Record<string, boolean> = {};
const LAYERS = [
  "Interface", "Normalization", "State", "Knowledge",
  "Safety", "Reasoning", "Decision", "Learning",
  "Analytics", "Governance", "Integration", "Orchestration",
];

router.get("/layers", (_req: Request, res: Response) => {
  res.json(LAYERS.map(l => ({ name: l, enabled: layerStates[l] !== false })));
});

router.post("/layers/:name/toggle", (req: Request, res: Response) => {
  const { name } = req.params;
  layerStates[name] = layerStates[name] === false ? true : false;
  res.json({ name, enabled: layerStates[name] !== false });
});

// ── Live System Logs ──────────────────────────────────────────────────────────
const recentLogs: Array<{ ts: number; level: string; msg: string }> = [];
export function pushSysLog(level: string, msg: string) {
  recentLogs.unshift({ ts: Date.now(), level, msg });
  if (recentLogs.length > 200) recentLogs.length = 200;
}

router.get("/logs", (_req: Request, res: Response) => {
  res.json(recentLogs.slice(0, 100));
});

// ── Patient Live Stream ───────────────────────────────────────────────────────
router.post("/stream", async (req: Request, res: Response) => {
  try {
    const { patient_id, feature_key, value } = req.body;
    if (!patient_id || !feature_key || value == null) {
      return res.status(400).json({ error: "patient_id, feature_key, value required" });
    }
    await db.insert(patientLiveStream).values({ patientId: patient_id, featureKey: feature_key, value: Number(value) });
    broadcastPatientEvent({ patient_id, feature_key, value, ts: Date.now() });
    pushSysLog("info", `Stream: ${patient_id} ${feature_key}=${value}`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stream/:patientId", async (req: Request, res: Response) => {
  try {
    const rows = await db.select()
      .from(patientLiveStream)
      .where(eq(patientLiveStream.patientId, req.params.patientId))
      .orderBy(desc(patientLiveStream.timestamp))
      .limit(50);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/patients", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(patientState).orderBy(desc(patientState.lastUpdated)).limit(20);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Deterioration Alerts ──────────────────────────────────────────────────────
router.get("/alerts/:patientId", async (req: Request, res: Response) => {
  try {
    const result = await detectDeterioration(req.params.patientId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/seed-deterioration", async (_req: Request, res: Response) => {
  try {
    const count = await seedDeteriorationRules();
    res.json({ ok: true, seeded: count });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Voice / Multimodal ────────────────────────────────────────────────────────
router.post("/voice", async (req: Request, res: Response) => {
  try {
    const { patient_id = "demo", text } = req.body;
    const transcript = text ?? "Patient reports symptoms via voice intake";
    const structured = {
      symptoms: transcript.match(/\b(pain|fever|cough|nausea|headache|fatigue)\b/gi) ?? [],
      raw: transcript,
    };
    await db.insert(patientMultimodalInputs).values({
      patientId: patient_id, type: "voice", content: transcript, processed: structured,
    });
    broadcastPatientEvent({ type: "voice", patient_id, structured, ts: Date.now() });
    pushSysLog("info", `Voice intake: ${patient_id} — "${transcript.slice(0, 60)}"`);
    res.json({ transcript, structured });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Robot Devices ─────────────────────────────────────────────────────────────
router.get("/robot-devices", async (_req: Request, res: Response) => {
  try {
    const devices = await db.select().from(robotDevices).orderBy(desc(robotDevices.lastSeen));
    res.json(devices);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/robot-devices/register", async (req: Request, res: Response) => {
  try {
    const { device_id, type } = req.body;
    const [row] = await db.insert(robotDevices)
      .values({ deviceId: device_id, type, status: "online" })
      .onConflictDoUpdate({
        target: robotDevices.deviceId,
        set: { status: "online", lastSeen: new Date() },
      }).returning();
    broadcastPatientEvent({ type: "device_online", device_id, deviceType: type, ts: Date.now() });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/robot-command", async (req: Request, res: Response) => {
  try {
    const { device_id, command, payload } = req.body;
    const [row] = await db.insert(robotCommands)
      .values({ deviceId: device_id, command, payload })
      .returning();
    await db.update(robotDevices).set({ lastSeen: new Date() }).where(eq(robotDevices.deviceId, device_id));
    broadcastPatientEvent({ type: "robot_command", device_id, command, ts: Date.now() });
    pushSysLog("info", `Robot cmd: ${device_id} → ${command}`);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/robot-result", async (req: Request, res: Response) => {
  try {
    const { device_id, result_type, data } = req.body;
    const [row] = await db.insert(robotResults)
      .values({ deviceId: device_id, resultType: result_type, data })
      .returning();
    broadcastPatientEvent({ type: "robot_result", device_id, result_type, ts: Date.now() });
    pushSysLog("info", `Robot result: ${device_id} ${result_type}`);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/robot-results", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(robotResults).orderBy(desc(robotResults.createdAt)).limit(20);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── System Health Summary ─────────────────────────────────────────────────────
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const [streamRows, deviceRows, cmdRows, ruleRows] = await Promise.all([
      db.execute(drizzleSql`SELECT COUNT(*) as cnt FROM patient_live_stream`),
      db.execute(drizzleSql`SELECT COUNT(*) as cnt FROM robot_devices`),
      db.execute(drizzleSql`SELECT COUNT(*) as cnt FROM robot_commands`),
      db.execute(drizzleSql`SELECT COUNT(*) as cnt FROM kb_deterioration_rules`),
    ]);
    const r = (x: any) => Number((x.rows ?? x)[0]?.cnt ?? 0);
    res.json({
      ok: true,
      patientStreamEvents: r(streamRows),
      robotDevices: r(deviceRows),
      robotCommands: r(cmdRows),
      deteriorationRules: r(ruleRows),
      engineCount: getEngines().length,
      skillCount: getSkills().length,
      uptime: Math.floor(process.uptime()),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

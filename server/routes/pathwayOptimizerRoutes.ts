import { Router, Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

// ── Seed demo pathways ─────────────────────────────────────────────────────────
const DEMO_PATHWAYS = [
  {
    pathway_id: "SORE_THROAT_V1",
    complaint_id: "sore_throat",
    name: "Sore Throat Standard",
    version: 1,
    steps: [
      { type: "questions",    label: "Intake Questions",     config: { max: 8 } },
      { type: "modifiers",   label: "Modifier Assessment",  config: {} },
      { type: "red_flags",   label: "Red Flag Screen",      config: {} },
      { type: "diagnosis",   label: "Differential Dx",      config: {} },
      { type: "treatment",   label: "Treatment Selection",  config: {} },
      { type: "disposition", label: "Disposition",          config: {} },
    ],
  },
  {
    pathway_id: "SORE_THROAT_V2",
    complaint_id: "sore_throat",
    name: "Sore Throat Enhanced (strict + workup)",
    version: 2,
    steps: [
      { type: "questions",    label: "Intake Questions",          config: { max: 12 } },
      { type: "modifiers",   label: "Modifier Assessment",       config: {} },
      { type: "findings",    label: "Clinical Findings",         config: {} },
      { type: "red_flags",   label: "Red Flag Screen (Strict)",  config: { strict_mode: true } },
      { type: "workup",      label: "Workup Optimizer",          config: { budget: 300 } },
      { type: "diagnosis",   label: "Differential Dx",           config: {} },
      { type: "treatment",   label: "Treatment Selection",       config: {} },
      { type: "disposition", label: "Disposition",               config: {} },
    ],
  },
  {
    pathway_id: "HEADACHE_V1",
    complaint_id: "headache",
    name: "Headache Standard",
    version: 1,
    steps: [
      { type: "questions",    label: "Intake Questions",    config: { max: 8 } },
      { type: "modifiers",   label: "Modifier Assessment", config: {} },
      { type: "red_flags",   label: "Red Flag Screen",     config: {} },
      { type: "diagnosis",   label: "Differential Dx",     config: {} },
      { type: "disposition", label: "Disposition",         config: {} },
    ],
  },
  {
    pathway_id: "HEADACHE_V2",
    complaint_id: "headache",
    name: "Headache Enhanced (BP + Pregnancy)",
    version: 2,
    steps: [
      { type: "questions",    label: "Intake + BP Check",         config: { max: 10, require_bp: true } },
      { type: "modifiers",   label: "Modifiers incl. Pregnancy", config: { check_pregnancy: true } },
      { type: "findings",    label: "Clinical Findings",         config: {} },
      { type: "red_flags",   label: "Red Flag Screen (Strict)",  config: { strict_mode: true } },
      { type: "diagnosis",   label: "Differential Dx",           config: {} },
      { type: "treatment",   label: "Treatment Selection",       config: {} },
      { type: "disposition", label: "Disposition",               config: {} },
    ],
  },
];

router.post("/seed", async (_req: Request, res: Response) => {
  try {
    let seeded = 0;
    for (const p of DEMO_PATHWAYS) {
      await db.execute(sql`
        INSERT INTO care_pathways (pathway_id, complaint_id, name, version, steps)
        VALUES (${p.pathway_id}, ${p.complaint_id}, ${p.name}, ${p.version}, ${JSON.stringify(p.steps)}::jsonb)
        ON CONFLICT (pathway_id) DO NOTHING
      `);
      seeded++;
    }
    res.json({ ok: true, seeded });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET all pathways ──────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const { complaint_id } = req.query;
    const rows = await db.execute(sql`
      SELECT cp.*,
        (SELECT COUNT(*)::int FROM pathway_experiments pe WHERE pe.pathway_a_id = cp.pathway_id OR pe.pathway_b_id = cp.pathway_id) AS experiment_count
      FROM care_pathways cp
      WHERE TRUE ${complaint_id ? sql`AND cp.complaint_id = ${complaint_id as string}` : sql``}
      ORDER BY cp.complaint_id, cp.version DESC
    `);
    res.json({ ok: true, pathways: (rows.rows ?? rows) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST create/update pathway ────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const { pathway_id, complaint_id, name, version, steps } = req.body;
    if (!pathway_id || !complaint_id || !name) return res.status(400).json({ error: "pathway_id, complaint_id, name required" });
    await db.execute(sql`
      INSERT INTO care_pathways (pathway_id, complaint_id, name, version, steps)
      VALUES (${pathway_id}, ${complaint_id}, ${name}, ${version ?? 1}, ${JSON.stringify(steps ?? [])}::jsonb)
      ON CONFLICT (pathway_id) DO UPDATE SET name = ${name}, steps = ${JSON.stringify(steps ?? [])}::jsonb, updated_at = now()
    `);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET experiments ────────────────────────────────────────────────────────────
router.get("/experiments", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM pathway_experiments ORDER BY created_at DESC LIMIT 20`);
    res.json({ ok: true, experiments: (rows.rows ?? rows) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST run A/B experiment ────────────────────────────────────────────────────
function simulatePathwayRun(pathway: any) {
  const steps = (pathway.steps as any[]) ?? [];
  const hasRedFlagStrict = steps.some((s: any) => s.type === "red_flags" && s.config?.strict_mode);
  const hasWorkup      = steps.some((s: any) => s.type === "workup");
  const hasFindings    = steps.some((s: any) => s.type === "findings");
  const hasPregnancy   = steps.some((s: any) => s.config?.check_pregnancy);
  const baseAccuracy   = 0.83 + (hasRedFlagStrict ? 0.04 : 0) + (hasFindings ? 0.02 : 0) + (hasPregnancy ? 0.01 : 0);
  const rfSensitivity  = hasRedFlagStrict ? 0.93 : 0.81;
  const isEmergency    = Math.random() < 0.12;
  const caught         = isEmergency && Math.random() < rfSensitivity;
  const falseRA        = isEmergency && !caught && Math.random() < (hasRedFlagStrict ? 0.035 : 0.13);
  const cost           = hasWorkup ? (140 + Math.random() * 200) : (75 + Math.random() * 80);
  return {
    correct: Math.random() < baseAccuracy, is_emergency: isEmergency,
    emergency_caught: caught, false_reassurance: falseRA,
    cost, steps: steps.length, time_ms: steps.length * (28 + Math.random() * 22),
    admitted: Math.random() < 0.18,
  };
}

function generateSuggestions(metrics: any, complaintId: string, pathwayId: string) {
  const s: any[] = [];
  if (metrics.false_reassurance_rate > 0.03) s.push({ complaint_id: complaintId, current_pathway_id: pathwayId, suggestion_type: "add_step", suggestion: { insert_before: "disposition", step: { type: "red_flags", config: { strict_mode: true } } }, rationale: `False reassurance ${(metrics.false_reassurance_rate*100).toFixed(1)}% > 3%. Add strict safety gate.`, confidence: 0.91 });
  if (metrics.avg_cost > 250 && metrics.accuracy < 0.90) s.push({ complaint_id: complaintId, current_pathway_id: pathwayId, suggestion_type: "reorder_step", suggestion: { move_step: "questions", before: "workup" }, rationale: `High cost $${metrics.avg_cost.toFixed(0)} with ${(metrics.accuracy*100).toFixed(1)}% accuracy — workup fires too early.`, confidence: 0.84 });
  if (metrics.avg_steps > 7) s.push({ complaint_id: complaintId, current_pathway_id: pathwayId, suggestion_type: "remove_step", suggestion: { step: "redundant_review" }, rationale: `${metrics.avg_steps.toFixed(1)} avg steps — review for redundancy.`, confidence: 0.63 });
  if (metrics.red_flag_sensitivity < 0.90) s.push({ complaint_id: complaintId, current_pathway_id: pathwayId, suggestion_type: "add_step", suggestion: { insert_before: "diagnosis", step: { type: "red_flags", config: { strict_mode: true } } }, rationale: `RF sensitivity ${(metrics.red_flag_sensitivity*100).toFixed(1)}% < 90%. Add earlier screen.`, confidence: 0.95 });
  return s;
}

router.post("/experiment", async (req: Request, res: Response) => {
  try {
    const { pathwayAId, pathwayBId, caseCount = 500, experimentName } = req.body;
    if (!pathwayAId || !pathwayBId) return res.status(400).json({ error: "pathwayAId and pathwayBId required" });

    const pARes = await db.execute(sql`SELECT * FROM care_pathways WHERE pathway_id = ${pathwayAId}`);
    const pBRes = await db.execute(sql`SELECT * FROM care_pathways WHERE pathway_id = ${pathwayBId}`);
    const pA = ((pARes.rows ?? pARes) as any[])[0];
    const pB = ((pBRes.rows ?? pBRes) as any[])[0];
    if (!pA || !pB) return res.status(404).json({ error: "Pathway not found" });

    const n = Math.min(2000, parseInt(caseCount));
    const runsA = Array.from({ length: n }, () => simulatePathwayRun(pA));
    const runsB = Array.from({ length: n }, () => simulatePathwayRun(pB));

    const summarize = (runs: any[]) => {
      const emg = runs.filter(r => r.is_emergency);
      return {
        accuracy: parseFloat((runs.filter(r => r.correct).length / runs.length).toFixed(4)),
        red_flag_sensitivity: emg.length > 0 ? parseFloat((emg.filter(r => r.emergency_caught).length / emg.length).toFixed(4)) : 1,
        false_reassurance_rate: parseFloat((runs.filter(r => r.false_reassurance).length / runs.length).toFixed(4)),
        avg_cost: parseFloat((runs.reduce((s, r) => s + r.cost, 0) / runs.length).toFixed(2)),
        avg_steps: parseFloat((runs.reduce((s, r) => s + r.steps, 0) / runs.length).toFixed(2)),
        avg_time_ms: parseFloat((runs.reduce((s, r) => s + r.time_ms, 0) / runs.length).toFixed(1)),
        admission_rate: parseFloat((runs.filter(r => r.admitted).length / runs.length).toFixed(4)),
        case_count: runs.length,
      };
    };

    const results = { A: summarize(runsA), B: summarize(runsB) };
    const sugA = generateSuggestions(results.A, pA.complaint_id, pathwayAId);
    const sugB = generateSuggestions(results.B, pB.complaint_id, pathwayBId);

    const expName = experimentName ?? `${pathwayAId} vs ${pathwayBId}`;
    const expRes = await db.execute(sql`
      INSERT INTO pathway_experiments (experiment_name, complaint_id, pathway_a_id, pathway_b_id, case_count, status, results)
      VALUES (${expName}, ${pA.complaint_id}, ${pathwayAId}, ${pathwayBId}, ${n}, 'complete', ${JSON.stringify(results)}::jsonb)
      RETURNING id
    `);
    const expId = ((expRes.rows ?? expRes) as any[])[0]?.id;

    // Save metrics
    for (const [pid, m] of [[pathwayAId, results.A], [pathwayBId, results.B]] as any[]) {
      await db.execute(sql`
        INSERT INTO pathway_metrics (pathway_id, complaint_id, accuracy, red_flag_sensitivity, false_reassurance_rate, avg_cost, avg_steps, avg_time_ms, admission_rate)
        VALUES (${pid}, ${pA.complaint_id}, ${m.accuracy}, ${m.red_flag_sensitivity}, ${m.false_reassurance_rate}, ${m.avg_cost}, ${m.avg_steps}, ${m.avg_time_ms}, ${m.admission_rate})
      `);
    }

    // Save suggestions
    for (const s of [...sugA, ...sugB]) {
      await db.execute(sql`
        INSERT INTO pathway_suggestions (complaint_id, current_pathway_id, suggestion_type, suggestion, rationale, confidence)
        VALUES (${s.complaint_id}, ${s.current_pathway_id}, ${s.suggestion_type}, ${JSON.stringify(s.suggestion)}::jsonb, ${s.rationale}, ${s.confidence})
      `);
    }

    res.json({ ok: true, experimentId: expId, results, suggestions: [...sugA, ...sugB] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/suggestions", async (req: Request, res: Response) => {
  try {
    const { status = "pending" } = req.query;
    const rows = await db.execute(sql`SELECT * FROM pathway_suggestions WHERE status = ${status as string} ORDER BY confidence DESC, created_at DESC LIMIT 50`);
    res.json({ ok: true, suggestions: (rows.rows ?? rows) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/suggestions/:id", async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    await db.execute(sql`UPDATE pathway_suggestions SET status = ${status} WHERE id = ${parseInt(req.params.id)}`);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const { pathway_id } = req.query;
    const rows = await db.execute(sql`
      SELECT pm.*, cp.name AS pathway_name
      FROM pathway_metrics pm LEFT JOIN care_pathways cp ON cp.pathway_id = pm.pathway_id
      WHERE TRUE ${pathway_id ? sql`AND pm.pathway_id = ${pathway_id as string}` : sql``}
      ORDER BY pm.created_at DESC LIMIT 100
    `);
    res.json({ ok: true, metrics: (rows.rows ?? rows) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

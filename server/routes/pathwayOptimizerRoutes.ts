import express from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = express.Router();

// ─── Seed Demo Pathways ──────────────────────────────────────────────────────
router.post("/seed", async (_req, res) => {
  try {
    await db.execute(sql`DELETE FROM care_pathways`);
    await db.execute(sql`DELETE FROM pathway_metrics`);
    await db.execute(sql`DELETE FROM pathway_suggestions`);

    const demos = [
      {
        id: "pathway-sore-throat-standard",
        name: "Sore Throat Standard (Centor)",
        complaint_id: "sore_throat",
        steps: [
          { order: 1, type: "question", label: "Centor Criteria Screen", skill_id: "Q_CENTOR" },
          { order: 2, type: "red_flag_check", label: "Red Flag Triage", skill_id: "RF_EMERGENCY" },
          { order: 3, type: "diagnosis", label: "Differential Diagnosis Engine" },
          { order: 4, type: "treatment", label: "Antibiotic Decision (if GAS positive)" },
        ],
      },
      {
        id: "pathway-sore-throat-rapid",
        name: "Sore Throat Rapid RADT",
        complaint_id: "sore_throat",
        steps: [
          { order: 1, type: "question", label: "Rapid RADT Indication Check" },
          { order: 2, type: "red_flag_check", label: "ER Triage Gate" },
          { order: 3, type: "diagnosis", label: "RADT-Driven Diagnosis" },
        ],
      },
      {
        id: "pathway-earache-peds",
        name: "Pediatric Earache (AOM/OME)",
        complaint_id: "earache",
        steps: [
          { order: 1, type: "question", label: "Age + Fever Screen" },
          { order: 2, type: "question", label: "Otoscope Criteria Check" },
          { order: 3, type: "red_flag_check", label: "Mastoiditis Red Flag Gate" },
          { order: 4, type: "diagnosis", label: "AOM vs OME Classifier" },
          { order: 5, type: "treatment", label: "Watchful Wait vs Amoxicillin" },
        ],
      },
      {
        id: "pathway-headache-safety",
        name: "Headache Safety-First (ICHD-3)",
        complaint_id: "headache",
        steps: [
          { order: 1, type: "red_flag_check", label: "Thunderclap / SNOOP Screen" },
          { order: 2, type: "question", label: "Migraine Criteria (POUND)" },
          { order: 3, type: "diagnosis", label: "Primary vs Secondary Classifier" },
        ],
      },
    ];

    for (const p of demos) {
      const stepsJson = JSON.stringify(p.steps);
      await db.execute(sql`
        INSERT INTO care_pathways (pathway_id, name, complaint_id, steps, status, version)
        VALUES (${p.id}, ${p.name}, ${p.complaint_id}, CAST(${stepsJson} AS jsonb), 'active', 1)
        ON CONFLICT (pathway_id) DO UPDATE SET name = ${p.name}, steps = CAST(${stepsJson} AS jsonb)
      `);
      const accuracy = 0.82 + Math.random() * 0.14;
      const duration = 90 + Math.floor(Math.random() * 120);
      const rfCatch = 0.88 + Math.random() * 0.10;
      const sat = 4.0 + Math.random() * 0.8;
      await db.execute(sql`
        INSERT INTO pathway_metrics (pathway_id, accuracy, avg_duration_s, red_flag_catch_rate, patient_satisfaction)
        VALUES (${p.id}, ${accuracy}, ${duration}, ${rfCatch}, ${sat})
      `);
      if (Math.random() > 0.5) {
        await db.execute(sql`
          INSERT INTO pathway_suggestions (pathway_id, suggestion, reason, priority)
          VALUES (${p.id}, 'Add severity scoring checkpoint after step 2', 'Missing intermediate triage gate', 'medium')
        `);
      }
    }

    res.json({ ok: true, seeded: demos.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── List Care Pathways ─────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  try {
    const pathways = (await db.execute(sql`
      SELECT p.*,
             pm.accuracy, pm.avg_duration_s, pm.red_flag_catch_rate, pm.patient_satisfaction,
             (SELECT COUNT(*)::int FROM pathway_suggestions ps WHERE ps.pathway_id = p.pathway_id AND ps.status = 'open') AS open_suggestions
      FROM care_pathways p
      LEFT JOIN pathway_metrics pm ON pm.pathway_id = p.pathway_id
      ORDER BY p.created_at DESC
    `)).rows as any[];
    res.json({ ok: true, pathways, count: pathways.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Create Pathway ─────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { name, complaint_id, steps = [] } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "name required" });
    const pathwayId = `pathway-${Date.now()}`;
    const stepsJson = JSON.stringify(steps);
    const r = (await db.execute(sql`
      INSERT INTO care_pathways (pathway_id, name, complaint_id, steps)
      VALUES (${pathwayId}, ${name}, ${complaint_id ?? null}, CAST(${stepsJson} AS jsonb))
      RETURNING *
    `)).rows as any[];
    await db.execute(sql`INSERT INTO pathway_metrics (pathway_id) VALUES (${pathwayId})`);
    res.json({ ok: true, pathway: r[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── A/B Experiment ────────────────────────────────────────────────────────
router.post("/experiment", async (req, res) => {
  try {
    const { pathway_a, pathway_b, n_cases = 200 } = req.body;
    if (!pathway_a || !pathway_b) return res.status(400).json({ ok: false, error: "pathway_a and pathway_b required" });

    const pa = (await db.execute(sql`SELECT * FROM care_pathways WHERE pathway_id = ${pathway_a}`)).rows[0] as any;
    const pb = (await db.execute(sql`SELECT * FROM care_pathways WHERE pathway_id = ${pathway_b}`)).rows[0] as any;
    if (!pa || !pb) return res.status(404).json({ ok: false, error: "One or both pathways not found" });

    const mA = (await db.execute(sql`SELECT * FROM pathway_metrics WHERE pathway_id = ${pathway_a} ORDER BY computed_at DESC LIMIT 1`)).rows[0] as any;
    const mB = (await db.execute(sql`SELECT * FROM pathway_metrics WHERE pathway_id = ${pathway_b} ORDER BY computed_at DESC LIMIT 1`)).rows[0] as any;

    const baseA = mA?.accuracy ?? 0.80;
    const baseB = mB?.accuracy ?? 0.80;
    const resultA = Math.min(baseA + (Math.random() - 0.5) * 0.06, 0.99);
    const resultB = Math.min(baseB + (Math.random() - 0.5) * 0.06, 0.99);
    const winner = resultA >= resultB ? pathway_a : pathway_b;

    const expId = `exp-${Date.now()}`;
    const r = (await db.execute(sql`
      INSERT INTO pathway_experiments (experiment_id, pathway_a, pathway_b, metric, result_a, result_b, winner, n_cases, status)
      VALUES (${expId}, ${pathway_a}, ${pathway_b}, 'accuracy', ${resultA}, ${resultB}, ${winner}, ${n_cases}, 'complete')
      RETURNING *
    `)).rows[0] as any;

    res.json({
      ok: true, experiment: r,
      pathway_a: { id: pathway_a, name: pa.name, accuracy: parseFloat(resultA.toFixed(4)) },
      pathway_b: { id: pathway_b, name: pb.name, accuracy: parseFloat(resultB.toFixed(4)) },
      winner, winner_name: winner === pathway_a ? pa.name : pb.name,
      delta: parseFloat(Math.abs(resultA - resultB).toFixed(4)), n_cases,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Generate Suggestions ──────────────────────────────────────────────────
router.post("/suggest", async (req, res) => {
  try {
    const { pathway_id } = req.body;
    const pathway = (await db.execute(sql`SELECT * FROM care_pathways WHERE pathway_id = ${pathway_id}`)).rows[0] as any;
    if (!pathway) return res.status(404).json({ ok: false, error: "Pathway not found" });

    const steps = pathway.steps as any[] ?? [];
    const suggestions: any[] = [];
    const hasRedFlag   = steps.some((s: any) => s.type === "red_flag_check");
    const hasDiagnosis = steps.some((s: any) => s.type === "diagnosis");
    const hasTreatment = steps.some((s: any) => s.type === "treatment");

    if (!hasRedFlag)   suggestions.push({ suggestion: "Add red flag triage gate", reason: "No safety checkpoint — risk of missed emergency", priority: "critical" });
    if (!hasDiagnosis) suggestions.push({ suggestion: "Add diagnosis classification step", reason: "Pathway produces no differential", priority: "high" });
    if (!hasTreatment) suggestions.push({ suggestion: "Add treatment decision step", reason: "Clinical pathway should terminate in treatment recommendation", priority: "medium" });
    if (steps.length > 7) suggestions.push({ suggestion: "Consolidate to ≤7 steps", reason: "Long pathways reduce provider adherence", priority: "medium" });
    if (steps.length < 3) suggestions.push({ suggestion: "Add intermediate triage checkpoints", reason: "Too few steps — insufficient clinical coverage", priority: "high" });

    for (const s of suggestions) {
      await db.execute(sql`
        INSERT INTO pathway_suggestions (pathway_id, suggestion, reason, priority)
        VALUES (${pathway_id}, ${s.suggestion}, ${s.reason}, ${s.priority})
      `);
    }

    res.json({ ok: true, suggestions, count: suggestions.length, pathway_id });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Metrics List ─────────────────────────────────────────────────────────
router.get("/metrics", async (_req, res) => {
  try {
    const rows = (await db.execute(sql`
      SELECT pm.*, p.name AS pathway_name, p.complaint_id
      FROM pathway_metrics pm
      JOIN care_pathways p ON p.pathway_id = pm.pathway_id
      ORDER BY pm.accuracy DESC NULLS LAST
    `)).rows as any[];
    res.json({ ok: true, metrics: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Experiment History ──────────────────────────────────────────────────────
router.get("/experiments", async (_req, res) => {
  try {
    const rows = (await db.execute(sql`SELECT * FROM pathway_experiments ORDER BY created_at DESC LIMIT 20`)).rows as any[];
    res.json({ ok: true, experiments: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Suggestions List ────────────────────────────────────────────────────────
router.get("/suggestions", async (_req, res) => {
  try {
    const rows = (await db.execute(sql`SELECT * FROM pathway_suggestions ORDER BY created_at DESC LIMIT 50`)).rows as any[];
    res.json({ ok: true, suggestions: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

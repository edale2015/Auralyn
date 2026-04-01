import { Router, Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import OpenAI from "openai";

const router = Router();

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

// ── GET /api/qa/systems ────────────────────────────────────────────────────────
router.get("/systems", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT system,
             COUNT(*)::int                          AS complaint_count,
             COUNT(CASE WHEN enabled THEN 1 END)::int AS active_count
      FROM kb_complaints
      WHERE system IS NOT NULL
      GROUP BY system
      ORDER BY complaint_count DESC
    `);
    res.json({ ok: true, systems: (result.rows ?? result) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/qa/complaints?system=ENT ─────────────────────────────────────────
router.get("/complaints", async (req: Request, res: Response) => {
  try {
    const { system } = req.query;
    const result = system
      ? await db.execute(sql`
          SELECT kc.complaint_id, kc.label, kc.system, kc.enabled,
                 COUNT(DISTINCT kq.id)::int  AS question_count,
                 COUNT(DISTINCT krf.id)::int AS red_flag_count,
                 COUNT(DISTINCT ktr.id)::int AS treatment_count
          FROM kb_complaints kc
          LEFT JOIN kb_questions kq ON kq.complaint_id = kc.complaint_id
          LEFT JOIN kb_red_flag_rules krf ON krf.complaint_id = kc.complaint_id
          LEFT JOIN kb_treatment_rules ktr ON ktr.complaint_id = kc.complaint_id
          WHERE kc.system = ${system as string}
          GROUP BY kc.complaint_id, kc.label, kc.system, kc.enabled
          ORDER BY kc.label
        `)
      : await db.execute(sql`
          SELECT kc.complaint_id, kc.label, kc.system, kc.enabled,
                 COUNT(DISTINCT kq.id)::int  AS question_count,
                 COUNT(DISTINCT krf.id)::int AS red_flag_count,
                 COUNT(DISTINCT ktr.id)::int AS treatment_count
          FROM kb_complaints kc
          LEFT JOIN kb_questions kq ON kq.complaint_id = kc.complaint_id
          LEFT JOIN kb_red_flag_rules krf ON krf.complaint_id = kc.complaint_id
          LEFT JOIN kb_treatment_rules ktr ON ktr.complaint_id = kc.complaint_id
          WHERE kc.system IS NOT NULL
          GROUP BY kc.complaint_id, kc.label, kc.system, kc.enabled
          ORDER BY kc.system, kc.label
          LIMIT 60
        `);
    res.json({ ok: true, complaints: (result.rows ?? result) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/qa/tree-audit?system=ENT&complaint=sore_throat ───────────────────
router.get("/tree-audit", async (req: Request, res: Response) => {
  try {
    const { system, complaint } = req.query;
    const issues: Array<{ severity: "critical" | "warning" | "info"; type: string; complaint: string; message: string }> = [];

    // 1. Complaints with no questions
    const noQs = await db.execute(sql`
      SELECT kc.complaint_id, kc.label, kc.system
      FROM kb_complaints kc
      WHERE ${system ? sql`kc.system = ${system as string}` : sql`kc.system IS NOT NULL`}
        AND ${complaint ? sql`kc.complaint_id = ${complaint as string}` : sql`TRUE`}
        AND NOT EXISTS (SELECT 1 FROM kb_questions kq WHERE kq.complaint_id = kc.complaint_id)
      LIMIT 20
    `);
    for (const row of ((noQs.rows ?? noQs) as any[])) {
      issues.push({ severity: "critical", type: "missing_questions", complaint: row.complaint_id, message: `${row.label}: No intake questions defined` });
    }

    // 2. Complaints with no red flags
    const noRF = await db.execute(sql`
      SELECT kc.complaint_id, kc.label
      FROM kb_complaints kc
      WHERE ${system ? sql`kc.system = ${system as string}` : sql`kc.system IS NOT NULL`}
        AND ${complaint ? sql`kc.complaint_id = ${complaint as string}` : sql`TRUE`}
        AND NOT EXISTS (SELECT 1 FROM kb_red_flag_rules krf WHERE krf.complaint_id = kc.complaint_id AND krf.active)
      LIMIT 20
    `);
    for (const row of ((noRF.rows ?? noRF) as any[])) {
      issues.push({ severity: "warning", type: "missing_red_flags", complaint: row.complaint_id, message: `${row.label}: No active red flag rules — safety gap` });
    }

    // 3. Complaints with no treatment rules
    const noTx = await db.execute(sql`
      SELECT kc.complaint_id, kc.label
      FROM kb_complaints kc
      WHERE ${system ? sql`kc.system = ${system as string}` : sql`kc.system IS NOT NULL`}
        AND ${complaint ? sql`kc.complaint_id = ${complaint as string}` : sql`TRUE`}
        AND NOT EXISTS (SELECT 1 FROM kb_treatment_rules ktr WHERE ktr.complaint_id = kc.complaint_id)
      LIMIT 20
    `);
    for (const row of ((noTx.rows ?? noTx) as any[])) {
      issues.push({ severity: "warning", type: "missing_treatment", complaint: row.complaint_id, message: `${row.label}: No treatment rules defined` });
    }

    // 4. Questions with no linked diagnoses
    const unlinkedQs = await db.execute(sql`
      SELECT kq.complaint_id, kq.question_id, kq.prompt
      FROM kb_questions kq
      JOIN kb_complaints kc ON kc.complaint_id = kq.complaint_id
      WHERE ${system ? sql`kc.system = ${system as string}` : sql`kc.system IS NOT NULL`}
        AND ${complaint ? sql`kq.complaint_id = ${complaint as string}` : sql`TRUE`}
        AND (kq.linked_diagnoses IS NULL OR kq.linked_diagnoses = '{}' OR cardinality(kq.linked_diagnoses) = 0)
        AND kq.active
      LIMIT 15
    `);
    for (const row of ((unlinkedQs.rows ?? unlinkedQs) as any[])) {
      issues.push({ severity: "info", type: "unlinked_question", complaint: row.complaint_id, message: `Q: "${String(row.prompt).slice(0, 60)}…" has no linked diagnoses` });
    }

    // 5. Summary stats
    const stats = await db.execute(sql`
      SELECT
        COUNT(DISTINCT kc.complaint_id)::int  AS total_complaints,
        COUNT(DISTINCT kq.id)::int            AS total_questions,
        COUNT(DISTINCT krf.id)::int           AS total_red_flags,
        COUNT(DISTINCT ktr.id)::int           AS total_treatments
      FROM kb_complaints kc
      LEFT JOIN kb_questions kq ON kq.complaint_id = kc.complaint_id
      LEFT JOIN kb_red_flag_rules krf ON krf.complaint_id = kc.complaint_id
      LEFT JOIN kb_treatment_rules ktr ON ktr.complaint_id = kc.complaint_id
      WHERE ${system ? sql`kc.system = ${system as string}` : sql`kc.system IS NOT NULL`}
    `);
    const summary = ((stats.rows ?? stats) as any[])[0] ?? {};

    res.json({ ok: true, issues, summary, filter: { system: system ?? null, complaint: complaint ?? null } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/qa/suggestions ──────────────────────────────────────────────────
router.post("/suggestions", async (req: Request, res: Response) => {
  try {
    const { complaint, system, context = {} } = req.body;
    if (!complaint) return res.status(400).json({ error: "complaint is required" });

    // Pull existing rules for context
    const existingQs = await db.execute(sql`
      SELECT prompt FROM kb_questions WHERE complaint_id = ${complaint} AND active = TRUE LIMIT 10
    `);
    const existingRF = await db.execute(sql`
      SELECT label FROM kb_red_flag_rules WHERE complaint_id = ${complaint} AND active = TRUE LIMIT 8
    `);
    const existingTx = await db.execute(sql`
      SELECT medication_name, adult_dose, contraindications FROM kb_treatment_rules WHERE complaint_id = ${complaint} LIMIT 8
    `);

    const existingQsList  = ((existingQs.rows ?? existingQs) as any[]).map((r: any) => r.prompt);
    const existingRFList  = ((existingRF.rows ?? existingRF) as any[]).map((r: any) => r.label);
    const existingTxList  = ((existingTx.rows ?? existingTx) as any[]).map((r: any) => `${r.medication_name} (${r.adult_dose})`);

    const prompt = `You are a senior clinical informaticist reviewing the KB rules for a medical triage system.

Complaint: "${complaint}" (System: ${system ?? "unknown"})

EXISTING INTAKE QUESTIONS:
${existingQsList.length ? existingQsList.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n") : "None defined"}

EXISTING RED FLAGS:
${existingRFList.length ? existingRFList.join(", ") : "None defined"}

EXISTING TREATMENTS:
${existingTxList.length ? existingTxList.join(", ") : "None defined"}

Generate 5-8 specific, actionable clinical QA suggestions. For each:
- Identify a gap or improvement (missing question, red flag, treatment, or safety rule)
- Be specific and cite clinical reasoning
- Label the type: "add_question" | "add_red_flag" | "add_treatment" | "safety_check" | "consistency_fix"

Respond as JSON array: [{ "type": "...", "title": "...", "description": "...", "priority": "high|medium|low", "proposedRule": "..." }]`;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1200,
    });

    const raw = JSON.parse(completion.choices[0].message.content ?? "{}");
    const suggestions = Array.isArray(raw) ? raw : (raw.suggestions ?? raw.items ?? []);

    res.json({ ok: true, complaint, system: system ?? null, suggestions });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/qa/suggestions/apply ────────────────────────────────────────────
router.post("/suggestions/apply", async (req: Request, res: Response) => {
  try {
    const { complaint, title, description, type, proposedRule } = req.body;
    if (!complaint || !title) return res.status(400).json({ error: "complaint and title are required" });

    const changeId = `QA-SUGG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await db.execute(sql`
      INSERT INTO kb_knowledge_changes (change_id, domain, record_id, action, changed_by, old_value, new_value, rationale, status)
      VALUES (
        ${changeId},
        ${type ?? "suggestion"},
        ${complaint},
        'create',
        'qa_engine',
        NULL,
        ${JSON.stringify({ title, description, proposedRule })},
        ${"Applied from Clinical QA AI Suggestion Engine: " + description},
        'pending'
      )
    `);
    res.json({ ok: true, changeId, message: "Suggestion queued for review" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/qa/consistency ───────────────────────────────────────────────────
router.get("/consistency", async (_req: Request, res: Response) => {
  try {
    // Universal rules to check across systems
    const universalChecks = [
      { rule: "Blood pressure check",  keyword: "blood_pressure" },
      { rule: "Pregnancy screening",   keyword: "pregnan" },
      { rule: "Medication review",     keyword: "medic" },
      { rule: "Allergy check",         keyword: "allerg" },
      { rule: "Fever assessment",      keyword: "fever" },
      { rule: "Pain scoring",          keyword: "pain" },
      { rule: "Respiratory distress",  keyword: "respiratory" },
      { rule: "Prior ED visits",       keyword: "prior_admission\|prior_ed\|hospital" },
    ];

    const targetSystems = ["ENT", "PULM", "NEURO", "CARDIO", "GI", "GU"];

    const matrix: any[] = [];

    for (const check of universalChecks) {
      const row: any = { rule: check.rule };

      for (const sys of targetSystems) {
        // Check questions
        const qMatch = await db.execute(sql`
          SELECT COUNT(*)::int AS cnt
          FROM kb_questions kq
          JOIN kb_complaints kc ON kc.complaint_id = kq.complaint_id
          WHERE kc.system = ${sys}
            AND (lower(kq.question_id) LIKE ${'%' + check.keyword.split('\\|')[0] + '%'}
              OR lower(kq.prompt) LIKE ${'%' + check.keyword.split('\\|')[0] + '%'})
        `);
        const cnt = ((qMatch.rows ?? qMatch) as any[])[0]?.cnt ?? 0;
        row[sys.toLowerCase()] = cnt > 0;
      }

      matrix.push(row);
    }

    res.json({ ok: true, matrix, systems: targetSystems });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/qa/medications ───────────────────────────────────────────────────
router.get("/medications", async (_req: Request, res: Response) => {
  try {
    const meds = await db.execute(sql`
      SELECT ktr.*, kc.label AS complaint_label, kc.system
      FROM kb_treatment_rules ktr
      LEFT JOIN kb_complaints kc ON kc.complaint_id = ktr.complaint_id
      ORDER BY ktr.medication_group, ktr.medication_name
    `);

    const allMeds = (meds.rows ?? meds) as any[];

    // Flag issues
    const flags: Array<{ severity: "critical" | "warning"; medication: string; complaint: string; issue: string }> = [];

    // 1. Duplicate medication across different complaints/diagnoses
    const medCounts: Record<string, string[]> = {};
    for (const m of allMeds) {
      if (!medCounts[m.medication_name]) medCounts[m.medication_name] = [];
      medCounts[m.medication_name].push(m.complaint_id);
    }

    // 2. Flag medications with known dangerous contraindications missing
    for (const m of allMeds) {
      if (!m.contraindications || m.contraindications.trim() === "") {
        flags.push({ severity: "warning", medication: m.medication_name, complaint: m.complaint_id, issue: "No contraindications documented" });
      }
      if (m.medication_group === "Penicillin" && (!m.contraindications || !m.contraindications.toLowerCase().includes("allerg"))) {
        flags.push({ severity: "critical", medication: m.medication_name, complaint: m.complaint_id, issue: "Penicillin missing allergy contraindication" });
      }
      if (m.medication_group === "Macrolide" && (!m.contraindications || !m.contraindications.toLowerCase().includes("qt"))) {
        flags.push({ severity: "warning", medication: m.medication_name, complaint: m.complaint_id, issue: "Macrolide missing QT prolongation warning" });
      }
      if (!m.pediatric_dose && !m.adult_dose) {
        flags.push({ severity: "warning", medication: m.medication_name, complaint: m.complaint_id, issue: "No dosing defined (adult or pediatric)" });
      }
    }

    // Group by medication_group
    const byGroup: Record<string, any[]> = {};
    for (const m of allMeds) {
      const g = m.medication_group ?? "Uncategorized";
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(m);
    }

    res.json({ ok: true, medications: allMeds, flags, byGroup, total: allMeds.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/qa/audit-insights ────────────────────────────────────────────────
router.get("/audit-insights", async (_req: Request, res: Response) => {
  try {
    // Change frequency by domain
    const byDomain = await db.execute(sql`
      SELECT domain, COUNT(*)::int AS cnt, COUNT(CASE WHEN status='deployed' THEN 1 END)::int AS deployed,
             COUNT(CASE WHEN status='pending' THEN 1 END)::int AS pending,
             COUNT(CASE WHEN status='rejected' THEN 1 END)::int AS rejected
      FROM kb_knowledge_changes
      GROUP BY domain ORDER BY cnt DESC
    `);

    // Recent changes
    const recent = await db.execute(sql`
      SELECT change_id, domain, action, changed_by, status, rationale, created_at
      FROM kb_knowledge_changes
      ORDER BY created_at DESC LIMIT 20
    `);

    // Risky changes: multiple updates to same record
    const risky = await db.execute(sql`
      SELECT record_id, COUNT(*)::int AS change_count, MAX(domain) AS domain
      FROM kb_knowledge_changes
      GROUP BY record_id HAVING COUNT(*) > 1
      ORDER BY change_count DESC LIMIT 10
    `);

    // Pending review queue
    const pending = await db.execute(sql`
      SELECT * FROM kb_knowledge_changes WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10
    `);

    // Drift detection: changes in last 7 days vs previous period
    const recentCount = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM kb_knowledge_changes WHERE created_at > NOW() - INTERVAL '7 days'
    `);
    const prevCount = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM kb_knowledge_changes WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
    `);

    const thisWeek = ((recentCount.rows ?? recentCount) as any[])[0]?.cnt ?? 0;
    const lastWeek = ((prevCount.rows ?? prevCount) as any[])[0]?.cnt ?? 0;
    const driftPct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

    // Learning events summary
    const learningStats = await db.execute(sql`
      SELECT status, COUNT(*)::int AS cnt FROM kb_learning_events GROUP BY status
    `);

    res.json({
      ok: true,
      byDomain: (byDomain.rows ?? byDomain) as any[],
      recentChanges: (recent.rows ?? recent) as any[],
      riskyChanges: (risky.rows ?? risky) as any[],
      pendingReview: (pending.rows ?? pending) as any[],
      drift: { thisWeek, lastWeek, driftPct, alert: driftPct !== null && Math.abs(driftPct) > 50 },
      learningStats: (learningStats.rows ?? learningStats) as any[],
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

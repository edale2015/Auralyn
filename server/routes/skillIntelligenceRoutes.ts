import express from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import OpenAI from "openai";
import { applyPHIGuard } from "../middleware/phiGuardOpenAI";

const router = express.Router();

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

// ─── Skill Suggestions (Optimal Skill Analyzer) ─────────────────────────────
router.get("/skill-suggestions", async (_req, res) => {
  try {
    const complaints = (await db.execute(sql`SELECT * FROM kb_complaints WHERE enabled = true`)).rows as any[];
    const suggestions: any[] = [];

    for (const c of complaints) {
      const qCount = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM kb_questions WHERE complaint_id = ${c.complaint_id} AND active = true`)).rows as any[])[0]?.cnt ?? 0;
      const rfCount = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM kb_red_flag_rules WHERE complaint_id = ${c.complaint_id} AND active = true`)).rows as any[])[0]?.cnt ?? 0;
      const dxCount = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM kb_diagnosis_rules WHERE complaint_id = ${c.complaint_id}`)).rows as any[])[0]?.cnt ?? 0;

      if (qCount < 3) {
        suggestions.push({ complaint: c.label, complaint_id: c.complaint_id, system: c.system, suggestion: "Add diagnostic + safety questions", reason: `Low skill density — only ${qCount} question(s)`, priority: "high", type: "add_skill" });
      }
      if (rfCount === 0) {
        suggestions.push({ complaint: c.label, complaint_id: c.complaint_id, system: c.system, suggestion: "Add red flag skill", reason: "Missing emergency detection rules", priority: "critical", type: "add_red_flag" });
      }
      if (dxCount < 2) {
        suggestions.push({ complaint: c.label, complaint_id: c.complaint_id, system: c.system, suggestion: "Expand diagnosis rule coverage", reason: `Only ${dxCount} diagnosis rule(s) — needs broader differential`, priority: "medium", type: "expand_dx" });
      }
    }

    res.json({ ok: true, suggestions, count: suggestions.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Generate Skills from Guideline Text (AI) ────────────────────────────────
router.post("/generate-skills", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ ok: false, error: "text is required" });

    const openai = getOpenAI();
    const skillParams: any = {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a clinical knowledge engineer. Convert clinical guideline text into structured skill modules for a medical triage platform.
Each skill should have: name, complaint (condition it applies to), triggers (list of conditions that activate this skill), actions (list of clinical actions), category (diagnostic | safety | red_flag | treatment | modifier), confidence (0.0-1.0).
Return a JSON array of skill objects. Return only valid JSON, no markdown.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    };
    const response = await openai.chat.completions.create(applyPHIGuard(skillParams, "skillIntelligence/generate-skills"));

    const raw = response.choices[0].message.content ?? "[]";
    let skills: any[] = [];
    try { skills = JSON.parse(raw); } catch { skills = []; }
    if (!Array.isArray(skills)) skills = [];

    // Save to generated_skills
    const saved: any[] = [];
    for (const s of skills.slice(0, 20)) {
      const r = (await db.execute(sql`
        INSERT INTO generated_skills (name, complaint, logic, source, confidence, status)
        VALUES (${s.name ?? "unnamed"}, ${s.complaint ?? "general"}, ${JSON.stringify(s)}::jsonb, 'guideline', ${s.confidence ?? 0.85}, 'pending')
        RETURNING *
      `)).rows as any[];
      if (r[0]) saved.push(r[0]);
    }

    res.json({ ok: true, skills: saved, count: saved.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── List generated skills ────────────────────────────────────────────────────
router.get("/generated-skills", async (_req, res) => {
  try {
    const rows = (await db.execute(sql`SELECT * FROM generated_skills ORDER BY created_at DESC LIMIT 100`)).rows as any[];
    res.json({ ok: true, skills: rows, count: rows.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Update generated skill status ───────────────────────────────────────────
router.patch("/generated-skills/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;
    await db.execute(sql`UPDATE generated_skills SET status = ${status} WHERE id = ${parseInt(id)}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Prune Skills ────────────────────────────────────────────────────────────
router.get("/prune-skills", async (_req, res) => {
  try {
    // Find kb_questions with no linked_diagnoses and low priority
    const questions = (await db.execute(sql`
      SELECT q.*, c.label AS complaint_label, c.system
      FROM kb_questions q
      JOIN kb_complaints c ON c.complaint_id = q.complaint_id
      WHERE q.active = true
      ORDER BY q.priority DESC
    `)).rows as any[];

    const prunable: any[] = [];
    const seen = new Set<string>();

    for (const q of questions) {
      const linked = (q.linked_diagnoses as string[] | null) ?? [];
      const usageRow = (await db.execute(sql`SELECT * FROM skill_usage_stats WHERE skill_id = ${q.question_id}`)).rows as any[];
      const usage = usageRow[0];

      const usageCount = usage?.usage_count ?? 0;
      const impact = usage?.outcome_impact ?? 0;

      const isLowUsage = usageCount < 5;
      const isLowLink = linked.length === 0;
      const isPrunable = isLowUsage && isLowLink;

      if (isPrunable && !seen.has(q.question_id)) {
        seen.add(q.question_id);
        prunable.push({
          skill_id: q.question_id,
          name: q.prompt?.slice(0, 80) ?? q.question_id,
          complaint: q.complaint_label,
          system: q.system,
          usage_count: usageCount,
          outcome_impact: impact,
          reason: isLowLink ? "No linked diagnoses + low usage" : "Low usage + low impact",
        });
      }
    }

    res.json({ ok: true, prunable, count: prunable.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Compute Skill Importance ─────────────────────────────────────────────────
router.post("/skill-importance/compute", async (_req, res) => {
  try {
    const questions = (await db.execute(sql`
      SELECT q.question_id, q.priority, q.complaint_id, q.linked_diagnoses, q.required,
             COALESCE(s.usage_count, 0) AS usage_count,
             COALESCE(s.outcome_impact, 0) AS outcome_impact
      FROM kb_questions q
      LEFT JOIN skill_usage_stats s ON s.skill_id = q.question_id
      WHERE q.active = true
    `)).rows as any[];

    const computed: any[] = [];

    for (const q of questions) {
      const freq = Math.log(Math.max(q.usage_count ?? 0, 1) + 1) / Math.log(100);
      const impact = q.outcome_impact ?? 0;
      const safetyScore = q.required ? 0.8 : 0.3;
      const linkedBonus = ((q.linked_diagnoses as string[] | null)?.length ?? 0) > 0 ? 0.2 : 0;
      const priorityScore = Math.min((100 - (q.priority ?? 50)) / 100, 1);
      const combined = 0.4 * Math.max(impact, priorityScore) + 0.3 * safetyScore + 0.2 * freq + 0.1 * linkedBonus;

      await db.execute(sql`
        INSERT INTO skill_importance (skill_id, impact_score, safety_score, frequency, combined_score, computed_at)
        VALUES (${q.question_id}, ${impact}, ${safetyScore}, ${freq}, ${combined}, now())
        ON CONFLICT (skill_id) DO UPDATE
          SET impact_score = ${impact}, safety_score = ${safetyScore}, frequency = ${freq},
              combined_score = ${combined}, computed_at = now()
      `);

      computed.push({ skill_id: q.question_id, impact_score: impact, safety_score: safetyScore, frequency: freq, combined_score: combined });
    }

    computed.sort((a, b) => b.combined_score - a.combined_score);
    res.json({ ok: true, scores: computed, count: computed.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/skill-importance", async (_req, res) => {
  try {
    const rows = (await db.execute(sql`
      SELECT si.*, q.prompt AS name, q.complaint_id, q.required,
             c.label AS complaint_label, c.system
      FROM skill_importance si
      JOIN kb_questions q ON q.question_id = si.skill_id
      JOIN kb_complaints c ON c.complaint_id = q.complaint_id
      ORDER BY si.combined_score DESC
      LIMIT 100
    `)).rows as any[];
    res.json({ ok: true, scores: rows, count: rows.length, computed: rows.length > 0 });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Merge Candidates ─────────────────────────────────────────────────────────
router.post("/merge-candidates/compute", async (_req, res) => {
  try {
    await db.execute(sql`DELETE FROM skill_similarity`);

    // Find questions with same category + same complaint → potential merge
    const questions = (await db.execute(sql`
      SELECT q.question_id, q.complaint_id, q.category, q.prompt, c.label AS complaint_label
      FROM kb_questions q
      JOIN kb_complaints c ON c.complaint_id = q.complaint_id
      WHERE q.active = true
    `)).rows as any[];

    const pairs: any[] = [];
    const inserted = new Set<string>();

    for (let i = 0; i < questions.length; i++) {
      for (let j = i + 1; j < questions.length; j++) {
        const a = questions[i];
        const b = questions[j];
        if (a.complaint_id === b.complaint_id && a.category === b.category && a.category) {
          // Jaccard similarity of prompt words
          const wa = new Set((a.prompt ?? "").toLowerCase().split(/\s+/));
          const wb = new Set((b.prompt ?? "").toLowerCase().split(/\s+/));
          const intersection = [...wa].filter(w => wb.has(w)).length;
          const union = new Set([...wa, ...wb]).size;
          const sim = union > 0 ? intersection / union : 0;

          const key = [a.question_id, b.question_id].sort().join("|");
          if (sim > 0.2 && !inserted.has(key)) {
            inserted.add(key);
            pairs.push({ skill_a: a.question_id, skill_b: b.question_id, similarity: parseFloat(sim.toFixed(3)), complaint: a.complaint_label, category: a.category });
            await db.execute(sql`INSERT INTO skill_similarity (skill_a, skill_b, similarity) VALUES (${a.question_id}, ${b.question_id}, ${sim})`);
          }
        }
      }
    }

    pairs.sort((a, b) => b.similarity - a.similarity);
    res.json({ ok: true, pairs, count: pairs.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/merge-candidates", async (_req, res) => {
  try {
    const rows = (await db.execute(sql`SELECT * FROM skill_similarity ORDER BY similarity DESC LIMIT 100`)).rows as any[];
    const computed = rows.length > 0;
    res.json({ ok: true, pairs: rows, count: rows.length, computed });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/merge-apply", async (req, res) => {
  try {
    const { skillA, skillB } = req.body;
    const mergedId = `${skillA}_${skillB}_merged`;
    const mergedLogic = { name: mergedId, original: [skillA, skillB], merged_at: new Date().toISOString() };
    const r = (await db.execute(sql`
      INSERT INTO merged_skills (new_skill_id, original_skills, merged_logic, status)
      VALUES (${mergedId}, ARRAY[${skillA}, ${skillB}]::text[], ${JSON.stringify(mergedLogic)}::jsonb, 'applied')
      RETURNING *
    `)).rows as any[];
    res.json({ ok: true, merged: r[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/merged-skills", async (_req, res) => {
  try {
    const rows = (await db.execute(sql`SELECT * FROM merged_skills ORDER BY created_at DESC LIMIT 50`)).rows as any[];
    res.json({ ok: true, merged: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Dependency Optimizer ─────────────────────────────────────────────────────
router.get("/dependency-optimizer", async (_req, res) => {
  try {
    const questions = (await db.execute(sql`
      SELECT q.question_id, q.prompt, q.complaint_id, q.category, q.required,
             q.linked_diagnoses, q.conditional_on, c.label AS complaint_label
      FROM kb_questions q
      JOIN kb_complaints c ON c.complaint_id = q.complaint_id
      WHERE q.active = true
    `)).rows as any[];

    const suggestions: any[] = [];

    for (const q of questions) {
      const linked = (q.linked_diagnoses as string[] | null) ?? [];
      const cond = (q.conditional_on as any) ?? {};
      const hasConditions = Object.keys(cond).length > 0;

      if (!q.required && !hasConditions && linked.length === 0) {
        suggestions.push({ skill: q.question_id, name: q.prompt?.slice(0, 60), complaint: q.complaint_label, suggestion: "Add modifier dependency or link to diagnoses", reason: "Standalone optional question with no dependencies or linked outcomes" });
      }
      if (q.category === "centor" && !hasConditions) {
        suggestions.push({ skill: q.question_id, name: q.prompt?.slice(0, 60), complaint: q.complaint_label, suggestion: "Make conditional on fever presence", reason: "Centor scoring questions should cascade from fever detection" });
      }
    }

    res.json({ ok: true, suggestions, count: suggestions.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Minimum Viable Skill Set (MVSS) ─────────────────────────────────────────
router.get("/mvss", async (_req, res) => {
  try {
    const complaints = (await db.execute(sql`SELECT * FROM kb_complaints WHERE enabled = true`)).rows as any[];
    const mvss: any[] = [];

    for (const c of complaints) {
      // Highest priority question + 1 red flag rule = minimum viable set
      const topQ = (await db.execute(sql`
        SELECT * FROM kb_questions WHERE complaint_id = ${c.complaint_id} AND active = true ORDER BY priority ASC LIMIT 1
      `)).rows as any[];
      const topRF = (await db.execute(sql`
        SELECT * FROM kb_red_flag_rules WHERE complaint_id = ${c.complaint_id} AND active = true LIMIT 1
      `)).rows as any[];

      mvss.push({
        complaint_id: c.complaint_id,
        complaint: c.label,
        system: c.system,
        mvs_question: topQ[0]?.question_id ?? null,
        mvs_question_prompt: topQ[0]?.prompt?.slice(0, 80) ?? "no questions",
        mvs_red_flag: topRF[0]?.rule_id ?? null,
        mvs_red_flag_label: topRF[0]?.label ?? "no red flags",
        skill_density: ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM kb_questions WHERE complaint_id = ${c.complaint_id}`)).rows as any[])[0]?.cnt ?? 0,
      });
    }

    res.json({ ok: true, mvss, count: mvss.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

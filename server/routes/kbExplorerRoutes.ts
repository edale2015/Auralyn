import { Router, Request, Response } from "express";
import { pool } from "../db/pool";

export const kbExplorerRouter = Router();

// ─── GET /api/kb-explorer/complaints ─────────────────────────────────────────
// All complaints, grouped by system, with counts of linked rules
kbExplorerRouter.get("/api/kb-explorer/complaints", async (_req: Request, res: Response) => {
  try {
    const { rows: complaints } = await pool.query(`
      SELECT
        c.complaint_id,
        c.system,
        c.label,
        c.aliases,
        c.enabled,
        c.engine_type,
        COUNT(DISTINCT d.id) AS diagnosis_count,
        COUNT(DISTINCT r.id) AS red_flag_count,
        COUNT(DISTINCT dp.id) AS disposition_count,
        COUNT(DISTINCT t.id) AS treatment_count
      FROM kb_complaints c
      LEFT JOIN kb_diagnosis_rules d ON d.complaint_id = c.complaint_id
      LEFT JOIN kb_red_flag_rules r ON r.complaint_id = c.complaint_id
      LEFT JOIN kb_disposition_rules dp ON dp.complaint_id = c.complaint_id
      LEFT JOIN kb_treatment_rules t ON t.complaint_id = c.complaint_id
      GROUP BY c.complaint_id, c.system, c.label, c.aliases, c.enabled, c.engine_type
      ORDER BY c.system, c.label
    `);

    // Group by system
    const grouped: Record<string, typeof complaints> = {};
    for (const row of complaints) {
      if (!grouped[row.system]) grouped[row.system] = [];
      grouped[row.system].push({
        ...row,
        diagnosis_count: parseInt(row.diagnosis_count),
        red_flag_count: parseInt(row.red_flag_count),
        disposition_count: parseInt(row.disposition_count),
        treatment_count: parseInt(row.treatment_count),
      });
    }

    res.json({ complaints, grouped, total: complaints.length });
  } catch (err) {
    console.error("[kbExplorer] complaints error:", err);
    res.status(500).json({ error: "Failed to load complaints" });
  }
});

// ─── GET /api/kb-explorer/complaints/:id ─────────────────────────────────────
// Full protocol for one complaint: diagnoses + red flags + dispositions + treatments
kbExplorerRouter.get("/api/kb-explorer/complaints/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [
      { rows: complaint },
      { rows: diagnoses },
      { rows: redFlags },
      { rows: dispositions },
      { rows: treatments },
    ] = await Promise.all([
      pool.query(`SELECT * FROM kb_complaints WHERE complaint_id = $1`, [id]),
      pool.query(`
        SELECT * FROM kb_diagnosis_rules
        WHERE complaint_id = $1
        ORDER BY base_probability DESC, cannot_miss DESC
      `, [id]),
      pool.query(`
        SELECT * FROM kb_red_flag_rules
        WHERE complaint_id = $1
        ORDER BY severity DESC, label
      `, [id]),
      pool.query(`
        SELECT * FROM kb_disposition_rules
        WHERE complaint_id = $1
        ORDER BY priority ASC
      `, [id]),
      pool.query(`
        SELECT * FROM kb_treatment_rules
        WHERE complaint_id = $1
        ORDER BY is_first_line DESC, medication_name
      `, [id]),
    ]);

    if (!complaint.length) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    res.json({
      complaint: complaint[0],
      diagnoses,
      redFlags,
      dispositions,
      treatments,
    });
  } catch (err) {
    console.error("[kbExplorer] protocol error:", err);
    res.status(500).json({ error: "Failed to load protocol" });
  }
});

// ─── PATCH /api/kb-explorer/complaints/:id ───────────────────────────────────
kbExplorerRouter.patch("/api/kb-explorer/complaints/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { enabled, label, engine_type } = req.body;
  try {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (enabled !== undefined) { sets.push(`enabled = $${idx++}`); vals.push(enabled); }
    if (label !== undefined) { sets.push(`label = $${idx++}`); vals.push(label); }
    if (engine_type !== undefined) { sets.push(`engine_type = $${idx++}`); vals.push(engine_type); }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    await pool.query(`UPDATE kb_complaints SET ${sets.join(", ")} WHERE complaint_id = $${idx}`, vals);
    res.json({ ok: true });
  } catch (err) {
    console.error("[kbExplorer] patch complaint error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// ─── PATCH /api/kb-explorer/diagnosis-rules/:id ──────────────────────────────
kbExplorerRouter.patch("/api/kb-explorer/diagnosis-rules/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { diagnosis_label, icd_code, base_probability, cannot_miss, active } = req.body;
  try {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (diagnosis_label !== undefined) { sets.push(`diagnosis_label = $${idx++}`); vals.push(diagnosis_label); }
    if (icd_code !== undefined) { sets.push(`icd_code = $${idx++}`); vals.push(icd_code); }
    if (base_probability !== undefined) { sets.push(`base_probability = $${idx++}`); vals.push(parseFloat(base_probability)); }
    if (cannot_miss !== undefined) { sets.push(`cannot_miss = $${idx++}`); vals.push(cannot_miss); }
    if (active !== undefined) { sets.push(`active = $${idx++}`); vals.push(active); }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    await pool.query(`UPDATE kb_diagnosis_rules SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

// ─── PATCH /api/kb-explorer/red-flag-rules/:id ───────────────────────────────
kbExplorerRouter.patch("/api/kb-explorer/red-flag-rules/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { label, severity, action, immediate_actions, rationale, active } = req.body;
  try {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (label !== undefined) { sets.push(`label = $${idx++}`); vals.push(label); }
    if (severity !== undefined) { sets.push(`severity = $${idx++}`); vals.push(severity); }
    if (action !== undefined) { sets.push(`action = $${idx++}`); vals.push(action); }
    if (immediate_actions !== undefined) { sets.push(`immediate_actions = $${idx++}`); vals.push(immediate_actions); }
    if (rationale !== undefined) { sets.push(`rationale = $${idx++}`); vals.push(rationale); }
    if (active !== undefined) { sets.push(`active = $${idx++}`); vals.push(active); }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    await pool.query(`UPDATE kb_red_flag_rules SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

// ─── PATCH /api/kb-explorer/treatment-rules/:id ──────────────────────────────
kbExplorerRouter.patch("/api/kb-explorer/treatment-rules/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { adult_dose, adult_max_dose, pediatric_dose, notes, active, is_first_line } = req.body;
  try {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (adult_dose !== undefined) { sets.push(`adult_dose = $${idx++}`); vals.push(adult_dose); }
    if (adult_max_dose !== undefined) { sets.push(`adult_max_dose = $${idx++}`); vals.push(adult_max_dose); }
    if (pediatric_dose !== undefined) { sets.push(`pediatric_dose = $${idx++}`); vals.push(pediatric_dose); }
    if (notes !== undefined) { sets.push(`notes = $${idx++}`); vals.push(notes); }
    if (active !== undefined) { sets.push(`active = $${idx++}`); vals.push(active); }
    if (is_first_line !== undefined) { sets.push(`is_first_line = $${idx++}`); vals.push(is_first_line); }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    await pool.query(`UPDATE kb_treatment_rules SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

// ─── GET /api/kb-explorer/search ─────────────────────────────────────────────
kbExplorerRouter.get("/api/kb-explorer/search", async (req: Request, res: Response) => {
  const q = `%${(req.query.q as string || "").toLowerCase()}%`;
  try {
    const { rows } = await pool.query(`
      SELECT complaint_id, system, label, enabled
      FROM kb_complaints
      WHERE LOWER(label) LIKE $1 OR LOWER(complaint_id) LIKE $1
         OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE LOWER(a) LIKE $1)
      ORDER BY system, label
      LIMIT 30
    `, [q]);
    res.json({ results: rows });
  } catch (err) {
    res.status(500).json({ error: "Search failed" });
  }
});

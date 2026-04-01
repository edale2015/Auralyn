import express from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = express.Router();

// ─── Build graph from live KB tables ─────────────────────────────────────────
router.post("/skill-graph/build", async (_req, res) => {
  try {
    // Clear old data
    await db.execute(sql`DELETE FROM skill_edges`);
    await db.execute(sql`DELETE FROM skill_nodes`);

    // ── 1. Complaint nodes ──────────────────────────────────────────────────
    const complaints = (await db.execute(sql`
      SELECT complaint_id, label, system FROM kb_complaints WHERE enabled = true
    `)).rows as any[];

    for (const c of complaints) {
      await db.execute(sql`
        INSERT INTO skill_nodes (node_id, name, type, system)
        VALUES (${`complaint:${c.complaint_id}`}, ${c.label}, 'complaint', ${c.system})
        ON CONFLICT (node_id) DO NOTHING
      `);
    }

    // ── 2. Modifier nodes (system-wide) ─────────────────────────────────────
    const modifiers = (await db.execute(sql`
      SELECT modifier_id, label FROM kb_modifiers WHERE active = true
    `)).rows as any[];

    for (const m of modifiers) {
      await db.execute(sql`
        INSERT INTO skill_nodes (node_id, name, type)
        VALUES (${`modifier:${m.modifier_id}`}, ${m.label}, 'modifier')
        ON CONFLICT (node_id) DO NOTHING
      `);
    }

    // Every complaint "uses" every modifier (system-wide applicability)
    for (const c of complaints) {
      for (const m of modifiers) {
        await db.execute(sql`
          INSERT INTO skill_edges (from_node, to_node, relationship)
          VALUES (${`complaint:${c.complaint_id}`}, ${`modifier:${m.modifier_id}`}, 'uses')
        `);
      }
    }

    // ── 3. Question / Skill nodes ────────────────────────────────────────────
    const questions = (await db.execute(sql`
      SELECT DISTINCT question_id, complaint_id, prompt FROM kb_questions WHERE active = true
    `)).rows as any[];

    for (const q of questions) {
      await db.execute(sql`
        INSERT INTO skill_nodes (node_id, name, type, system)
        VALUES (
          ${`skill:${q.question_id}`},
          ${q.prompt?.slice(0, 80) ?? q.question_id},
          'skill',
          (SELECT system FROM kb_complaints WHERE complaint_id = ${q.complaint_id} LIMIT 1)
        )
        ON CONFLICT (node_id) DO NOTHING
      `);
      // Complaint "uses" question skill
      await db.execute(sql`
        INSERT INTO skill_edges (from_node, to_node, relationship)
        VALUES (${`complaint:${q.complaint_id}`}, ${`skill:${q.question_id}`}, 'uses')
      `);
    }

    // ── 4. Red flag rule nodes ────────────────────────────────────────────────
    const redFlags = (await db.execute(sql`
      SELECT rule_id, complaint_id, label, severity FROM kb_red_flag_rules WHERE active = true
    `)).rows as any[];

    for (const rf of redFlags) {
      await db.execute(sql`
        INSERT INTO skill_nodes (node_id, name, type, system)
        VALUES (
          ${`rule:${rf.rule_id}`},
          ${`[RF:${rf.severity}] ${rf.label}`},
          'rule',
          (SELECT system FROM kb_complaints WHERE complaint_id = ${rf.complaint_id} LIMIT 1)
        )
        ON CONFLICT (node_id) DO NOTHING
      `);
      // Complaint "triggers" red flag
      await db.execute(sql`
        INSERT INTO skill_edges (from_node, to_node, relationship)
        VALUES (${`complaint:${rf.complaint_id}`}, ${`rule:${rf.rule_id}`}, 'triggers')
      `);
    }

    // ── 5. Diagnosis rule nodes ───────────────────────────────────────────────
    const diagRules = (await db.execute(sql`
      SELECT DISTINCT rule_id, complaint_id, diagnosis_label FROM kb_diagnosis_rules LIMIT 200
    `)).rows as any[];

    for (const dr of diagRules) {
      const nodeId = `rule:diag_${dr.rule_id}`;
      await db.execute(sql`
        INSERT INTO skill_nodes (node_id, name, type, system)
        VALUES (
          ${nodeId},
          ${`[Dx] ${dr.diagnosis_label ?? dr.rule_id}`},
          'rule',
          (SELECT system FROM kb_complaints WHERE complaint_id = ${dr.complaint_id} LIMIT 1)
        )
        ON CONFLICT (node_id) DO NOTHING
      `);
      await db.execute(sql`
        INSERT INTO skill_edges (from_node, to_node, relationship)
        VALUES (${`complaint:${dr.complaint_id}`}, ${nodeId}, 'triggers')
      `);
    }

    // ── 6. Update degree counters ─────────────────────────────────────────────
    await db.execute(sql`
      UPDATE skill_nodes sn
      SET degree_out = (SELECT COUNT(*) FROM skill_edges WHERE from_node = sn.node_id)
    `);
    await db.execute(sql`
      UPDATE skill_nodes sn
      SET degree_in = (SELECT COUNT(*) FROM skill_edges WHERE to_node = sn.node_id)
    `);

    // ── 7. Return summary ─────────────────────────────────────────────────────
    const nodeCount = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM skill_nodes`)).rows as any[])[0]?.cnt ?? 0;
    const edgeCount = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM skill_edges`)).rows as any[])[0]?.cnt ?? 0;

    res.json({
      ok: true,
      nodeCount,
      edgeCount,
      breakdown: {
        complaints: complaints.length,
        modifiers: modifiers.length,
        skills: questions.length,
        redFlagRules: redFlags.length,
        diagnosisRules: diagRules.length,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET nodes (with degree) ──────────────────────────────────────────────────
router.get("/skill-graph/nodes", async (req, res) => {
  try {
    const typeFilter = req.query.type as string | undefined;
    const systemFilter = req.query.system as string | undefined;

    let query = sql`SELECT * FROM skill_nodes WHERE 1=1`;
    if (typeFilter) query = sql`SELECT * FROM skill_nodes WHERE type = ${typeFilter}`;
    if (systemFilter && !typeFilter) query = sql`SELECT * FROM skill_nodes WHERE system = ${systemFilter}`;
    if (systemFilter && typeFilter) query = sql`SELECT * FROM skill_nodes WHERE type = ${typeFilter} AND system = ${systemFilter}`;

    const rows = (await db.execute(query)).rows as any[];
    res.json({ ok: true, nodes: rows, count: rows.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET edges ────────────────────────────────────────────────────────────────
router.get("/skill-graph/edges", async (req, res) => {
  try {
    const rel = req.query.relationship as string | undefined;
    const rows = rel
      ? ((await db.execute(sql`SELECT * FROM skill_edges WHERE relationship = ${rel}`)).rows as any[])
      : ((await db.execute(sql`SELECT * FROM skill_edges`)).rows as any[]);
    res.json({ ok: true, edges: rows, count: rows.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET coverage / orphan analysis ──────────────────────────────────────────
router.get("/skill-graph/coverage", async (_req, res) => {
  try {
    const nodes = (await db.execute(sql`SELECT * FROM skill_nodes ORDER BY type, name`)).rows as any[];
    const edges = (await db.execute(sql`SELECT * FROM skill_edges`)).rows as any[];

    const issues: Array<{ severity: string; node_id: string; name: string; type: string; reason: string }> = [];

    for (const n of nodes) {
      const totalDegree = (n.degree_in ?? 0) + (n.degree_out ?? 0);
      if (totalDegree === 0) {
        issues.push({ severity: "critical", node_id: n.node_id, name: n.name, type: n.type, reason: "Orphan node — no connections (complaint unreachable or rule never triggered)" });
      } else if (n.type === "complaint" && (n.degree_out ?? 0) < 3) {
        issues.push({ severity: "high", node_id: n.node_id, name: n.name, type: n.type, reason: `Sparse complaint — only ${n.degree_out} outgoing edges (very few skills/rules)` });
      } else if (n.type === "modifier" && (n.degree_in ?? 0) === 0) {
        issues.push({ severity: "medium", node_id: n.node_id, name: n.name, type: n.type, reason: "Modifier has no incoming connections — may be unreferenced" });
      } else if (n.type === "skill" && (n.degree_in ?? 0) === 0) {
        issues.push({ severity: "medium", node_id: n.node_id, name: n.name, type: n.type, reason: "Skill/question not linked to any complaint" });
      } else if (n.type === "rule" && (n.degree_in ?? 0) === 0) {
        issues.push({ severity: "high", node_id: n.node_id, name: n.name, type: n.type, reason: "Rule node with no incoming complaint — silent/unreachable rule" });
      }
    }

    // Modifier coverage matrix: which complaints have < all modifiers?
    const complaintNodes = nodes.filter(n => n.type === "complaint");
    const modifierNodes = nodes.filter(n => n.type === "modifier");
    const edgeSet = new Set(edges.map(e => `${e.from_node}|${e.to_node}`));

    const modifierMatrix = complaintNodes.map(c => {
      const covered = modifierNodes.filter(m => edgeSet.has(`${c.node_id}|${m.node_id}`));
      return {
        complaint: c.node_id,
        complaint_name: c.name,
        system: c.system,
        modifiers_covered: covered.length,
        total_modifiers: modifierNodes.length,
        pct: modifierNodes.length > 0 ? Math.round(covered.length / modifierNodes.length * 100) : 100,
        missing: modifierNodes.filter(m => !edgeSet.has(`${c.node_id}|${m.node_id}`)).map(m => m.name),
      };
    });

    const orphans = issues.filter(i => i.severity === "critical").length;
    const weakNodes = issues.filter(i => i.severity === "high").length;

    res.json({
      ok: true,
      summary: {
        total_nodes: nodes.length,
        total_edges: edges.length,
        orphans,
        weak_nodes: weakNodes,
        coverage_score: nodes.length > 0 ? Math.round((1 - orphans / nodes.length) * 100) : 100,
      },
      issues,
      modifier_matrix: modifierMatrix,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET stats ────────────────────────────────────────────────────────────────
router.get("/skill-graph/stats", async (_req, res) => {
  try {
    const nodeCount = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM skill_nodes`)).rows as any[])[0]?.cnt ?? 0;
    const edgeCount = ((await db.execute(sql`SELECT COUNT(*)::int cnt FROM skill_edges`)).rows as any[])[0]?.cnt ?? 0;
    const byType = (await db.execute(sql`
      SELECT type, COUNT(*)::int cnt FROM skill_nodes GROUP BY type ORDER BY cnt DESC
    `)).rows as any[];
    const byRel = (await db.execute(sql`
      SELECT relationship, COUNT(*)::int cnt FROM skill_edges GROUP BY relationship ORDER BY cnt DESC
    `)).rows as any[];
    const built = nodeCount > 0;
    res.json({ ok: true, built, nodeCount, edgeCount, byType, byRel });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

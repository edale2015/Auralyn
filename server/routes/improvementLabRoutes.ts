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

// ── POST /api/improvement/ingest ──────────────────────────────────────────────
// Paste guideline text → GPT-4o extracts clinical rules → saved to DB
router.post("/ingest", async (req: Request, res: Response) => {
  try {
    const { title, content, source = "manual", complaint } = req.body;
    if (!content || content.trim().length < 20) {
      return res.status(400).json({ error: "content is required (min 20 chars)" });
    }

    const prompt = `You are a senior clinical informatics expert. Extract structured clinical decision rules from the following medical guideline text.

Guideline Text:
"""
${content.slice(0, 4000)}
"""
${complaint ? `Focus on rules relevant to complaint: "${complaint}"` : ""}

Return a JSON object with this structure:
{
  "rules": [
    {
      "complaint": "the_complaint_id (snake_case, e.g. sore_throat)",
      "recommendation": "specific clinical action or rule",
      "rationale": "evidence-based reasoning",
      "rule_type": "add_question | add_red_flag | add_treatment | safety_check | screening",
      "confidence": 0.0-1.0
    }
  ],
  "summary": "one-sentence summary of the guideline"
}

Extract 4-10 specific, actionable rules. Be precise.`;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1500,
    });

    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");

    // Save document
    const docResult = await db.execute(sql`
      INSERT INTO guideline_documents (source, title, content, parsed)
      VALUES (${source}, ${title ?? "Untitled Guideline"}, ${content}, ${JSON.stringify(parsed)}::jsonb)
      RETURNING id
    `);
    const docId = ((docResult.rows ?? docResult) as any[])[0]?.id;

    // Save recommendations
    const rules = parsed.rules ?? [];
    let saved = 0;
    for (const rule of rules) {
      await db.execute(sql`
        INSERT INTO guideline_recommendations (document_id, complaint, recommendation, rationale, rule_type, confidence)
        VALUES (${docId}, ${rule.complaint ?? complaint ?? "general"}, ${rule.recommendation}, ${rule.rationale ?? ""}, ${rule.rule_type ?? "general"}, ${rule.confidence ?? 0.75})
      `);
      saved++;
    }

    return res.json({ ok: true, documentId: docId, rulesExtracted: saved, summary: parsed.summary, rules });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ── GET /api/improvement/guidelines ──────────────────────────────────────────
router.get("/guidelines", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT gd.id, gd.source, gd.title, gd.status, gd.created_at,
             COUNT(gr.id)::int AS recommendation_count,
             COUNT(CASE WHEN gr.status = 'approved' THEN 1 END)::int AS approved_count,
             COUNT(CASE WHEN gr.status = 'pending' THEN 1 END)::int AS pending_count
      FROM guideline_documents gd
      LEFT JOIN guideline_recommendations gr ON gr.document_id = gd.id
      GROUP BY gd.id ORDER BY gd.created_at DESC
    `);
    res.json({ ok: true, guidelines: (result.rows ?? result) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/improvement/pubmed/search ───────────────────────────────────────
router.post("/pubmed/search", async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query is required" });

    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=8&term=${encodeURIComponent(query)}&sort=relevance`;
    const searchRes = await fetch(searchUrl).then(r => r.json()) as any;
    const ids: string[] = searchRes.esearchresult?.idlist?.slice(0, 8) ?? [];

    if (ids.length === 0) return res.json({ ok: true, articles: [], message: "No results" });

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}`;
    const xmlText = await fetch(summaryUrl).then(r => r.text());

    // Parse titles and abstracts from XML using simple regex
    const articles: any[] = ids.map((pmid, i) => {
      const titleMatch = xmlText.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/g);
      const abstractMatch = xmlText.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
      const journalMatch = xmlText.match(/<Title>([\s\S]*?)<\/Title>/g);

      const title = titleMatch?.[i]?.replace(/<[^>]+>/g, "").trim() ?? `PubMed Article ${pmid}`;
      const abstract = abstractMatch?.[i]?.replace(/<[^>]+>/g, "").trim() ?? "";
      const journal = journalMatch?.[i]?.replace(/<[^>]+>/g, "").trim() ?? "";

      return { pmid, title: title.slice(0, 300), abstract: abstract.slice(0, 2000), journal };
    });

    return res.json({ ok: true, articles, total: ids.length });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ── POST /api/improvement/pubmed/ingest ───────────────────────────────────────
router.post("/pubmed/ingest", async (req: Request, res: Response) => {
  try {
    const { pmid, title, abstract, journal, complaint } = req.body;
    if (!pmid || !abstract) return res.status(400).json({ error: "pmid and abstract are required" });

    // Check if already ingested
    const existing = await db.execute(sql`SELECT id, ingested FROM pubmed_articles WHERE pmid = ${pmid}`);
    const existingRow = ((existing.rows ?? existing) as any[])[0];
    if (existingRow?.ingested) {
      return res.json({ ok: true, message: "Already ingested", pmid });
    }

    // GPT-4o extract rules from abstract
    const prompt = `Extract clinical decision rules from this PubMed abstract. Return JSON:
{ "rules": [{ "complaint": "snake_case", "recommendation": "...", "rationale": "...", "rule_type": "add_question|add_red_flag|add_treatment|safety_check|screening", "confidence": 0.0-1.0 }], "summary": "..." }

Abstract: ${abstract.slice(0, 2000)}`;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");

    // Save article
    if (existingRow) {
      await db.execute(sql`UPDATE pubmed_articles SET ingested = TRUE, parsed = ${JSON.stringify(parsed)}::jsonb WHERE pmid = ${pmid}`);
    } else {
      await db.execute(sql`
        INSERT INTO pubmed_articles (pmid, title, abstract, journal, parsed, ingested)
        VALUES (${pmid}, ${title ?? ""}, ${abstract}, ${journal ?? ""}, ${JSON.stringify(parsed)}::jsonb, TRUE)
        ON CONFLICT (pmid) DO UPDATE SET ingested = TRUE, parsed = ${JSON.stringify(parsed)}::jsonb
      `);
    }

    // Save as guideline document
    const docResult = await db.execute(sql`
      INSERT INTO guideline_documents (source, title, content, parsed)
      VALUES ('pubmed', ${title ?? `PubMed: ${pmid}`}, ${abstract}, ${JSON.stringify(parsed)}::jsonb)
      RETURNING id
    `);
    const docId = ((docResult.rows ?? docResult) as any[])[0]?.id;

    const rules = parsed.rules ?? [];
    for (const rule of rules) {
      await db.execute(sql`
        INSERT INTO guideline_recommendations (document_id, complaint, recommendation, rationale, rule_type, confidence)
        VALUES (${docId}, ${rule.complaint ?? complaint ?? "general"}, ${rule.recommendation}, ${rule.rationale ?? ""}, ${rule.rule_type ?? "general"}, ${rule.confidence ?? 0.75})
      `);
    }

    return res.json({ ok: true, pmid, rulesExtracted: rules.length, summary: parsed.summary });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ── GET /api/improvement/recommendations ──────────────────────────────────────
router.get("/recommendations", async (req: Request, res: Response) => {
  try {
    const { status, complaint } = req.query;
    const result = await db.execute(sql`
      SELECT gr.*, gd.title AS document_title, gd.source
      FROM guideline_recommendations gr
      LEFT JOIN guideline_documents gd ON gd.id = gr.document_id
      WHERE TRUE
        ${status ? sql`AND gr.status = ${status as string}` : sql``}
        ${complaint ? sql`AND gr.complaint = ${complaint as string}` : sql``}
      ORDER BY gr.created_at DESC LIMIT 100
    `);
    res.json({ ok: true, recommendations: (result.rows ?? result) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/improvement/recommendations/:id/review ──────────────────────────
router.post("/recommendations/:id/review", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewer = "physician", decision, notes, modifiedText } = req.body;
    if (!decision || !["approve", "reject", "modify"].includes(decision)) {
      return res.status(400).json({ error: "decision must be approve | reject | modify" });
    }

    // Update recommendation status
    const newStatus = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "modified";
    await db.execute(sql`UPDATE guideline_recommendations SET status = ${newStatus} WHERE id = ${parseInt(id)}`);

    // Save peer review record
    await db.execute(sql`
      INSERT INTO peer_reviews (recommendation_id, reviewer, decision, notes, modified_text)
      VALUES (${parseInt(id)}, ${reviewer}, ${decision}, ${notes ?? ""}, ${modifiedText ?? null})
    `);

    // If approved → queue into kb_knowledge_changes
    if (decision === "approve" || decision === "modify") {
      const rec = await db.execute(sql`SELECT * FROM guideline_recommendations WHERE id = ${parseInt(id)}`);
      const r = ((rec.rows ?? rec) as any[])[0];
      if (r) {
        const changeId = `GL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const newValJson = JSON.stringify({ recommendation: modifiedText ?? r.recommendation, confidence: r.confidence });
        await db.execute(sql`
          INSERT INTO kb_knowledge_changes (change_id, domain, record_id, action, changed_by, new_value, rationale, status)
          VALUES (
            ${changeId}, ${r.rule_type ?? "guideline"}, ${r.complaint ?? "general"}, 'create', 
            ${"guideline_engine:" + reviewer},
            ${sql.raw(`'${newValJson.replace(/'/g, "''")}'::jsonb`)},
            ${r.rationale ?? "From guideline ingestion"},
            'pending'
          )
        `);
      }
    }

    return res.json({ ok: true, decision, newStatus });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ── GET /api/improvement/compare?complaint=sore_throat ────────────────────────
router.get("/compare", async (req: Request, res: Response) => {
  try {
    const { complaint } = req.query;
    if (!complaint) return res.status(400).json({ error: "complaint is required" });

    // Get existing KB rules for this complaint
    const kbRules = await db.execute(sql`
      SELECT 'red_flag' AS type, label AS description FROM kb_red_flag_rules WHERE complaint_id = ${complaint as string} AND active
      UNION ALL
      SELECT 'question' AS type, prompt AS description FROM kb_questions WHERE complaint_id = ${complaint as string} AND active
      UNION ALL
      SELECT 'treatment' AS type, medication_name AS description FROM kb_treatment_rules WHERE complaint_id = ${complaint as string}
    `);
    const kbList = ((kbRules.rows ?? kbRules) as any[]).map(r => r.description?.toLowerCase() ?? "");

    // Get guideline recommendations for this complaint
    const glRecs = await db.execute(sql`
      SELECT gr.id, gr.recommendation, gr.rationale, gr.rule_type, gr.confidence, gr.status, gd.source, gd.title AS document_title
      FROM guideline_recommendations gr
      LEFT JOIN guideline_documents gd ON gd.id = gr.document_id
      WHERE gr.complaint = ${complaint as string}
      ORDER BY gr.confidence DESC
    `);
    const glList = ((glRecs.rows ?? glRecs) as any[]);

    // Compute gaps
    const gaps = glList.filter(g => {
      const rec = g.recommendation?.toLowerCase() ?? "";
      return !kbList.some(k => k.includes(rec.slice(0, 20)) || rec.includes(k.slice(0, 20)));
    });

    const covered = glList.filter(g => !gaps.find(gap => gap.id === g.id));

    return res.json({
      ok: true,
      complaint,
      kbRuleCount: kbList.length,
      guidelineRecommendations: glList.length,
      gaps,
      covered,
      coveragePct: glList.length > 0 ? Math.round((covered.length / glList.length) * 100) : 100,
    });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ── GET /api/improvement/peer-reviews ─────────────────────────────────────────
router.get("/peer-reviews", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT pr.*, gr.recommendation, gr.complaint, gr.rule_type, gr.confidence
      FROM peer_reviews pr
      LEFT JOIN guideline_recommendations gr ON gr.id = pr.recommendation_id
      ORDER BY pr.created_at DESC LIMIT 50
    `);
    res.json({ ok: true, reviews: (result.rows ?? result) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/improvement/boards ───────────────────────────────────────────────
router.get("/boards", async (_req: Request, res: Response) => {
  try {
    // Group recommendations by system (via kb_complaints join)
    const result = await db.execute(sql`
      SELECT kc.system AS specialty,
             COUNT(gr.id)::int AS total,
             COUNT(CASE WHEN gr.status = 'pending' THEN 1 END)::int AS pending,
             COUNT(CASE WHEN gr.status = 'approved' THEN 1 END)::int AS approved,
             COUNT(CASE WHEN gr.status = 'rejected' THEN 1 END)::int AS rejected,
             COUNT(CASE WHEN gr.status = 'modified' THEN 1 END)::int AS modified,
             MAX(gr.confidence) AS max_confidence
      FROM guideline_recommendations gr
      LEFT JOIN kb_complaints kc ON kc.complaint_id = gr.complaint
      GROUP BY kc.system
      ORDER BY pending DESC, total DESC
    `);
    res.json({ ok: true, boards: (result.rows ?? result) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/improvement/evidence-scores ──────────────────────────────────────
router.get("/evidence-scores", async (_req: Request, res: Response) => {
  try {
    // Combine guideline confidence with KB diagnosis rules base_probability
    const result = await db.execute(sql`
      SELECT gr.complaint,
             gr.rule_type,
             AVG(gr.confidence)::numeric(5,3) AS avg_confidence,
             COUNT(gr.id)::int AS guideline_count,
             kdr.base_probability AS kb_base_prob,
             kdr.diagnosis_label AS diagnosis
      FROM guideline_recommendations gr
      LEFT JOIN kb_diagnosis_rules kdr ON kdr.complaint_id = gr.complaint
      WHERE gr.status != 'rejected'
      GROUP BY gr.complaint, gr.rule_type, kdr.base_probability, kdr.diagnosis_label
      ORDER BY avg_confidence DESC LIMIT 50
    `);
    res.json({ ok: true, scores: (result.rows ?? result) as any[] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/improvement/stats ────────────────────────────────────────────────
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const docs     = await db.execute(sql`SELECT COUNT(*)::int cnt FROM guideline_documents`);
    const recs     = await db.execute(sql`SELECT COUNT(*)::int cnt, COUNT(CASE WHEN status='approved' THEN 1 END)::int approved, COUNT(CASE WHEN status='pending' THEN 1 END)::int pending FROM guideline_recommendations`);
    const reviews  = await db.execute(sql`SELECT COUNT(*)::int cnt FROM peer_reviews`);
    const articles = await db.execute(sql`SELECT COUNT(*)::int cnt FROM pubmed_articles`);

    const d = ((docs.rows ?? docs) as any[])[0];
    const r = ((recs.rows ?? recs) as any[])[0];
    const rv = ((reviews.rows ?? reviews) as any[])[0];
    const a = ((articles.rows ?? articles) as any[])[0];

    res.json({
      ok: true,
      guidelines: d?.cnt ?? 0,
      recommendations: r?.cnt ?? 0,
      approved: r?.approved ?? 0,
      pending: r?.pending ?? 0,
      peerReviews: rv?.cnt ?? 0,
      pubmedArticles: a?.cnt ?? 0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

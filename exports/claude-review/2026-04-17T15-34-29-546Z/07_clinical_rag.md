# Clinical RAG Copilot — KB-Grounded Answers

## Review Prompt

This KB-grounded clinical answer system must NEVER influence final disposition.
Review for:
  - Any pathway where RAG output could leak into disposition decisions
  - False confidence signals from the uncertainty layer
  - Weak grounding logic (hallucinated citations or unsupported claims)
  - Missing physician review gate enforcement
  - Audit trail completeness for regulatory purposes

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.
Be specific. Do not give generic advice. Focus on real-world clinical risk.

### server/ai/clinicalRagGrounding.ts

```ts
/**
 * Clinical RAG Grounding.
 *
 * Retrieval-Augmented Generation strictly limited to the clinical
 * knowledge base.  No general model memory is used — if the KB has
 * no relevant entries the answer explicitly states this.
 *
 * Safety boundary:
 *   kbOnly: true  — this module never sets patient disposition.
 */

import { searchClinicalKnowledge, ClinicalKnowledgeRow } from "../services/clinicalKnowledgeService";

const LOW_CONFIDENCE_THRESHOLD = 60;

export interface GroundedAnswerSource {
  id:        number;
  title:     string;
  content:   string;
  category:  string;
  source:    string;
  updatedAt: Date | null;
}

export interface GroundedAnswer {
  answer:                string;
  sources:               GroundedAnswerSource[];
  confidenceScore:       number;
  needsPhysicianReview:  boolean;
  rawQuery:              string;
  kbOnly:                true;   // always true — enforced at type level
}

// ─── Confidence scoring ────────────────────────────────────────────────────

function scoreConfidence(query: string, sources: ClinicalKnowledgeRow[]): number {
  if (!sources.length) return 10;

  let score = 40;

  // More sources → higher confidence, capped at 25 pts
  score += Math.min(25, sources.length * 8);

  // Term overlap with top result
  const qTokens = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const topText = `${sources[0].title} ${sources[0].content}`.toLowerCase();
  const overlap = [...qTokens].filter((t) => topText.includes(t)).length;
  score += Math.min(20, overlap * 4);

  // Recency bonus
  const newest  = sources[0]?.updatedAt ? new Date(sources[0].updatedAt).getTime() : 0;
  const ageDays = newest ? (Date.now() - newest) / 86_400_000 : 9999;
  if (ageDays <= 180) score += 10;
  else if (ageDays <= 365) score += 5;

  return Math.max(0, Math.min(100, score));
}

// ─── Answer builder ────────────────────────────────────────────────────────

function buildGroundedAnswer(
  query:           string,
  sources:         ClinicalKnowledgeRow[],
  confidenceScore: number,
): string {
  if (!sources.length) {
    return [
      "No sufficiently relevant clinical knowledge base entries were found for this query.",
      "This system does not answer from general model memory.",
      "Please verify using a primary source or request physician review.",
    ].join(" ");
  }

  const cited = sources.map(
    (s, i) =>
      `Source ${i + 1}: ${s.title} (${s.source}${
        s.updatedAt ? `, updated ${new Date(s.updatedAt).toISOString().slice(0, 10)}` : ""
      })`,
  );

  const excerpts = sources.map((s, i) => `Source ${i + 1}: ${s.content.slice(0, 500)}`);

  const confidenceNote =
    confidenceScore < LOW_CONFIDENCE_THRESHOLD
      ? "Confidence is limited. Review the cited sources carefully; physician verification is required."
      : "This answer is grounded in the cited knowledge base sources.";

  return [`Query: ${query}`, confidenceNote, ...cited, "", "Grounded summary:", ...excerpts].join("\n");
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Retrieve a KB-grounded answer for a clinical query.
 * Never falls back to general LLM memory.
 */
export async function getGroundedAnswer(query: string): Promise<GroundedAnswer> {
  const sources        = await searchClinicalKnowledge(query);
  const confidenceScore = scoreConfidence(query, sources);
  const answer          = buildGroundedAnswer(query, sources, confidenceScore);

  return {
    answer,
    sources:              sources as GroundedAnswerSource[],
    confidenceScore,
    needsPhysicianReview: confidenceScore < LOW_CONFIDENCE_THRESHOLD,
    rawQuery:             query,
    kbOnly:               true,
  };
}
```

### server/ai/uncertaintySignaling.ts

```ts
/**
 * Uncertainty signaling — annotates grounded answers with a traffic-light
 * confidence signal before they are surfaced to clinicians.
 *
 * HIGH   (green)  — well supported, low hedge language, recent sources
 * MEDIUM (yellow) — partial support or moderate hedging
 * LOW    (red)    — insufficient support; physician verification mandatory
 */

import { GroundedAnswer } from "./clinicalRagGrounding";

export type UncertaintyLevel    = "HIGH" | "MEDIUM" | "LOW";
export type TrafficLightColor   = "green" | "yellow" | "red";

export interface UncertaintySignal {
  level:                UncertaintyLevel;
  color:                TrafficLightColor;
  label:                string;
  warningText:          string | null;
  annotatedAnswer:      string;
  confidenceScore:      number;
  hedgeWordsFound:      string[];
  needsPhysicianReview: boolean;
  sourceCount:          number;
}

const HEDGE_PHRASES = [
  "may be", "might be", "possibly", "unclear", "could be",
  "typically", "usually", "not explicitly stated",
  "cannot confirm", "unable to confirm", "no sufficiently relevant",
];

function detectHedgeWords(text: string): string[] {
  const lower = text.toLowerCase();
  return HEDGE_PHRASES.filter((p) => lower.includes(p));
}

function computeLevel(
  confidenceScore: number,
  hedgeWords:      string[],
  sourceCount:     number,
): UncertaintyLevel {
  const adjusted = confidenceScore - hedgeWords.length * 6 - (sourceCount === 0 ? 35 : 0);
  if (adjusted >= 70) return "HIGH";
  if (adjusted >= 45) return "MEDIUM";
  return "LOW";
}

type LevelConfig = {
  color:       TrafficLightColor;
  label:       string;
  warningText: string | null;
  prefix:      string | null;
};

const LEVEL_CONFIG: Record<UncertaintyLevel, LevelConfig> = {
  HIGH: {
    color:       "green",
    label:       "Grounded in knowledge base",
    warningText: null,
    prefix:      null,
  },
  MEDIUM: {
    color:       "yellow",
    label:       "Partially supported — review sources",
    warningText: "Moderate confidence. Review sources before clinical use.",
    prefix:      "⚠️ MODERATE CONFIDENCE: This answer is only partially supported by the knowledge base.",
  },
  LOW: {
    color:       "red",
    label:       "Low confidence — physician verification required",
    warningText: "Low confidence. Do not use clinically without physician review.",
    prefix:      "🚨 LOW CONFIDENCE: This answer is not adequately supported for clinical use without physician review.",
  },
};

/**
 * Annotate a grounded answer with an uncertainty signal.
 */
export function annotateWithUncertainty(groundedAnswer: GroundedAnswer): UncertaintySignal {
  const hedgeWordsFound = detectHedgeWords(groundedAnswer.answer);
  const sourceCount     = groundedAnswer.sources.length;
  const level           = computeLevel(groundedAnswer.confidenceScore, hedgeWordsFound, sourceCount);
  const config          = LEVEL_CONFIG[level];

  const annotatedAnswer = config.prefix
    ? `${config.prefix}\n\n---\n\n${groundedAnswer.answer}`
    : groundedAnswer.answer;

  return {
    level,
    color:                config.color,
    label:                config.label,
    warningText:          config.warningText,
    annotatedAnswer,
    confidenceScore:      groundedAnswer.confidenceScore,
    hedgeWordsFound,
    needsPhysicianReview: groundedAnswer.needsPhysicianReview || level !== "HIGH",
    sourceCount,
  };
}

/**
 * Format for the control tower dashboard API response.
 */
export function formatForDashboard(signal: UncertaintySignal, rawQuery: string) {
  return {
    query:    rawQuery,
    answer:   signal.annotatedAnswer,
    confidence: {
      score: signal.confidenceScore,
      level: signal.level,
      color: signal.color,
      label: signal.label,
    },
    warning:              signal.warningText,
    needsPhysicianReview: signal.needsPhysicianReview,
    sources:              { count: signal.sourceCount },
    metadata: {
      hedgeWordsDetected: signal.hedgeWordsFound.length,
      generatedAt:        new Date().toISOString(),
    },
  };
}
```

### server/routes/clinicalAnswerRoute.ts

```ts
/**
 * Clinical Answer Route — knowledge-base-grounded clinical query assistant.
 *
 * SAFETY BOUNDARY:
 *   • kbOnly: true  — this endpoint NEVER sets patient disposition
 *   • All LOW/MEDIUM confidence answers are queued for physician review
 *   • Every answer is audited with a SHA-256 tamper-evident hash
 *
 * POST /api/clinical-answer
 * GET  /api/clinical-answer/review-queue
 * POST /api/clinical-answer/review-decision
 */

import { Router }                    from "express";
import { getGroundedAnswer }         from "../ai/clinicalRagGrounding";
import { annotateWithUncertainty, formatForDashboard } from "../ai/uncertaintySignaling";
import { queueForReview, getPendingReviews, submitReviewDecision } from "../services/physicianReviewGate";
import { logClinicalAnswerAudit }    from "../services/clinicalAnswerAuditService";
import { requirePhysician }          from "../auth/requirePhysician";

const router = Router();

// ─── POST /api/clinical-answer ─────────────────────────────────────────────

router.post("/api/clinical-answer", requirePhysician, async (req, res) => {
  const { query, requestedBy, patientContextId } = req.body ?? {};

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const groundedAnswer = await getGroundedAnswer(query.trim());
    const signal         = annotateWithUncertainty(groundedAnswer);
    const formatted      = formatForDashboard(signal, query.trim());

    let reviewQueueId: number | null = null;

    if (signal.needsPhysicianReview) {
      reviewQueueId = await queueForReview({
        query:           query.trim(),
        proposedAnswer:  signal.annotatedAnswer,
        confidenceScore: signal.confidenceScore,
        confidenceLevel: signal.level,
        sourceCount:     signal.sourceCount,
        hedgeCount:      signal.hedgeWordsFound.length,
        patientContextId: patientContextId ?? undefined,
        requestedBy:     requestedBy ?? undefined,
      });
    }

    const auditPayload = {
      query:           query.trim(),
      confidenceLevel: signal.level,
      confidenceScore: signal.confidenceScore,
      sourceCount:     signal.sourceCount,
      needsPhysicianReview: signal.needsPhysicianReview,
      reviewQueueId,
      requestedBy:     requestedBy ?? null,
      patientContextId: patientContextId ?? null,
      boundary:        { kbOnly: true, canSetDisposition: false },
      ts:              new Date().toISOString(),
    };

    await logClinicalAnswerAudit(auditPayload);

    return res.json({
      ...formatted,
      reviewQueueId,
      boundary: { kbOnly: true, canSetDisposition: false },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
});

// ─── GET /api/clinical-answer/review-queue ─────────────────────────────────

router.get("/api/clinical-answer/review-queue", requirePhysician, async (_req, res) => {
  try {
    const items = await getPendingReviews();
    return res.json({ ok: true, items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ ok: false, error: msg });
  }
});

// ─── POST /api/clinical-answer/review-decision ─────────────────────────────

router.post("/api/clinical-answer/review-decision", requirePhysician, async (req, res) => {
  const { reviewId, decision, physicianId, note, finalAnswer } = req.body ?? {};

  if (!reviewId || !decision || !physicianId) {
    return res.status(400).json({ error: "reviewId, decision, and physicianId are required" });
  }

  const valid = ["approved", "overridden", "rejected"];
  if (!valid.includes(decision)) {
    return res.status(400).json({ error: `decision must be one of: ${valid.join(", ")}` });
  }

  try {
    await submitReviewDecision({
      reviewId:    Number(reviewId),
      decision,
      physicianId,
      note:        note ?? null,
      finalAnswer: finalAnswer ?? null,
    });

    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
```

### server/services/clinicalKnowledgeService.ts

```ts
/**
 * Clinical knowledge base service.
 *
 * Full-text search over the `clinical_knowledge` table using
 * PostgreSQL's tsvector / tsquery.  Results are ordered by
 * recency and returned capped at 5 entries.
 */

import { db }  from "../db";
import { sql } from "drizzle-orm";

export type ClinicalKnowledgeRow = {
  id:        number;
  title:     string;
  content:   string;
  category:  string;
  source:    string;
  updatedAt: Date | null;
};

/**
 * Search the clinical knowledge base using full-text search.
 * Returns up to 5 ranked results.
 */
export async function searchClinicalKnowledge(
  query: string,
): Promise<ClinicalKnowledgeRow[]> {
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t.replace(/[^a-z0-9]/gi, "")}:*`)
    .join(" & ");

  if (!tsQuery) return [];

  const rows = await db.execute(sql`
    SELECT
      id,
      title,
      content,
      category,
      source,
      updated_at AS "updatedAt"
    FROM clinical_knowledge
    WHERE to_tsvector('english', title || ' ' || content)
      @@ to_tsquery('english', ${tsQuery})
    ORDER BY updated_at DESC
    LIMIT 5
  `);

  return rows.rows as ClinicalKnowledgeRow[];
}

/**
 * Insert a new knowledge base entry.
 */
export async function insertKnowledgeEntry(entry: {
  title:    string;
  content:  string;
  category: string;
  source:   string;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO clinical_knowledge (title, content, category, source)
    VALUES (${entry.title}, ${entry.content}, ${entry.category}, ${entry.source})
  `);
}
```

### server/services/clinicalAnswerAuditService.ts

```ts
/**
 * Clinical answer audit service.
 *
 * Every answer served by clinicalRagGrounding is logged here with a
 * SHA-256 content hash as the primary key, making the log tamper-evident.
 */

import crypto from "crypto";
import { db }  from "../db";
import { sql } from "drizzle-orm";

/**
 * Persist an audit record.  Returns the SHA-256 hash used as the record ID.
 */
export async function logClinicalAnswerAudit(payload: unknown): Promise<string> {
  const id = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  await db.execute(sql`
    INSERT INTO clinical_answer_audit (id, payload)
    VALUES (${id}, ${JSON.stringify(payload)})
    ON CONFLICT (id) DO NOTHING
  `);

  return id;
}
```

### server/services/physicianReviewGate.ts

```ts
/**
 * Physician review gate.
 *
 * All clinical answers below the HIGH-confidence threshold are queued
 * for physician review before they may be acted upon clinically.
 *
 * Uses the `physician_review_queue` table.
 */

import { db }  from "../db";
import { sql } from "drizzle-orm";

export type UncertaintyLevel = "HIGH" | "MEDIUM" | "LOW";
export type ReviewDecision   = "approved" | "overridden" | "rejected";

export interface ReviewQueueItem {
  query:            string;
  proposedAnswer:   string;
  confidenceScore:  number;
  confidenceLevel:  UncertaintyLevel;
  sourceCount:      number;
  hedgeCount:       number;
  patientContextId?: string;
  requestedBy?:     string;
}

/**
 * Enqueue an answer for physician review.
 * Returns the newly created row id.
 */
export async function queueForReview(item: ReviewQueueItem): Promise<number> {
  const rows = await db.execute(sql`
    INSERT INTO physician_review_queue
      (query, proposed_answer, confidence_score, confidence_level,
       source_count, hedge_word_count, patient_context_id, requested_by, status)
    VALUES
      (${item.query}, ${item.proposedAnswer}, ${item.confidenceScore},
       ${item.confidenceLevel}, ${item.sourceCount}, ${item.hedgeCount},
       ${item.patientContextId ?? null}, ${item.requestedBy ?? null}, 'pending')
    RETURNING id
  `);

  return (rows.rows[0] as { id: number }).id;
}

/**
 * Fetch all pending reviews, sorted by urgency (LOW confidence first).
 */
export async function getPendingReviews(): Promise<unknown[]> {
  const rows = await db.execute(sql`
    SELECT *
    FROM physician_review_queue
    WHERE status = 'pending'
    ORDER BY
      CASE confidence_level
        WHEN 'LOW'    THEN 1
        WHEN 'MEDIUM' THEN 2
        WHEN 'HIGH'   THEN 3
      END,
      created_at ASC
  `);

  return rows.rows;
}

/**
 * Submit a physician decision on a queued item.
 */
export async function submitReviewDecision(args: {
  reviewId:    number;
  decision:    ReviewDecision;
  physicianId: string;
  note?:       string | null;
  finalAnswer?: string | null;
}): Promise<void> {
  await db.execute(sql`
    UPDATE physician_review_queue
    SET
      status       = ${args.decision},
      reviewed_by  = ${args.physicianId},
      review_note  = ${args.note ?? null},
      final_answer = ${args.finalAnswer ?? null},
      reviewed_at  = NOW()
    WHERE id = ${args.reviewId}
  `);
}
```

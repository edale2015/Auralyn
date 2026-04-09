/**
 * Upgrade 1 — Selector Confidence Scoring
 *
 * Every time a selector is attempted during replay or healing, the outcome
 * (success or failure) is recorded here. Over time this builds a confidence
 * signal: selectors with a low success rate are flagged for AI regeneration
 * or template repair.
 *
 * Schema: selector_scores (template_key, selector, attempts, successes,
 *         last_attempt_at, last_success_at)  — PK: (template_key, selector)
 *
 * Confidence score = successes / attempts  (0.0 – 1.0)
 * A score below CONFIDENCE_THRESHOLD with enough attempts triggers repair.
 */

import { query } from "../db";

export const CONFIDENCE_THRESHOLD = 0.5;
export const MIN_ATTEMPTS_FOR_SIGNAL = 3;

// ── Record a result ───────────────────────────────────────────────────────────

export async function recordSelectorResult(
  templateKey: string,
  selector:    string,
  success:     boolean
): Promise<void> {
  await query(
    `INSERT INTO selector_scores
       (template_key, selector, attempts, successes, last_attempt_at, last_success_at)
     VALUES ($1, $2, 1, $3, NOW(), $4)
     ON CONFLICT (template_key, selector)
     DO UPDATE SET
       attempts        = selector_scores.attempts + 1,
       successes       = selector_scores.successes + $3,
       last_attempt_at = NOW(),
       last_success_at = CASE WHEN $5 THEN NOW() ELSE selector_scores.last_success_at END`,
    [
      templateKey,
      selector,
      success ? 1 : 0,
      success ? "NOW()" : null,
      success,
    ]
  );
}

// ── Read scores ───────────────────────────────────────────────────────────────

export interface SelectorScore {
  templateKey:    string;
  selector:       string;
  attempts:       number;
  successes:      number;
  confidence:     number;       // successes / attempts, or null if 0 attempts
  lastAttemptAt:  string | null;
  lastSuccessAt:  string | null;
  needsRepair:    boolean;
}

function rowToScore(row: any): SelectorScore {
  const attempts   = Number(row.attempts)  || 0;
  const successes  = Number(row.successes) || 0;
  const confidence = attempts > 0 ? successes / attempts : 1.0;
  return {
    templateKey:   row.template_key,
    selector:      row.selector,
    attempts,
    successes,
    confidence,
    lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    needsRepair:   attempts >= MIN_ATTEMPTS_FOR_SIGNAL && confidence < CONFIDENCE_THRESHOLD,
  };
}

export async function getSelectorScore(
  templateKey: string,
  selector:    string
): Promise<SelectorScore | null> {
  const result = await query(
    `SELECT * FROM selector_scores WHERE template_key = $1 AND selector = $2 LIMIT 1`,
    [templateKey, selector]
  );
  return result.rows[0] ? rowToScore(result.rows[0]) : null;
}

export async function getTemplateScores(templateKey: string): Promise<SelectorScore[]> {
  const result = await query(
    `SELECT * FROM selector_scores WHERE template_key = $1 ORDER BY attempts DESC`,
    [templateKey]
  );
  return result.rows.map(rowToScore);
}

export async function getAllScores(): Promise<SelectorScore[]> {
  const result = await query(
    `SELECT * FROM selector_scores ORDER BY template_key, attempts DESC`
  );
  return result.rows.map(rowToScore);
}

/**
 * Returns selectors that are statistically broken across all templates.
 * Criteria: attempts >= MIN_ATTEMPTS_FOR_SIGNAL AND confidence < CONFIDENCE_THRESHOLD.
 */
export async function getBrokenSelectors(): Promise<SelectorScore[]> {
  const result = await query(
    `SELECT * FROM selector_scores
     WHERE attempts >= $1
       AND (successes::float / NULLIF(attempts, 0)) < $2
     ORDER BY attempts DESC`,
    [MIN_ATTEMPTS_FOR_SIGNAL, CONFIDENCE_THRESHOLD]
  );
  return result.rows.map(rowToScore);
}

/**
 * Sort a list of candidate selectors by their historical confidence for this
 * template (highest confidence first). Unknown selectors are sorted last.
 */
export async function sortCandidatesByScore(
  templateKey: string,
  candidates:  string[]
): Promise<string[]> {
  if (candidates.length === 0) return candidates;

  const rows = await query(
    `SELECT selector, attempts, successes FROM selector_scores
     WHERE template_key = $1 AND selector = ANY($2)`,
    [templateKey, candidates]
  );

  const scoreMap = new Map<string, number>();
  for (const row of rows.rows) {
    const attempts  = Number(row.attempts)  || 0;
    const successes = Number(row.successes) || 0;
    scoreMap.set(row.selector, attempts > 0 ? successes / attempts : 0.5);
  }

  return [...candidates].sort((a, b) => {
    const sa = scoreMap.get(a) ?? 0.5;   // unknown → neutral 0.5
    const sb = scoreMap.get(b) ?? 0.5;
    return sb - sa;                       // highest confidence first
  });
}

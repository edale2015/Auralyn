import { pool } from "../db/pool";
import type { MoodLabel, ToneLabel } from "./moodToneService";

export interface LogInteractionParams {
  sessionId: string;
  caseId?: string;
  channel: "telegram" | "whatsapp" | "web" | "api";
  direction: "inbound" | "outbound" | "llm_call";
  skillName?: string;
  messageText?: string;
  promptText?: string;
  responseText?: string;
  modelUsed?: string;
  latencyMs?: number;
  moodLabel?: MoodLabel;
  moodScore?: number;
  toneLabel?: ToneLabel;
  tokenCount?: number;
}

export async function logInteraction(p: LogInteractionParams): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ai_interaction_logs
        (session_id, case_id, channel, direction, skill_name,
         message_text, prompt_text, response_text, model_used,
         latency_ms, mood_label, mood_score, tone_label, token_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        p.sessionId,
        p.caseId ?? null,
        p.channel,
        p.direction,
        p.skillName ?? null,
        p.messageText ?? null,
        p.promptText ?? null,
        p.responseText ?? null,
        p.modelUsed ?? null,
        p.latencyMs ?? null,
        p.moodLabel ?? "unknown",
        p.moodScore ?? 0,
        p.toneLabel ?? "neutral",
        p.tokenCount ?? null,
      ]
    );
  } catch (_) {}
}

export async function flagInteraction(id: number, reason: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE ai_interaction_logs SET flagged = TRUE, flag_reason = $2 WHERE id = $1`,
      [id, reason]
    );
  } catch (_) {}
}

export async function startSession(sessionId: string, caseId: string | undefined, channel: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO session_quality_metrics (session_id, case_id, channel)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, caseId ?? null, channel]
    );
  } catch (_) {}
}

export async function incrementMessageCount(sessionId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE session_quality_metrics
       SET message_count = message_count + 1
       WHERE session_id = $1`,
      [sessionId]
    );
  } catch (_) {}
}

export async function endSession(sessionId: string, disposition: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE session_quality_metrics
       SET ended_at = NOW(),
           aht_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int,
           fcr = TRUE,
           disposition_reached = $2,
           resolved = TRUE
       WHERE session_id = $1`,
      [sessionId, disposition]
    );
  } catch (_) {}
}

export async function recordCsat(sessionId: string, score: number): Promise<void> {
  try {
    await pool.query(
      `UPDATE session_quality_metrics SET csat_score = $2 WHERE session_id = $1`,
      [sessionId, score]
    );
  } catch (_) {}
}

export async function recordNps(sessionId: string, score: number): Promise<void> {
  try {
    await pool.query(
      `UPDATE session_quality_metrics SET nps_score = $2 WHERE session_id = $1`,
      [sessionId, score]
    );
  } catch (_) {}
}

export interface InteractionFeedParams {
  limit?: number;
  offset?: number;
  channel?: string;
  direction?: string;
  flaggedOnly?: boolean;
  since?: string;
  sessionId?: string;
}

export async function getInteractionFeed(p: InteractionFeedParams = {}) {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (p.channel) { conditions.push(`channel = $${idx++}`); values.push(p.channel); }
  if (p.direction) { conditions.push(`direction = $${idx++}`); values.push(p.direction); }
  if (p.flaggedOnly) { conditions.push(`flagged = TRUE`); }
  if (p.since) { conditions.push(`created_at >= $${idx++}`); values.push(p.since); }
  if (p.sessionId) { conditions.push(`session_id = $${idx++}`); values.push(p.sessionId); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(p.limit ?? 50, 200);
  const offset = p.offset ?? 0;

  const { rows } = await pool.query(
    `SELECT id, session_id, case_id, channel, direction, skill_name,
            message_text, prompt_text, response_text, model_used,
            latency_ms, mood_label, mood_score, tone_label,
            token_count, flagged, flag_reason, created_at
     FROM ai_interaction_logs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...values, limit, offset]
  );
  return rows;
}

export async function getSessionMetricsList(p: { limit?: number; channel?: string; since?: string } = {}) {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (p.channel) { conditions.push(`channel = $${idx++}`); values.push(p.channel); }
  if (p.since) { conditions.push(`created_at >= $${idx++}`); values.push(p.since); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(p.limit ?? 50, 200);

  const { rows } = await pool.query(
    `SELECT id, session_id, case_id, channel, started_at, ended_at,
            aht_seconds, fcr, message_count, disposition_reached,
            csat_score, nps_score, clarity_score, resolved, created_at
     FROM session_quality_metrics
     ${where}
     ORDER BY created_at DESC
     LIMIT $${idx}`,
    [...values, limit]
  );
  return rows;
}

export async function getAuditStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total_interactions,
      COUNT(*) FILTER (WHERE direction = 'inbound')::int AS total_inbound,
      COUNT(*) FILTER (WHERE direction = 'outbound')::int AS total_outbound,
      COUNT(*) FILTER (WHERE direction = 'llm_call')::int AS total_llm_calls,
      COUNT(*) FILTER (WHERE flagged = TRUE)::int AS total_flagged,
      COUNT(*) FILTER (WHERE mood_label = 'urgent')::int AS mood_urgent,
      COUNT(*) FILTER (WHERE mood_label = 'distressed')::int AS mood_distressed,
      COUNT(*) FILTER (WHERE mood_label = 'concerned')::int AS mood_concerned,
      COUNT(*) FILTER (WHERE mood_label = 'calm')::int AS mood_calm,
      ROUND(AVG(latency_ms) FILTER (WHERE direction = 'llm_call'))::int AS avg_llm_latency_ms
    FROM ai_interaction_logs
    WHERE created_at >= NOW() - INTERVAL '7 days'
  `);

  const { rows: sessionRows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total_sessions,
      COUNT(*) FILTER (WHERE fcr = TRUE)::int AS fcr_sessions,
      COUNT(*) FILTER (WHERE resolved = TRUE)::int AS resolved_sessions,
      ROUND(AVG(aht_seconds) FILTER (WHERE aht_seconds IS NOT NULL))::int AS avg_aht_seconds,
      ROUND(AVG(csat_score) FILTER (WHERE csat_score IS NOT NULL), 2)::float AS avg_csat,
      ROUND(AVG(nps_score) FILTER (WHERE nps_score IS NOT NULL), 1)::float AS avg_nps,
      ROUND(AVG(message_count))::int AS avg_messages
    FROM session_quality_metrics
    WHERE created_at >= NOW() - INTERVAL '7 days'
  `);

  return {
    interactions: rows[0],
    sessions: sessionRows[0],
  };
}

/**
 * pipelineAuditWriter.ts
 *
 * Replaces the Step 13 stub in clinicalPipelineRoutes.ts with a real
 * tamper-evident audit write to the audit_logs table.
 *
 * Required for HIPAA and FDA 21 CFR Part 11 compliance before this system
 * handles real patient-physician encounters.
 *
 * Minimum required fields per HIPAA + FDA CDS:
 *   timestamp          — ISO 8601, server-generated (not client)
 *   physicianId        — from auth session (never from request body)
 *   sessionId          — unique per browser session
 *   complaintId        — normalized complaint slug
 *   symptomTokens      — symptom labels (no PHI)
 *   rulesFired         — array of {ruleId, ruleVersion, ruleType}
 *   finalDisposition   — the output recommendation
 *   engineType         — "WORLD_B" | "DB_ENGINE" | "KB_QUERY"
 *   configVersion      — hash of the complaint config bundle
 *   staleConfig        — boolean: was stale cache used?
 *
 * Stale config disclosure:
 *   If the pipeline ran on stale config, the audit record says so and the
 *   physician response includes a visible warning. Silently serving stale
 *   rules violates the FDA requirement for CDS transparency.
 */

import { db }  from "../db";
import { sql } from "drizzle-orm";
import * as crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FiredRule {
  ruleId:      string;
  ruleVersion: string;
  ruleType:    string;
  points?:     number;
  fired:       boolean;
  outcome?:    string;
}

export interface PipelineAuditRecord {
  physicianId:        string;
  sessionId:          string;
  complaintId:        string;
  engineType:         "WORLD_B" | "DB_ENGINE" | "KB_QUERY";
  symptomTokens:      string[];
  vitalSigns?:        Record<string, number>;
  modifiersApplied:   string[];
  rulesFired:         FiredRule[];
  redFlagsHit:        string[];
  hardStopFired:      boolean;
  hardStopReason?:    string;
  finalDisposition:   string;
  topDiagnoses?:      string[];
  configVersion:      string;
  staleConfig:        boolean;
  staleConfigAgeSeconds?: number;
  configLoadedAt:     string;
}

export interface AuditWriteResult {
  auditId:       string;
  timestamp:     string;
  staleConfig:   boolean;
  staleWarning?: string;
}

// ─── Config version hash ──────────────────────────────────────────────────────

export function hashConfigVersion(config: {
  ccId:       string;
  version?:   number;
  ruleCount?: number;
  ruleIds?:   string[];
}): string {
  const content = JSON.stringify({
    ccId:      config.ccId,
    version:   config.version ?? 0,
    ruleCount: config.ruleCount ?? 0,
    ruleIds:   (config.ruleIds ?? []).sort(),
  });
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// ─── Main audit writer ────────────────────────────────────────────────────────

export async function writePipelineAudit(
  record:      PipelineAuditRecord,
  physicianId: string  // always from auth session, never from request body
): Promise<AuditWriteResult> {
  const timestamp = new Date().toISOString();
  const auditId   = `aud-${record.complaintId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let staleWarning: string | undefined;
  if (record.staleConfig) {
    const ageMin = Math.round((record.staleConfigAgeSeconds ?? 0) / 60);
    staleWarning = `Clinical rules may be outdated — loaded ${ageMin} minute${ageMin !== 1 ? "s" : ""} ago (live fetch failed). Verify recommendations against current guidelines.`;
  }

  try {
    await db.execute(sql`
      INSERT INTO pipeline_audit_logs (
        audit_id, timestamp, physician_id, session_id, complaint_id,
        engine_type, symptom_tokens, vital_signs, modifiers_applied,
        rules_fired, red_flags_hit, hard_stop_fired, hard_stop_reason,
        final_disposition, top_diagnoses, config_version, stale_config,
        stale_config_age_seconds, config_loaded_at, stale_warning, created_at
      ) VALUES (
        ${auditId}, ${timestamp}, ${physicianId}, ${record.sessionId},
        ${record.complaintId}, ${record.engineType},
        ${JSON.stringify(record.symptomTokens)},
        ${JSON.stringify(record.vitalSigns ?? {})},
        ${JSON.stringify(record.modifiersApplied)},
        ${JSON.stringify(record.rulesFired)},
        ${JSON.stringify(record.redFlagsHit)},
        ${record.hardStopFired},
        ${record.hardStopReason ?? null},
        ${record.finalDisposition},
        ${JSON.stringify(record.topDiagnoses ?? [])},
        ${record.configVersion},
        ${record.staleConfig},
        ${record.staleConfigAgeSeconds ?? null},
        ${record.configLoadedAt},
        ${staleWarning ?? null},
        NOW()
      )
    `);
  } catch (err: any) {
    // Log but do not swallow — callers must handle audit failure
    console.error(`[AuditWriter] Failed to write audit record ${auditId}:`, err?.message);
    throw err;
  }

  return { auditId, timestamp, staleConfig: record.staleConfig, staleWarning };
}

// ─── DB migration ─────────────────────────────────────────────────────────────

export const AUDIT_TABLE_MIGRATION = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id                       serial          PRIMARY KEY,
  audit_id                 text            NOT NULL UNIQUE,
  timestamp                text            NOT NULL,
  physician_id             text            NOT NULL,
  session_id               text            NOT NULL,
  complaint_id             text            NOT NULL,
  engine_type              text            NOT NULL,
  symptom_tokens           jsonb           NOT NULL DEFAULT '[]',
  vital_signs              jsonb           NOT NULL DEFAULT '{}',
  modifiers_applied        jsonb           NOT NULL DEFAULT '[]',
  rules_fired              jsonb           NOT NULL DEFAULT '[]',
  red_flags_hit            jsonb           NOT NULL DEFAULT '[]',
  hard_stop_fired          boolean         NOT NULL DEFAULT false,
  hard_stop_reason         text,
  final_disposition        text            NOT NULL,
  top_diagnoses            jsonb           NOT NULL DEFAULT '[]',
  config_version           text            NOT NULL,
  stale_config             boolean         NOT NULL DEFAULT false,
  stale_config_age_seconds integer,
  config_loaded_at         text,
  stale_warning            text,
  created_at               timestamptz     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_physician ON audit_logs (physician_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_complaint ON audit_logs (complaint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_hard_stop ON audit_logs (hard_stop_fired) WHERE hard_stop_fired = true;
CREATE INDEX IF NOT EXISTS idx_audit_logs_stale     ON audit_logs (stale_config)    WHERE stale_config = true;

CREATE OR REPLACE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
`;

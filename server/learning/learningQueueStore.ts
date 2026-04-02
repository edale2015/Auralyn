/**
 * Learning Queue Store
 *
 * Stores AI-generated suggestions for clinical logic improvements.
 * Suggestions are NEVER auto-applied — they must pass through the
 * governance approval workflow first.
 *
 * Flow: pending → review → approved → deployed
 *                        ↓
 *                     rejected
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logAuditEvent } from "../governance/changeAuditLog";
import { requiresManualApproval } from "../governance/safetyModes";
import type { SimCaseResult, SimSummaryMetrics } from "../simulation/asyncSimEngine";

export type SuggestionType =
  | "rule_addition"
  | "rule_modification"
  | "weight_adjustment"
  | "modifier_interaction"
  | "medication_change"
  | "dosing_change"
  | "disposition_threshold"
  | "red_flag_addition";

export type SuggestionStatus =
  | "pending"
  | "review"
  | "approved"
  | "rejected"
  | "deployed"
  | "rollback";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface LearningQueueItem {
  id:                  string;
  type:                SuggestionType;
  title:               string;
  description:         string;
  rationale:           string;
  before?:             unknown;
  after?:              unknown;
  affectedComplaints?: string[];
  linkedCases?:        string[];
  linkedSimRunId?:     string;
  confidence:          number;
  riskLevel:           RiskLevel;
  requiresManualApproval: boolean;
  status:              SuggestionStatus;
  createdAt:           number;
  updatedAt:           number;
  reviewedBy?:         string;
  reviewedAt?:         number;
  reviewNote?:         string;
  deployedAt?:         number;
}

const queue = new Map<string, LearningQueueItem>();

// ── DB persistence ──────────────────────────────────────────────────────────

async function ensureLearningQueueTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS learning_queue_items (
      id                       TEXT PRIMARY KEY,
      type                     TEXT NOT NULL,
      title                    TEXT NOT NULL,
      description              TEXT NOT NULL DEFAULT '',
      rationale                TEXT NOT NULL DEFAULT '',
      before_state             JSONB,
      after_state              JSONB,
      affected_complaints      JSONB,
      linked_cases             JSONB,
      linked_sim_run_id        TEXT,
      confidence               DOUBLE PRECISION NOT NULL DEFAULT 0,
      risk_level               TEXT NOT NULL DEFAULT 'low',
      requires_manual_approval BOOLEAN NOT NULL DEFAULT TRUE,
      status                   TEXT NOT NULL DEFAULT 'pending',
      created_at               BIGINT NOT NULL,
      updated_at               BIGINT NOT NULL,
      reviewed_by              TEXT,
      reviewed_at              BIGINT,
      review_note              TEXT,
      deployed_at              BIGINT
    )
  `);
}

async function persistQueueItem(item: LearningQueueItem): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO learning_queue_items (
        id, type, title, description, rationale,
        before_state, after_state, affected_complaints, linked_cases, linked_sim_run_id,
        confidence, risk_level, requires_manual_approval, status,
        created_at, updated_at, reviewed_by, reviewed_at, review_note, deployed_at
      ) VALUES (
        ${item.id}, ${item.type}, ${item.title}, ${item.description}, ${item.rationale},
        CAST(${JSON.stringify(item.before ?? null)} AS jsonb),
        CAST(${JSON.stringify(item.after ?? null)} AS jsonb),
        CAST(${JSON.stringify(item.affectedComplaints ?? null)} AS jsonb),
        CAST(${JSON.stringify(item.linkedCases ?? null)} AS jsonb),
        ${item.linkedSimRunId ?? null},
        ${item.confidence}, ${item.riskLevel}, ${item.requiresManualApproval}, ${item.status},
        ${item.createdAt}, ${item.updatedAt},
        ${item.reviewedBy ?? null}, ${item.reviewedAt ?? null},
        ${item.reviewNote ?? null}, ${item.deployedAt ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        status                   = EXCLUDED.status,
        updated_at               = EXCLUDED.updated_at,
        reviewed_by              = EXCLUDED.reviewed_by,
        reviewed_at              = EXCLUDED.reviewed_at,
        review_note              = EXCLUDED.review_note,
        deployed_at              = EXCLUDED.deployed_at
    `);
  } catch (e: any) {
    console.error("[LearningQueue] DB persist error:", e?.message);
  }
}

async function loadQueueFromDb(): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT * FROM learning_queue_items ORDER BY created_at DESC
    `);
    const rows = (result.rows ?? result) as any[];
    for (const row of rows) {
      const item: LearningQueueItem = {
        id:                     row.id,
        type:                   row.type,
        title:                  row.title,
        description:            row.description,
        rationale:              row.rationale,
        before:                 row.before_state ?? undefined,
        after:                  row.after_state ?? undefined,
        affectedComplaints:     row.affected_complaints ?? undefined,
        linkedCases:            row.linked_cases ?? undefined,
        linkedSimRunId:         row.linked_sim_run_id ?? undefined,
        confidence:             Number(row.confidence),
        riskLevel:              row.risk_level as RiskLevel,
        requiresManualApproval: Boolean(row.requires_manual_approval),
        status:                 row.status as SuggestionStatus,
        createdAt:              Number(row.created_at),
        updatedAt:              Number(row.updated_at),
        reviewedBy:             row.reviewed_by ?? undefined,
        reviewedAt:             row.reviewed_at ? Number(row.reviewed_at) : undefined,
        reviewNote:             row.review_note ?? undefined,
        deployedAt:             row.deployed_at ? Number(row.deployed_at) : undefined,
      };
      queue.set(item.id, item);
    }
    console.log(`[LearningQueue] Loaded ${rows.length} items from DB`);
  } catch (e: any) {
    console.error("[LearningQueue] DB load error:", e?.message);
  }
}

export async function initLearningQueue(): Promise<void> {
  await ensureLearningQueueTable();
  await loadQueueFromDb();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return `lrn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function computeRisk(type: SuggestionType, confidence: number): RiskLevel {
  if (["medication_change", "dosing_change", "red_flag_addition"].includes(type)) return "high";
  if (["rule_addition", "rule_modification"].includes(type)) return confidence < 0.7 ? "medium" : "high";
  if (type === "weight_adjustment" && confidence > 0.85) return "low";
  if (type === "weight_adjustment") return "medium";
  if (type === "modifier_interaction") return "medium";
  return "low";
}

export function addLearningQueueItem(item: Omit<LearningQueueItem, "id" | "createdAt" | "updatedAt" | "requiresManualApproval" | "status">): LearningQueueItem {
  const riskLevel = item.riskLevel ?? computeRisk(item.type, item.confidence);
  const fullItem: LearningQueueItem = {
    ...item,
    id:                     uid(),
    riskLevel,
    requiresManualApproval: requiresManualApproval(item.type),
    status:                 "pending",
    createdAt:              Date.now(),
    updatedAt:              Date.now(),
  };
  queue.set(fullItem.id, fullItem);
  persistQueueItem(fullItem).catch(() => {}); // fire-and-forget DB persistence
  logAuditEvent({
    action:     "suggestion_created",
    source:     "system",
    itemId:     fullItem.id,
    itemType:   item.type,
    after:      { title: item.title, riskLevel, confidence: item.confidence },
    linkedCases: item.linkedCases,
    confidence: item.confidence,
  });
  return fullItem;
}

export function updateSuggestionStatus(
  id: string,
  status: SuggestionStatus,
  reviewedBy?: string,
  reviewNote?: string,
): LearningQueueItem | null {
  const item = queue.get(id);
  if (!item) return null;
  const prev = item.status;
  item.status    = status;
  item.updatedAt = Date.now();
  if (reviewedBy) { item.reviewedBy = reviewedBy; item.reviewedAt = Date.now(); }
  if (reviewNote) item.reviewNote = reviewNote;
  if (status === "deployed") item.deployedAt = Date.now();
  queue.set(id, item);
  persistQueueItem(item).catch(() => {}); // fire-and-forget DB persistence
  const auditAction = status === "approved" ? "suggestion_approved"
    : status === "rejected"  ? "suggestion_rejected"
    : status === "deployed"  ? "suggestion_deployed"
    : status === "rollback"  ? "suggestion_rollback"
    : "suggestion_created";
  logAuditEvent({
    action:   auditAction,
    source:   reviewedBy ? "physician" : "system",
    actor:    reviewedBy,
    itemId:   id,
    itemType: item.type,
    before:   prev,
    after:    status,
    detail:   reviewNote,
    confidence: item.confidence,
  });
  return item;
}

export function listLearningQueue(opts: {
  status?: SuggestionStatus;
  type?: SuggestionType;
  riskLevel?: RiskLevel;
  complaint?: string;
  limit?: number;
} = {}): { items: LearningQueueItem[]; total: number; counts: Record<SuggestionStatus, number> } {
  let items = Array.from(queue.values()).sort((a, b) => b.createdAt - a.createdAt);
  if (opts.status)    items = items.filter(i => i.status === opts.status);
  if (opts.type)      items = items.filter(i => i.type   === opts.type);
  if (opts.riskLevel) items = items.filter(i => i.riskLevel === opts.riskLevel);
  if (opts.complaint) items = items.filter(i => (i.affectedComplaints ?? []).includes(opts.complaint!));
  const total = items.length;
  const limit = Math.min(opts.limit ?? 100, 500);
  const counts = { pending: 0, review: 0, approved: 0, rejected: 0, deployed: 0, rollback: 0 };
  for (const i of Array.from(queue.values())) counts[i.status] = (counts[i.status] ?? 0) + 1;
  return { items: items.slice(0, limit), total, counts };
}

export function getLearningQueueItem(id: string): LearningQueueItem | null {
  return queue.get(id) ?? null;
}

export function getLearningQueueStats(): {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  deployed: number;
  byType: Record<string, number>;
  avgConfidence: number;
  highRiskPending: number;
} {
  const all = Array.from(queue.values());
  const byType: Record<string, number> = {};
  let confSum = 0;
  for (const i of all) {
    byType[i.type] = (byType[i.type] ?? 0) + 1;
    confSum += i.confidence;
  }
  return {
    total:           all.length,
    pending:         all.filter(i => i.status === "pending").length,
    approved:        all.filter(i => i.status === "approved").length,
    rejected:        all.filter(i => i.status === "rejected").length,
    deployed:        all.filter(i => i.status === "deployed").length,
    byType,
    avgConfidence:   all.length ? Math.round((confSum / all.length) * 100) / 100 : 0,
    highRiskPending: all.filter(i => i.status === "pending" && (i.riskLevel === "high" || i.riskLevel === "critical")).length,
  };
}

// ── Generate learning suggestions from simulation failures ────────────────────

export async function generateLearningQueueItemsFromSimRun(
  simRunId: string,
  results: SimCaseResult[],
  summary: SimSummaryMetrics,
): Promise<LearningQueueItem[]> {
  const generated: LearningQueueItem[] = [];

  // 1. False reassurance → urgent rule suggestion
  if (summary.falseReassuranceRate > 0.05) {
    generated.push(addLearningQueueItem({
      type:                "rule_addition",
      title:               "Improve ER_NOW escalation sensitivity",
      description:         `Simulation detected ${Math.round(summary.falseReassuranceRate * 100)}% false reassurance rate — system is under-escalating emergency cases.`,
      rationale:           `${summary.failed} cases failed, ${Math.round(summary.falseReassuranceRate * results.length)} were false reassurance (emergency expected, self-care returned). Review red-flag rules.`,
      affectedComplaints:  Object.keys(summary.accuracyByComplaint).filter(k => (summary.accuracyByComplaint[k].accuracy ?? 1) < 0.8),
      linkedSimRunId:      simRunId,
      linkedCases:         results.filter(r => r.falseReassurance).slice(0, 10).map(r => r.caseId),
      confidence:          Math.min(0.95, 0.5 + summary.falseReassuranceRate * 2),
      riskLevel:           "high",
    }));
  }

  // 2. Low accuracy complaint → weight adjustment
  for (const [complaint, stats] of Object.entries(summary.accuracyByComplaint)) {
    if (stats.total >= 10 && stats.accuracy < 0.7) {
      generated.push(addLearningQueueItem({
        type:            "weight_adjustment",
        title:           `Bayesian weight tuning for ${complaint}`,
        description:     `Complaint '${complaint}' achieved only ${Math.round(stats.accuracy * 100)}% accuracy across ${stats.total} simulated cases.`,
        rationale:       "Low accuracy suggests Bayesian priors or fusion thresholds are miscalibrated for this complaint.",
        affectedComplaints: [complaint],
        linkedSimRunId:  simRunId,
        confidence:      Math.min(0.85, 0.4 + (1 - stats.accuracy)),
        riskLevel:       "medium",
      }));
    }
  }

  // 3. Failure clusters → targeted rules
  for (const cluster of summary.failureClusters.slice(0, 3)) {
    if (cluster.count >= 5) {
      const [complaintPart] = cluster.cluster.split(":");
      generated.push(addLearningQueueItem({
        type:            "rule_modification",
        title:           `Fix failure cluster: ${cluster.cluster}`,
        description:     `${cluster.count} cases failed with pattern: ${cluster.cluster}. ${cluster.suggestedFix ?? "Review rules for this cluster."}`,
        rationale:       `Clustering shows systematic error in ${complaintPart} handling. ${cluster.suggestedFix}`,
        affectedComplaints: [complaintPart],
        linkedSimRunId:  simRunId,
        linkedCases:     cluster.examples,
        confidence:      0.72,
        riskLevel:       "medium",
      }));
    }
  }

  // 4. High overall failure rate → global review
  if (summary.accuracy < 0.75 && summary.totalCases >= 50) {
    generated.push(addLearningQueueItem({
      type:            "disposition_threshold",
      title:           "Review global disposition thresholds",
      description:     `Overall accuracy ${Math.round(summary.accuracy * 100)}% is below the 75% target across ${summary.totalCases} cases.`,
      rationale:       "System-wide accuracy below threshold suggests disposition cutoffs need recalibration.",
      linkedSimRunId:  simRunId,
      confidence:      0.80,
      riskLevel:       "medium",
    }));
  }

  return generated;
}

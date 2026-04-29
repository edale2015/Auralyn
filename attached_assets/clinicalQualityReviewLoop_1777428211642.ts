/**
 * clinicalQualityReviewLoop.ts
 * Drop into: server/harness/clinicalQualityReviewLoop.ts
 *
 * Implementation C: Async Clinical Quality Review Loop
 *
 * Runs WEEKLY — never in real-time patient flow.
 *
 * Adversarially analyzes 90 days of physician override patterns to propose
 * KB rule improvements. Uses a Prosecutor/Defender pattern (from the article's
 * legal domain example) to challenge each proposed change from both directions
 * before any change reaches physician review.
 *
 * NO changes are auto-applied. Every proposed update surfaces in the physician
 * review dashboard (/clinical-validation) for explicit approval.
 *
 * PATTERN: Prosecutor/Defender (two evaluators, opposing perspectives)
 *   Generator         — proposes KB rule update based on override data
 *   Prosecutor agent  — argues the proposed change is clinically risky
 *   Defender agent    — argues the proposed change is clinically sound
 *   Final verdict     — requires both perspectives before physician sees it
 */

import Anthropic from "@anthropic-ai/sdk";
import { db }    from "../db";
import { sql }   from "drizzle-orm";
import { appendAuditEvent } from "../governance/audit";

const anthropic = new Anthropic();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OverridePattern {
  complaintSlug:    string;
  totalCases:       number;
  overrideCount:    number;
  overrideRate:     number;          // 0-1
  commonOverrides:  string[];        // what physicians changed
  aiOriginalOutput: string;          // what the AI said
  timeframe:        string;          // "last 90 days"
}

export interface ProposedRuleChange {
  ruleId:          string;
  complaintSlug:   string;
  currentRule:     string;
  proposedChange:  string;
  rationale:       string;
  evidenceBasis:   string;           // guideline or override data
  overrideSignal:  number;           // 0-1, how strong the override evidence is
  riskLevel:       "low" | "medium" | "high";
}

export interface ProsecutorVerdict {
  risks:             string[];
  clinicalDownside:  string;
  recommendsReject:  boolean;
  severity:          "critical" | "moderate" | "minor";
}

export interface DefenderVerdict {
  benefits:          string[];
  clinicalUpside:    string;
  recommendsApprove: boolean;
  evidenceStrength:  "strong" | "moderate" | "weak";
}

export interface QualityReviewResult {
  proposedChange:   ProposedRuleChange;
  prosecutorVerdict: ProsecutorVerdict;
  defenderVerdict:  DefenderVerdict;
  balancedSummary:  string;
  recommendedAction: "approve" | "reject" | "physician_review" | "gather_more_data";
  physicianPriority: "urgent" | "routine" | "informational";
}

export interface WeeklyQualityReport {
  runId:           string;
  runAt:           string;
  overridesAnalyzed: number;
  changesProposed: number;
  results:         QualityReviewResult[];
  summary:         string;
  urgentForPhysician: QualityReviewResult[];
}

// ─── Fetch override patterns from audit chain ─────────────────────────────────

async function fetchOverridePatterns(): Promise<OverridePattern[]> {
  const rows = await db.execute(sql`
    SELECT
      event_data->>'complaintSlug'  AS complaint_slug,
      event_data->>'aiDisposition'  AS ai_disposition,
      event_data->>'physicianAction' AS physician_action,
      COUNT(*)                       AS total_cases,
      SUM(CASE WHEN event_type IN ('CASE_MODIFIED','CASE_REJECTED') THEN 1 ELSE 0 END) AS override_count
    FROM audit_hash_chain
    WHERE event_type IN ('CASE_APPROVED','CASE_MODIFIED','CASE_REJECTED','CASE_SIGNED_OFF')
      AND timestamp::timestamptz >= NOW() - INTERVAL '90 days'
      AND event_data->>'complaintSlug' IS NOT NULL
    GROUP BY 1, 2, 3
    HAVING COUNT(*) >= 5
    ORDER BY SUM(CASE WHEN event_type IN ('CASE_MODIFIED','CASE_REJECTED') THEN 1 ELSE 0 END)::float / COUNT(*) DESC
    LIMIT 20
  `).catch(() => ({ rows: [] }));

  return (rows.rows as any[]).map(r => ({
    complaintSlug:   r.complaint_slug ?? "",
    totalCases:      Number(r.total_cases),
    overrideCount:   Number(r.override_count),
    overrideRate:    Number(r.override_count) / Number(r.total_cases),
    commonOverrides: [r.physician_action ?? ""].filter(Boolean),
    aiOriginalOutput: r.ai_disposition ?? "",
    timeframe:       "last 90 days",
  }));
}

// ─── Generator — proposes rule changes ───────────────────────────────────────

async function generateProposedChanges(
  patterns: OverridePattern[]
): Promise<ProposedRuleChange[]> {

  if (patterns.length === 0) return [];

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 3000,
    system: `You are the Generator for Auralyn's weekly clinical quality review.
Analyze physician override patterns to propose KB rule improvements.

An override rate > 25% on a complaint type suggests the AI rule may need updating.
An override rate > 50% suggests the rule is likely wrong.

For each high-override pattern, propose a specific rule change that:
1. Addresses the root cause of physician disagreement
2. Is grounded in clinical evidence (ACEP, AAP, AHA, CDC guidelines)
3. Is specific enough to implement (not vague)
4. Preserves patient safety (fail-closed)

Assign riskLevel based on clinical consequences of getting it wrong:
  high   = rule affects red flag detection or ED disposition
  medium = rule affects PCP vs urgent care routing
  low    = rule affects self-care guidance or follow-up timing

Return ONLY valid JSON array of ProposedRuleChange objects. No markdown.`,
    messages: [{
      role:    "user",
      content: `Propose rule changes based on these override patterns:\n${JSON.stringify(patterns, null, 2)}\n\nReturn JSON array of ProposedRuleChange objects.`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Prosecutor — argues against each proposed change ────────────────────────

async function prosecute(change: ProposedRuleChange): Promise<ProsecutorVerdict> {
  const response = await anthropic.messages.create({
    model:      "claude-opus-4-20250514",
    max_tokens: 1000,
    system: `You are the Prosecutor in Auralyn's quality review Prosecutor/Defender system.
Your ONLY job: find clinical risks in the proposed KB rule change.
You are not trying to be balanced. You are trying to find every way this change could harm a patient.

Ask yourself:
- What patient population could be harmed by this change?
- Does this change reduce sensitivity for any red flag condition?
- Could this change cause under-triage of a serious condition?
- Is the evidence basis strong enough for a safety-critical rule?

Be specific. Name the failure mode. Name the patient who gets harmed.
Return ONLY valid JSON ProsecutorVerdict. No markdown.`,
    messages: [{
      role:    "user",
      content: `Prosecute this proposed rule change:\n${JSON.stringify(change, null, 2)}`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Defender — argues for each proposed change ───────────────────────────────

async function defend(change: ProposedRuleChange): Promise<DefenderVerdict> {
  const response = await anthropic.messages.create({
    model:      "claude-opus-4-20250514",
    max_tokens: 1000,
    system: `You are the Defender in Auralyn's quality review Prosecutor/Defender system.
Your ONLY job: articulate the clinical benefits of the proposed KB rule change.
You are not trying to be balanced. You are making the best case for this change.

Ask yourself:
- How does this change improve care for the target patient population?
- What evidence supports this rule update?
- How does the current rule fail patients that this change would help?
- What is the strength of the override signal from physician practice?

Be specific. Name the benefit. Name the patient who is better served.
Return ONLY valid JSON DefenderVerdict. No markdown.`,
    messages: [{
      role:    "user",
      content: `Defend this proposed rule change:\n${JSON.stringify(change, null, 2)}`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Synthesis — balanced verdict from both perspectives ─────────────────────

async function synthesizeVerdict(
  change:     ProposedRuleChange,
  prosecutor: ProsecutorVerdict,
  defender:   DefenderVerdict
): Promise<{ summary: string; recommendation: QualityReviewResult["recommendedAction"]; priority: QualityReviewResult["physicianPriority"] }> {

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: `You are the synthesis judge in Auralyn's quality review system.
Given both Prosecutor and Defender verdicts, produce a balanced recommendation.

Bias toward safety: if the Prosecutor identifies critical risks, recommend physician_review even if the Defender's case is strong.

recommendedAction options:
  approve           — low risk, strong evidence, safe to recommend to physician for approval
  reject            — Prosecutor identified critical safety risks; do not surface to physician
  physician_review  — mixed evidence or moderate risks; surface with both perspectives
  gather_more_data  — insufficient evidence; wait for more override data

physicianPriority:
  urgent      — high riskLevel change that needs timely physician review
  routine     — medium/low risk change for next scheduled review
  informational — FYI only, no action needed

Return ONLY valid JSON: { summary: string, recommendation: string, priority: string }`,
    messages: [{
      role:    "user",
      content: `Synthesize:\nChange: ${JSON.stringify(change)}\nProsecutor: ${JSON.stringify(prosecutor)}\nDefender: ${JSON.stringify(defender)}`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runWeeklyQualityReview(): Promise<WeeklyQualityReport> {
  const runId = `quality-review-${Date.now()}`;
  const runAt = new Date().toISOString();

  console.log(`[QualityReview] Starting weekly quality review — runId: ${runId}`);

  // Fetch override patterns from audit chain
  const patterns = await fetchOverridePatterns();
  console.log(`[QualityReview] Found ${patterns.length} override patterns to analyze`);

  if (patterns.length === 0) {
    return {
      runId, runAt,
      overridesAnalyzed: 0,
      changesProposed:   0,
      results:           [],
      summary:           "No override patterns with sufficient data found in the last 90 days.",
      urgentForPhysician: [],
    };
  }

  // Generator proposes rule changes
  const proposedChanges = await generateProposedChanges(patterns);
  console.log(`[QualityReview] Generator proposed ${proposedChanges.length} rule changes`);

  const results: QualityReviewResult[] = [];

  // Prosecutor/Defender loop for each proposed change
  for (const change of proposedChanges) {
    console.log(`[QualityReview] Running Prosecutor/Defender for: ${change.ruleId}`);

    const [prosecutorVerdict, defenderVerdict] = await Promise.all([
      prosecute(change),
      defend(change),
    ]);

    const synthesis = await synthesizeVerdict(change, prosecutorVerdict, defenderVerdict);

    results.push({
      proposedChange:    change,
      prosecutorVerdict,
      defenderVerdict,
      balancedSummary:   synthesis.summary,
      recommendedAction: synthesis.recommendation as any,
      physicianPriority: synthesis.priority as any,
    });
  }

  const urgentForPhysician = results.filter(
    r => r.recommendedAction === "physician_review" && r.physicianPriority === "urgent"
  );

  const report: WeeklyQualityReport = {
    runId,
    runAt,
    overridesAnalyzed: patterns.length,
    changesProposed:   proposedChanges.length,
    results,
    summary:           `Weekly quality review: ${proposedChanges.length} changes proposed from ${patterns.length} override patterns. ${urgentForPhysician.length} require urgent physician review.`,
    urgentForPhysician,
  };

  // Persist to Postgres
  await db.execute(sql`
    INSERT INTO quality_review_reports (run_id, run_at, report_json, urgent_count)
    VALUES (${runId}, ${runAt}, ${JSON.stringify(report)}, ${urgentForPhysician.length})
  `).catch(err => console.error("[QualityReview] Report persist failed:", err.message));

  // Audit event
  await appendAuditEvent({
    actor:      "system",
    action:     "QUALITY_REVIEW_COMPLETED",
    entityId:   runId,
    entityType: "system",
    details: {
      overridesAnalyzed: patterns.length,
      changesProposed:   proposedChanges.length,
      urgentCount:       urgentForPhysician.length,
    },
  }).catch(console.error);

  console.log(`[QualityReview] Complete — ${report.summary}`);
  return report;
}

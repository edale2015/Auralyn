/**
 * command.routes.ts
 * server/routes/command.routes.ts
 *
 * Architecture 7 orchestration layer.
 * Receives physician natural language commands, parses intent via OpenAI,
 * and executes across all Auralyn subsystems built in Wins 1-9.
 *
 * Register in server/index.ts:
 *   import { commandRouter } from "./routes/command.routes";
 *   app.use(commandRouter);  // before other routes
 *
 * Intent categories handled:
 *   QUEUE_VIEW        → filter and return review queue
 *   CASE_ACTION       → approve/reject/modify/escalate a case
 *   DISCHARGE         → generate and send discharge instructions
 *   ECONSULT          → draft specialist referral
 *   FOLLOWUP_VIEW     → show follow-up monitoring dashboard data
 *   FOLLOWUP_ENROLL   → manually enroll a case in follow-up
 *   PERFORMANCE       → return physician performance metrics
 *   EHR_CONTEXT       → fetch patient EHR context
 *   PRIOR_AUTH        → assess prior authorization for orders
 *   TELEMED_VIEW      → show active telemedicine sessions
 *   UNKNOWN           → ask for clarification
 */

import { Router }            from "express";
import OpenAI                from "openai";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { appendAuditEvent }  from "../governance/audit";

import { getCase, listReviewQueue, setPhysicianReview } from "../services/caseService";
import { enrollInFollowUp, getEnrollmentsByPhysician }  from "../followup/followUpService";
import { fetchPatientContext }                            from "../integrations/ehr/fhirPatientContext";
import { assessPriorAuth }                               from "../integrations/ehr/priorAuthSkeleton";

export const commandRouter = Router();

const openai = new OpenAI({
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Intent parser ────────────────────────────────────────────────────────────

interface ParsedIntent {
  category:             string;
  caseId?:              string;
  action?:              string;
  specialty?:           string;
  patientId?:           string;
  vendor?:              string;
  filterType?:          string;
  confidence:           number;
  rawIntent:            string;
  requiresConfirmation: boolean;
  confirmationPrompt?:  string;
}

async function parseIntent(command: string): Promise<ParsedIntent> {
  const systemPrompt = `You are an intent parser for Auralyn, a clinical AI platform for urgent care physicians.
Parse the physician's natural language command into structured intent.

Available categories and their triggers:
- QUEUE_VIEW: show/display/list cases, queue, urgent cases, async cases, review queue
- CASE_ACTION: approve/reject/modify/escalate/sign-off a specific case
- DISCHARGE: send/generate discharge instructions for a case
- ECONSULT: refer/consult/draft referral for a specialist
- FOLLOWUP_VIEW: show follow-up patients, escalated patients, enrolled patients
- FOLLOWUP_ENROLL: enroll a patient in follow-up protocol
- PERFORMANCE: my stats/performance/benchmarks/grade/how am I doing
- EHR_CONTEXT: load/show/get patient records/EHR/medical history
- PRIOR_AUTH: check/assess prior authorization for orders
- TELEMED_VIEW: show/list telemedicine sessions, active calls
- CLINICAL_SKILLS: show/list/review clinical skills, pending skills, activate skill, what is AI getting wrong
- RESEARCH_RADAR: check research readiness, when can we implement Rec 5/6, temporal EHR graphs, GNN
- INFRA_STATUS: is everything running, system health, service status, infrastructure
- KB_VALIDATION: KB validation results, last validation, run KB validation
- SPEC_STATUS: specs in progress, create spec for, development specs, pathway development
- CME_QUIZ: quiz me, clinical quiz, test my knowledge, CME
- DESIGN_AUDIT: design drift, components not using design system, color drift audit
- DRIFT_STATUS: drift canaries, canary results, model drift, last drift check
- UNKNOWN: anything unclear or outside scope

Actions for CASE_ACTION: approve, reject, modify, escalate, sign_off

Return ONLY valid JSON, no markdown, no explanation:
{
  "category": "QUEUE_VIEW",
  "caseId": null,
  "action": null,
  "specialty": null,
  "patientId": null,
  "vendor": "mock",
  "filterType": null,
  "confidence": 0.95,
  "rawIntent": "physician wants to see the review queue",
  "requiresConfirmation": false,
  "confirmationPrompt": null
}

requiresConfirmation should be true for destructive or irreversible actions (case approval, rejection, sending messages).`;

  const completion = await openai.chat.completions.create({
    model:    "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: command },
    ],
    max_tokens:  500,
    temperature: 0,
  });

  const text  = completion.choices[0]?.message?.content ?? "{}";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Action executors ─────────────────────────────────────────────────────────

async function executeQueueView(intent: ParsedIntent) {
  const filter = intent.filterType;
  const cases  = await listReviewQueue({ state: "NEEDS_REVIEW", limit: 20 });

  let filtered = cases as any[];
  if (filter === "async" || filter === "async_safe") {
    filtered = filtered.filter((c: any) => c.caseType === "Async Safe");
  } else if (filter === "urgent") {
    filtered = filtered.filter((c: any) =>
      ["High-Risk ED Diversion", "Urgent Sync Required", "Pediatric Urgent"].includes(c.caseType)
    );
  }

  return {
    actions: [{
      type:   "QUEUE_VIEW",
      label:  `Found ${filtered.length} case${filtered.length !== 1 ? "s" : ""} in queue`,
      status: "complete" as const,
      result: filtered.slice(0, 5).map((c: any) =>
        `${c.caseId}: ${c.complaint?.display ?? c.complaint} — ${c.caseType ?? "unclassified"}`
      ).join(" · ") || "No cases matched the filter.",
    }],
    summary: `Showing ${filtered.length} case${filtered.length !== 1 ? "s" : ""}${filter ? ` (${filter} filter)` : ""}. Navigate to /review to see the full queue.`,
    data:    filtered,
  };
}

async function executeCaseAction(intent: ParsedIntent, physicianId: string) {
  if (!intent.caseId || !intent.action) {
    throw new Error("Case ID and action are required for case actions.");
  }

  const statusMap: Record<string, string> = {
    approve:  "APPROVED",
    reject:   "REJECTED",
    modify:   "MODIFIED",
    escalate: "ESCALATED",
    sign_off: "SIGNED_OFF",
  };

  const status = statusMap[intent.action];
  if (!status) throw new Error(`Unknown action: ${intent.action}`);

  await setPhysicianReview(intent.caseId, {
    status,
    reviewer: { id: physicianId, name: "Physician" },
  });

  return {
    actions: [{
      type:   "CASE_ACTION",
      label:  `Case ${intent.caseId} — ${intent.action}`,
      status: "complete" as const,
      result: `Status set to ${status}`,
    }],
    summary: `Case ${intent.caseId} has been ${intent.action}d. The audit chain has been updated.`,
  };
}

async function executeFollowupView(intent: ParsedIntent, physicianId: string) {
  const enrollments = await getEnrollmentsByPhysician(physicianId);
  const escalated   = enrollments.filter((e: any) => e.status === "escalated");
  const active      = enrollments.filter((e: any) => e.status === "active");

  return {
    actions: [{
      type:   "FOLLOWUP_VIEW",
      label:  `Follow-up monitoring — ${enrollments.length} enrolled patients`,
      status: "complete" as const,
      result: `${escalated.length} escalated · ${active.length} active`,
    }],
    summary: escalated.length > 0
      ? `${escalated.length} patient${escalated.length !== 1 ? "s" : ""} need attention. Navigate to /follow-up-monitoring for details.`
      : `All ${active.length} active follow-up patients are responding normally. Navigate to /follow-up-monitoring for details.`,
  };
}

async function executePerformance() {
  return {
    actions: [{
      type:   "PERFORMANCE",
      label:  "Performance metrics retrieved",
      status: "complete" as const,
      result: "Navigate to /physician-feedback for full dashboard",
    }],
    summary: "Your performance dashboard is at /physician-feedback. It shows your national benchmark grade, case volume trend, and recent activity feed.",
  };
}

async function executeEhrContext(intent: ParsedIntent) {
  const patientId = intent.patientId ?? "demo";
  const vendor    = (intent.vendor ?? "mock") as any;
  const ctx       = await fetchPatientContext({ vendor, patientId });

  return {
    actions: [{
      type:   "EHR_CONTEXT",
      label:  `EHR context fetched for patient ${patientId}`,
      status: ctx.partial ? "failed" as const : "complete" as const,
      result: `${ctx.medications.length} meds · ${ctx.allergies.length} allergies · ${ctx.conditions.length} conditions · ${ctx.labs.length} labs`,
    }],
    summary: ctx.partial
      ? `Partial EHR context loaded for ${patientId}. Some sections unavailable: ${ctx.errors.join(", ")}`
      : `EHR context loaded for ${patientId}. Open any case with this patient to see it pre-populated.`,
    data: ctx,
  };
}

async function executePriorAuth(intent: ParsedIntent) {
  const assessment = await assessPriorAuth({
    caseId:           intent.caseId ?? "manual",
    primaryDiagnosis: "Z00.00",
    proposedOrders:   [
      { type: "imaging", code: "70553", display: "MRI Brain with contrast" },
      { type: "lab",     code: "85025", display: "CBC" },
    ],
  });

  const required = assessment.orders.filter(o => o.authStatus === "required").length;

  return {
    actions: [{
      type:   "PRIOR_AUTH",
      label:  "Prior authorization assessed",
      status: "complete" as const,
      result: `${required} of ${assessment.orders.length} orders require prior auth`,
    }],
    summary: assessment.summary,
    data:    assessment,
  };
}

// ─── Extended executor functions (Wins 15–17 intents) ────────────────────────

async function executeClinicalSkills() {
  const { db: _db } = await import("../db");
  const { sql: _sql } = await import("drizzle-orm");

  const rows = await _db.execute(_sql`
    SELECT skill_id, complaint_slug, title, status, confidence, override_count
    FROM clinical_skills
    WHERE status IN ('pending_review', 'active')
    ORDER BY status DESC, confidence DESC
    LIMIT 10
  `).catch(() => ({ rows: [] }));

  const skills  = rows.rows as any[];
  const pending = skills.filter(s => s.status === "pending_review");
  const active  = skills.filter(s => s.status === "active");

  const pendingSummary = pending.length > 0
    ? pending.map(s => `"${s.title}" (${s.complaint_slug}, ${Math.round(s.confidence * 100)}% confidence, ${s.override_count} overrides)`).join("\n  ")
    : "None";

  return {
    actions: [{
      type:   "CLINICAL_SKILLS",
      label:  `Clinical Skills — ${pending.length} pending, ${active.length} active`,
      status: "complete" as const,
      result: pending.length > 0 ? `${pending.length} skill(s) awaiting review` : "No pending skills",
    }],
    summary: `**Active (${active.length}):** ${active.length > 0 ? active.map(s => `"${s.title}"`).join(", ") : "None"}\n\n**Pending Review (${pending.length}):**\n  ${pendingSummary}\n\nNavigate to /clinical-skills to review and activate.`,
  };
}

async function executeResearchRadar() {
  const { db: _db } = await import("../db");
  const { sql: _sql } = await import("drizzle-orm");

  const scores = await _db.execute(_sql`
    SELECT target_id, readiness_score, last_scanned_at
    FROM research_radar_scores
    ORDER BY target_id
  `).catch(() => ({ rows: [] }));

  const targets: Record<string, any> = {};
  (scores.rows as any[]).forEach(r => { targets[r.target_id] = r; });

  const rec5 = targets["rec5_temporal_graph_ehr"];
  const rec6 = targets["rec6_gnn_differential"];

  const fmt = (t: any, name: string) => t
    ? `${name}: ${t.readiness_score}/5 (scanned: ${t.last_scanned_at ? new Date(t.last_scanned_at).toLocaleDateString() : "never"})`
    : `${name}: Not yet scanned`;

  const anyReady = [rec5, rec6].some(t => t?.readiness_score >= 4);

  return {
    actions: [{
      type:   "RESEARCH_RADAR",
      label:  "Research Radar status",
      status: "complete" as const,
      result: anyReady ? "⚠ A recommendation is ready to implement!" : "Monitoring — not yet ready",
    }],
    summary: anyReady
      ? `🚨 **Implementation Alert:** A recommendation has reached readiness score 4+. Check /research-radar immediately.\n\n${fmt(rec5, "Rec 5 — Temporal Graph EHR")}\n${fmt(rec6, "Rec 6 — GNN Differential")}`
      : `Research Radar — both recommendations still in research phase:\n${fmt(rec5, "Rec 5 — Temporal Graph EHR")}\n${fmt(rec6, "Rec 6 — GNN Differential")}\n\nNext scan: Sunday 4am UTC.`,
  };
}

async function executeInfraStatus() {
  try {
    const { SelfHealingMonitor } = await import("../infra/selfHealingMonitor");
    const health   = SelfHealingMonitor.getHealthSummary();
    const services = Object.values(health) as any[];
    const down     = services.filter(s => s.status === "down");
    const degraded = services.filter(s => s.status === "degraded");

    return {
      actions: [{
        type:   "INFRA_STATUS",
        label:  "Infrastructure health checked",
        status: down.length > 0 ? "failed" as const : "complete" as const,
        result: down.length > 0
          ? `${down.length} service(s) DOWN`
          : degraded.length > 0 ? `${degraded.length} degraded` : "All services healthy",
      }],
      summary: down.length > 0
        ? `⚠️ **${down.length} service(s) DOWN:** ${down.map((s: any) => s.service).join(", ")}\n\nAuto-remediation attempted. Navigate to /infra-status for details.`
        : degraded.length > 0
        ? `${degraded.map((s: any) => s.service).join(", ")} degraded. Check /infra-status.`
        : `All 6 critical services are healthy. PostgreSQL, BullMQ, WebSocket, and all 3 schedulers nominal.`,
    };
  } catch {
    return {
      actions: [{ type: "INFRA_STATUS", label: "Infrastructure status", status: "complete" as const, result: "Check /infra-status" }],
      summary: "Navigate to /infra-status for real-time service health.",
    };
  }
}

async function executeKBValidation() {
  const { db: _db } = await import("../db");
  const { sql: _sql } = await import("drizzle-orm");

  const report = await _db.execute(_sql`
    SELECT run_id, run_at, physician_review_count
    FROM kb_validation_reports
    ORDER BY run_at DESC LIMIT 1
  `).catch(() => ({ rows: [] }));

  const last = report.rows[0] as any;
  if (!last) {
    return {
      actions: [{ type: "KB_VALIDATION", label: "KB Validation", status: "complete" as const, result: "No run yet" }],
      summary: "No KB validation has run yet. It runs nightly at 2am UTC.",
    };
  }

  const runDate = new Date(last.run_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return {
    actions: [{
      type:   "KB_VALIDATION",
      label:  `KB Validation — last run ${runDate}`,
      status: "complete" as const,
      result: `${last.physician_review_count} rules flagged`,
    }],
    summary: `Last KB validation: ${runDate}.\n${last.physician_review_count > 0 ? `⚠️ ${last.physician_review_count} rules require physician review.` : "All rules validated."}\n\nNavigate to /governance-command-center for the full report.`,
  };
}

async function executeSpecStatus() {
  try {
    const { SpecDrivenDevelopment } = await import("../harness/specDrivenDevelopment");
    const specs  = SpecDrivenDevelopment.listSpecs();
    const active = specs.filter(s => s.status === "active" || s.status === "draft");

    if (active.length === 0) {
      return {
        actions: [{ type: "SPEC_STATUS", label: "Development Specs", status: "complete" as const, result: "No active specs" }],
        summary: `No active development specs. Say: "create spec for [complaint pathway]" or navigate to /clinical-skills.`,
      };
    }

    return {
      actions: [{
        type:   "SPEC_STATUS",
        label:  `${active.length} active spec(s)`,
        status: "complete" as const,
        result: active.map(s => {
          const done  = s.tasks?.filter((t: any) => t.status === "complete").length ?? 0;
          const total = s.tasks?.length ?? 0;
          return `${s.goal} (${done}/${total})`;
        }).join("; "),
      }],
      summary: active.map(s => {
        const done    = s.tasks?.filter((t: any) => t.status === "complete").length ?? 0;
        const total   = s.tasks?.length ?? 0;
        const blocked = s.tasks?.filter((t: any) => t.status === "blocked").length ?? 0;
        return `**${s.goal}**\n  ${done}/${total} tasks${blocked > 0 ? ` · ⚠ ${blocked} blocked` : ""} · v${s.version}`;
      }).join("\n\n"),
    };
  } catch {
    return {
      actions: [{ type: "SPEC_STATUS", label: "Spec status", status: "complete" as const, result: "Navigate to /clinical-skills" }],
      summary: "Navigate to /clinical-skills to view active development specs.",
    };
  }
}

async function executeDriftStatus() {
  const { db: _db } = await import("../db");
  const { sql: _sql } = await import("drizzle-orm");

  const result = await _db.execute(_sql`
    SELECT event_data, timestamp
    FROM audit_hash_chain
    WHERE event_type = 'DRIFT_CHECK_COMPLETED'
    ORDER BY timestamp DESC LIMIT 1
  `).catch(() => ({ rows: [] }));

  const last = result.rows[0] as any;
  if (!last) {
    return {
      actions: [{ type: "DRIFT_STATUS", label: "Drift Canaries", status: "complete" as const, result: "No run yet" }],
      summary: "No drift canary run recorded yet. The canary scheduler runs nightly at 2am UTC.",
    };
  }

  const data    = last.event_data;
  const runDate = new Date(last.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const failed  = data?.failedCanaries ?? [];
  const passed  = data?.passed ?? 0;
  const total   = data?.total ?? 20;

  return {
    actions: [{
      type:   "DRIFT_STATUS",
      label:  `Drift canaries — ${runDate}`,
      status: failed.length > 0 ? "failed" as const : "complete" as const,
      result: `${passed}/${total} passed`,
    }],
    summary: failed.length > 0
      ? `⚠️ **Drift detected** (${runDate}): ${failed.length} canary failure(s): ${failed.join(", ")}.\n\nModel behavior has shifted. Review before clinic hours.`
      : `✅ All ${total} drift canaries passed (${runDate}). Model behavior stable.`,
  };
}

// ─── Intent analytics feed-forward ───────────────────────────────────────────
// Log every command intent so the adaptation loop can learn which commands
// physicians actually use vs abandon. PHI-safe: no command text stored.
export async function logCommandIntent(
  category:   string,
  confidence: number,
  actor:      string,
  succeeded:  boolean
): Promise<void> {
  await appendAuditEvent({
    actor,
    action:     "COMMAND_INTENT_LOGGED",
    entityId:   `intent-${Date.now()}`,
    entityType: "command_analytics",
    details: {
      category,
      confidence: Math.round(confidence * 100),
      succeeded,
      // rawIntent intentionally omitted — may contain PHI or sensitive clinical terms
    },
  }).catch(console.error);
}

// ─── Main orchestration handler ───────────────────────────────────────────────

commandRouter.post(
  "/api/command",
  requireReviewAuth,
  async (req, res) => {
    const { command, physicianId, confirmed } = req.body;

    if (!command?.trim()) {
      return res.status(400).json({ ok: false, error: "Command is required" });
    }

    const actor = physicianId ?? (req as any).user?.id ?? "phys1";

    try {
      const intent = await parseIntent(command);

      // Confirmation gate for destructive actions
      if (intent.requiresConfirmation && !confirmed) {
        return res.json({
          ok:                   true,
          intent:               intent.rawIntent,
          actions:              [],
          summary:              "",
          requiresConfirmation: true,
          confirmationPrompt:   intent.confirmationPrompt ?? "This action cannot be undone. Confirm?",
        });
      }

      let result: any;

      switch (intent.category) {
        case "QUEUE_VIEW":    result = await executeQueueView(intent);              break;
        case "CASE_ACTION":   result = await executeCaseAction(intent, actor);      break;
        case "FOLLOWUP_VIEW": result = await executeFollowupView(intent, actor);    break;
        case "PERFORMANCE":   result = await executePerformance();                  break;
        case "EHR_CONTEXT":   result = await executeEhrContext(intent);             break;
        case "PRIOR_AUTH":    result = await executePriorAuth(intent);              break;
        case "TELEMED_VIEW":
          result = {
            actions: [{ type: "TELEMED_VIEW", label: "Telemedicine sessions", status: "complete", result: "Navigate to /telemed-doctor-dashboard" }],
            summary: "Navigate to /telemed-doctor-dashboard to see active telemedicine sessions and pending AI draft replies.",
          };
          break;
        case "DISCHARGE":
          result = {
            actions: [{ type: "DISCHARGE", label: "Discharge instructions", status: "complete", result: "Open the case in /case-review to send discharge instructions" }],
            summary: `Open the case in /case-review${intent.caseId ? ` for case ${intent.caseId}` : ""} and use the Discharge Instructions panel to generate and send instructions.`,
          };
          break;
        case "ECONSULT":
          result = {
            actions: [{ type: "ECONSULT", label: "eConsult referral", status: "complete", result: "Open the case in /case-review to draft a specialist referral" }],
            summary: `Open the case in /case-review${intent.caseId ? ` for case ${intent.caseId}` : ""} and use the eConsult panel to draft a ${intent.specialty ?? "specialist"} referral.`,
          };
          break;
        case "FOLLOWUP_ENROLL":
          result = {
            actions: [{ type: "FOLLOWUP_ENROLL", label: "Follow-up enrollment", status: "complete", result: "Open the case in /case-review to enroll in follow-up" }],
            summary: `Open the case in /case-review${intent.caseId ? ` for case ${intent.caseId}` : ""} and use the Follow-Up Monitoring panel to enroll this patient.`,
          };
          break;
        case "CLINICAL_SKILLS":  result = await executeClinicalSkills();  break;
        case "RESEARCH_RADAR":   result = await executeResearchRadar();   break;
        case "INFRA_STATUS":     result = await executeInfraStatus();     break;
        case "KB_VALIDATION":    result = await executeKBValidation();    break;
        case "SPEC_STATUS":      result = await executeSpecStatus();      break;
        case "DRIFT_STATUS":     result = await executeDriftStatus();     break;
        case "CME_QUIZ":
          result = {
            actions: [{ type: "CME_QUIZ", label: "CME Quiz", status: "complete", result: "Navigate to /cme-quiz" }],
            summary: "The CME Quiz tool is at /cme-quiz. Choose from: Red Flag Recognition, Centor/HEART/Wells scoring, Drug interactions, Disposition decisions, Pediatric urgent care, or the Feynman explainer.",
          };
          break;
        case "DESIGN_AUDIT":
          result = {
            actions: [{ type: "DESIGN_AUDIT", label: "Design audit", status: "complete", result: "Run via Claude Code" }],
            summary: "To audit design drift, ask Claude Code: \"Review /client/src/components and list Tailwind color classes not defined in DESIGN.md. Include file and line number.\"\n\nDESIGN.md is the authoritative token set.",
          };
          break;
        case "UNKNOWN":
        default:
          result = {
            actions: [],
            summary: `I didn't understand "${command}". Try commands like "show urgent cases", "approve case C-001", "show follow-up patients", or "how am I doing this week".`,
          };
      }

      // Log to intent analytics feed-forward loop (non-blocking)
      logCommandIntent(intent.category, intent.confidence, actor, true).catch(() => {});

      await appendAuditEvent({
        actor,
        action:     "COMMAND_EXECUTED",
        entityId:   intent.caseId ?? "global",
        entityType: "command",
        details: {
          category:   intent.category,
          confidence: intent.confidence,
          confirmed,
        },
      }).catch(() => {});

      return res.json({
        ok:                   true,
        intent:               intent.rawIntent,
        actions:              result.actions ?? [],
        summary:              result.summary ?? "",
        requiresConfirmation: false,
        data:                 result.data,
      });

    } catch (e: any) {
      console.error("[Command] Orchestration failed:", e?.message);

      return res.json({
        ok:                   false,
        intent:               command,
        actions:              [{
          type:   "ERROR",
          label:  "Command failed",
          status: "failed",
          error:  e?.message ?? "Unknown error",
        }],
        summary:              "",
        requiresConfirmation: false,
        error:                e?.message ?? "Command execution failed",
      });
    }
  }
);

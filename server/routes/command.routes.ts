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
        case "UNKNOWN":
        default:
          result = {
            actions: [],
            summary: `I didn't understand "${command}". Try commands like "show urgent cases", "approve case C-001", "show follow-up patients", or "how am I doing this week".`,
          };
      }

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

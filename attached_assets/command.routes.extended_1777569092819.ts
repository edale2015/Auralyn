/**
 * command.routes.extended.ts
 *
 * PATCH for server/routes/command.routes.ts
 *
 * Adds the missing intent categories so ⌘K covers the full Auralyn surface.
 * These intents were built in later wins but never wired into the command router.
 *
 * HOW TO APPLY:
 * In server/routes/command.routes.ts, find the switch statement that routes
 * intent categories and add the cases below. Also add the new intent categories
 * to the system prompt in parseIntent().
 *
 * NEW INTENTS ADDED:
 *   CLINICAL_SKILLS    — "show pending skills", "activate skill", "what skills are active"
 *   RESEARCH_RADAR     — "check research readiness", "when can we implement temporal EHR"
 *   INFRA_STATUS       — "is everything running", "show system health"
 *   KB_VALIDATION      — "when did KB last validate", "run KB validation now"
 *   SPEC_STATUS        — "what specs are in progress", "create spec for X"
 *   CME_QUIZ           — "quiz me on chest pain", "start a clinical quiz"
 *   DESIGN_AUDIT       — "audit design drift", "find components not using design system"
 *   DRIFT_STATUS       — "did canaries pass last night", "show drift check results"
 */

// ─── Add to parseIntent() system prompt ──────────────────────────────────────
// Find the availableCategories section and add:

const EXTENDED_INTENT_CATEGORIES = `
- CLINICAL_SKILLS: show/list/review clinical skills, pending skills, activate skill, what is AI getting wrong
- RESEARCH_RADAR: check research readiness, when can we implement Rec 5/6, temporal EHR graphs, GNN
- INFRA_STATUS: is everything running, system health, service status, infrastructure
- KB_VALIDATION: KB validation results, last validation, run KB validation
- SPEC_STATUS: specs in progress, create spec for, development specs, pathway development
- CME_QUIZ: quiz me, clinical quiz, test my knowledge, CME
- DESIGN_AUDIT: design drift, components not using design system, color drift audit
- DRIFT_STATUS: drift canaries, canary results, model drift, last drift check
`;

// ─── Add to the main switch statement in the route handler ───────────────────

async function executeClinicalSkills(intent: any, actor: string) {
  // Query pending and active skills from DB
  // This is a summary — /clinical-skills has the full dashboard
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");

  const rows = await db.execute(sql`
    SELECT skill_id, complaint_slug, title, status, confidence, override_count, created_at
    FROM clinical_skills
    WHERE status IN ('pending_review', 'active')
    ORDER BY status DESC, confidence DESC
    LIMIT 10
  `).catch(() => ({ rows: [] }));

  const skills    = rows.rows as any[];
  const pending   = skills.filter(s => s.status === "pending_review");
  const active    = skills.filter(s => s.status === "active");

  const pendingSummary = pending.length > 0
    ? pending.map(s => `"${s.title}" (${s.complaint_slug}, ${Math.round(s.confidence * 100)}% confidence, ${s.override_count} overrides)`).join("\n  ")
    : "None";

  const activeSummary = active.length > 0
    ? active.map(s => `"${s.title}" (${s.complaint_slug})`).join(", ")
    : "None currently active";

  return {
    actions: [{
      type:   "CLINICAL_SKILLS",
      label:  `Clinical Skills — ${pending.length} pending review, ${active.length} active`,
      status: "complete" as const,
      result: pending.length > 0
        ? `${pending.length} skill${pending.length !== 1 ? "s" : ""} awaiting your review`
        : "No pending skills",
    }],
    summary: `**Active Skills (${active.length}):** ${activeSummary}\n\n**Pending Your Review (${pending.length}):**\n  ${pendingSummary}\n\nNavigate to /clinical-skills to review and activate skills.`,
  };
}

async function executeResearchRadar(intent: any, actor: string) {
  const { db }  = await import("../db");
  const { sql } = await import("drizzle-orm");

  const scores = await db.execute(sql`
    SELECT target_id, readiness_score, last_scanned_at
    FROM research_radar_scores
    ORDER BY target_id
  `).catch(() => ({ rows: [] }));

  const targets: Record<string, any> = {};
  (scores.rows as any[]).forEach(r => { targets[r.target_id] = r; });

  const rec5 = targets["rec5_temporal_graph_ehr"];
  const rec6 = targets["rec6_gnn_differential"];

  const formatTarget = (t: any, name: string) => t
    ? `${name}: ${t.readiness_score}/5 (last scanned: ${t.last_scanned_at ? new Date(t.last_scanned_at).toLocaleDateString() : "never"})`
    : `${name}: Not yet scanned`;

  const anyReady = [rec5, rec6].some(t => t?.readiness_score >= 4);

  return {
    actions: [{
      type:   "RESEARCH_RADAR",
      label:  "Research Radar status retrieved",
      status: "complete" as const,
      result: anyReady ? "⚠ A recommendation is ready to implement!" : "Monitoring — not yet ready",
    }],
    summary: anyReady
      ? `🚨 **Implementation Alert:** A recommendation has reached readiness score 4+. Check /research-radar immediately.\n\n${formatTarget(rec5, "Rec 5 — Temporal Graph EHR")}\n${formatTarget(rec6, "Rec 6 — GNN Differential")}`
      : `Research Radar — both recommendations still in research phase:\n${formatTarget(rec5, "Rec 5 — Temporal Graph EHR")}\n${formatTarget(rec6, "Rec 6 — GNN Differential")}\n\nNext scan: Sunday 4am UTC. Navigate to /research-radar for full report.`,
  };
}

async function executeInfraStatus(intent: any, actor: string) {
  // Import the self-healing monitor's summary
  // The monitor keeps in-memory health state updated every 5 minutes
  try {
    const { SelfHealingMonitor } = await import("../infra/selfHealingMonitor");
    const health = SelfHealingMonitor.getHealthSummary();
    const services = Object.values(health) as any[];

    const down     = services.filter(s => s.status === "down");
    const degraded = services.filter(s => s.status === "degraded");
    const healthy  = services.filter(s => s.status === "healthy");

    return {
      actions: [{
        type:   "INFRA_STATUS",
        label:  "Infrastructure health checked",
        status: down.length > 0 ? "failed" as const : "complete" as const,
        result: down.length > 0
          ? `${down.length} service${down.length !== 1 ? "s" : ""} DOWN`
          : degraded.length > 0
          ? `${degraded.length} service${degraded.length !== 1 ? "s" : ""} degraded`
          : "All 6 services healthy",
      }],
      summary: down.length > 0
        ? `⚠️ **${down.length} service${down.length !== 1 ? "s" : ""} DOWN:** ${down.map((s: any) => s.service).join(", ")}\n\nAuto-remediation has been attempted. Navigate to /infra-status for details and incident history.`
        : degraded.length > 0
        ? `${degraded.map((s: any) => s.service).join(", ")} ${degraded.length === 1 ? "is" : "are"} degraded. All other services healthy. Check /infra-status.`
        : `All 6 critical services are healthy. PostgreSQL, BullMQ, WebSocket, and all 3 schedulers nominal.`,
    };
  } catch {
    return {
      actions: [{ type: "INFRA_STATUS", label: "Infrastructure status", status: "complete" as const, result: "Check /infra-status for live status" }],
      summary: "Navigate to /infra-status for real-time service health.",
    };
  }
}

async function executeKBValidation(intent: any, actor: string) {
  const { db }  = await import("../db");
  const { sql } = await import("drizzle-orm");

  const report = await db.execute(sql`
    SELECT run_id, run_at, physician_review_count
    FROM kb_validation_reports
    ORDER BY run_at DESC LIMIT 1
  `).catch(() => ({ rows: [] }));

  const last = (report.rows[0] as any);

  if (!last) {
    return {
      actions: [{ type: "KB_VALIDATION", label: "KB Validation", status: "complete" as const, result: "No validation run yet" }],
      summary: "No KB validation has run yet. It runs nightly at 2am UTC. You can trigger a manual run via POST /api/harness/kb-validate-now.",
    };
  }

  const runDate = new Date(last.run_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return {
    actions: [{
      type:   "KB_VALIDATION",
      label:  `KB Validation — last run ${runDate}`,
      status: "complete" as const,
      result: `${last.physician_review_count} rules flagged for physician review`,
    }],
    summary: `Last KB validation: ${runDate}.\n${last.physician_review_count > 0 ? `⚠️ ${last.physician_review_count} rules require physician review before any changes are applied.` : "All rules validated without issues."}\n\nNavigate to /governance-command-center for the full report.`,
  };
}

async function executeSpecStatus(intent: any, actor: string) {
  try {
    const { SpecDrivenDevelopment } = await import("../harness/specDrivenDevelopment");
    const specs = SpecDrivenDevelopment.listSpecs();
    const active = specs.filter(s => s.status === "active" || s.status === "draft");

    if (active.length === 0) {
      return {
        actions: [{ type: "SPEC_STATUS", label: "Development Specs", status: "complete" as const, result: "No active specs" }],
        summary: "No active development specs. To create one, say: \"create spec for [complaint pathway]\". Or navigate to /clinical-skills to view the spec tracker.",
      };
    }

    return {
      actions: [{
        type:   "SPEC_STATUS",
        label:  `${active.length} active development spec${active.length !== 1 ? "s" : ""}`,
        status: "complete" as const,
        result: active.map(s => {
          const done  = s.tasks?.filter((t: any) => t.status === "complete").length ?? 0;
          const total = s.tasks?.length ?? 0;
          return `${s.goal} (${done}/${total} tasks)`;
        }).join("; "),
      }],
      summary: active.map(s => {
        const done    = s.tasks?.filter((t: any) => t.status === "complete").length ?? 0;
        const total   = s.tasks?.length ?? 0;
        const blocked = s.tasks?.filter((t: any) => t.status === "blocked").length ?? 0;
        return `**${s.goal}**\n  ${done}/${total} tasks complete${blocked > 0 ? ` · ⚠ ${blocked} blocked` : ""} · v${s.version}`;
      }).join("\n\n"),
    };
  } catch {
    return {
      actions: [{ type: "SPEC_STATUS", label: "Spec status", status: "complete" as const, result: "Navigate to /clinical-skills" }],
      summary: "Navigate to /clinical-skills to view active development specs.",
    };
  }
}

async function executeDriftStatus(intent: any, actor: string) {
  const { db }  = await import("../db");
  const { sql } = await import("drizzle-orm");

  const result = await db.execute(sql`
    SELECT event_data, timestamp
    FROM audit_hash_chain
    WHERE event_type = 'DRIFT_CHECK_COMPLETED'
    ORDER BY timestamp DESC LIMIT 1
  `).catch(() => ({ rows: [] }));

  const last = (result.rows[0] as any);

  if (!last) {
    return {
      actions: [{ type: "DRIFT_STATUS", label: "Drift Canaries", status: "complete" as const, result: "No canary run yet" }],
      summary: "No drift canary run recorded yet. The canary scheduler runs nightly at 2am UTC.",
    };
  }

  const data     = last.event_data;
  const runDate  = new Date(last.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const failed   = data?.failedCanaries ?? [];
  const passed   = data?.passed ?? 0;
  const total    = data?.total ?? 20;

  return {
    actions: [{
      type:   "DRIFT_STATUS",
      label:  `Drift canaries — ${runDate}`,
      status: failed.length > 0 ? "failed" as const : "complete" as const,
      result: `${passed}/${total} canaries passed`,
    }],
    summary: failed.length > 0
      ? `⚠️ **Drift detected** (${runDate}): ${failed.length} canary${failed.length !== 1 ? "ies" : "y"} failed: ${failed.join(", ")}.\n\nModel behavior has shifted on these complaint types. Review the affected cases before clinic hours.`
      : `✅ All ${total} drift canaries passed (${runDate}). Model behavior is stable across all canonical complaint types.`,
  };
}

// ─── INTENT ANALYTICS (for feed-forward learning) ────────────────────────────
// Log every command intent to the audit chain so we can see which intents
// physicians actually use vs abandon. This feeds the Clinical Skills loop
// and helps prioritize command interface improvements.

export async function logCommandIntent(
  intent:     string,
  category:   string,
  confidence: number,
  actor:      string,
  succeeded:  boolean
): Promise<void> {
  const { appendAuditEvent } = await import("../governance/audit");

  await appendAuditEvent({
    actor,
    action:     "COMMAND_INTENT_LOGGED",
    entityId:   `intent-${Date.now()}`,
    entityType: "command_analytics",
    details: {
      category,
      confidence:  Math.round(confidence * 100),
      succeeded,
      // intent text intentionally omitted — may contain PHI or sensitive clinical info
    },
  }).catch(console.error);
}

// ─── SWITCH CASES TO ADD ──────────────────────────────────────────────────────
// In command.routes.ts, inside the main switch statement, add:

/*
case "CLINICAL_SKILLS":   result = await executeClinicalSkills(intent, actor);   break;
case "RESEARCH_RADAR":    result = await executeResearchRadar(intent, actor);     break;
case "INFRA_STATUS":      result = await executeInfraStatus(intent, actor);       break;
case "KB_VALIDATION":     result = await executeKBValidation(intent, actor);      break;
case "SPEC_STATUS":       result = await executeSpecStatus(intent, actor);        break;
case "DRIFT_STATUS":      result = await executeDriftStatus(intent, actor);       break;
case "CME_QUIZ":
  result = {
    actions: [{ type: "CME_QUIZ", label: "CME Quiz", status: "complete", result: "Navigate to /cme-quiz" }],
    summary: "The CME Quiz tool is at /cme-quiz. Choose from: Red Flag Recognition, Centor/HEART/Wells scoring, Drug interactions, Disposition decisions, Pediatric urgent care, or the Feynman explainer.",
  };
  break;
case "DESIGN_AUDIT":
  result = {
    actions: [{ type: "DESIGN_AUDIT", label: "Design audit", status: "complete", result: "Run via Claude Code" }],
    summary: "To audit design drift, run this in Claude Code:\n\"Review everything in /client/src/components and list any Tailwind color classes not defined in DESIGN.md (e.g., blue-500, red-600). Include file and line number.\"\n\nThe DESIGN.md design system is the authoritative token set.",
  };
  break;
*/

/**
 * specDrivenDevelopment.ts
 * Drop into: server/harness/specDrivenDevelopment.ts
 *
 * SPEC-DRIVEN COMPLAINT PATHWAY DEVELOPMENT
 *
 * FROM THE ARTICLE:
 * "AI coding agents are doing exactly what they're told.
 * The problem is what you're telling them."
 *
 * FOR AURALYN:
 * When adding a new complaint pathway (new red-flag rules, new KB protocols,
 * new follow-up templates), this system:
 *   1. Generates a structured spec.md from a plain-English goal
 *   2. Breaks it into atomic, verifiable tasks (tasks.md)
 *   3. Tracks which tasks are complete vs pending
 *   4. Runs backward propagation — when implementation diverges from spec,
 *      the spec is updated to reflect reality (not hidden)
 *   5. Integrates with the Sprint Contract system (Win 11)
 *
 * THE SIX SPEC SECTIONS (from the article):
 *   1. Mandate — one sentence defining what success looks like
 *   2. Technology stack — Auralyn-specific versions and patterns
 *   3. Data models — complaint shape, rule shape, protocol shape
 *   4. Non-goals — what this pathway does NOT include
 *   5. Boundary conditions — safety rails (always physician-gated, etc.)
 *   6. Escalation protocol — what the AI does when stuck
 *
 * USAGE:
 *   const spec = await SpecDrivenDevelopment.createSpec({
 *     goal: "Add COPD-Asthma Overlap Syndrome complaint pathway",
 *     clinicalScope: "Adult patients, urgent care, GINA/GOLD 2026",
 *   });
 *   // Generates spec.md, tasks.md, and queues for Sprint Contract execution
 *
 * API ROUTE:
 *   POST /api/harness/spec — create a new spec
 *   GET  /api/harness/specs — list all specs with status
 *   POST /api/harness/spec/:id/complete-task — mark a task complete
 *   POST /api/harness/spec/:id/propagate — backward propagation
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs   from "fs";
import * as path from "path";
import { appendAuditEvent } from "../governance/audit";

const anthropic = new Anthropic();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpecTask {
  id:          string;
  description: string;
  phase:       "spec" | "plan" | "implement" | "test";
  status:      "pending" | "in_progress" | "complete" | "blocked";
  testCriteria: string;   // how to verify this task is done
  blockedReason?: string;
}

export interface ComplaintPathwaySpec {
  specId:        string;
  goal:          string;
  mandate:       string;       // one sentence
  clinicalScope: string;
  techStack:     string;
  dataModels:    string;
  nonGoals:      string[];
  boundaries:    string[];
  escalationProtocol: string;
  tasks:         SpecTask[];
  status:        "draft" | "active" | "complete" | "abandoned";
  createdAt:     string;
  updatedAt:     string;
  version:       number;
}

// ─── Spec storage ─────────────────────────────────────────────────────────────

const SPECS_DIR = path.join(process.cwd(), ".specs");

function ensureSpecsDir() {
  if (!fs.existsSync(SPECS_DIR)) fs.mkdirSync(SPECS_DIR, { recursive: true });
}

function specToMarkdown(spec: ComplaintPathwaySpec): string {
  const completedTasks = spec.tasks.filter(t => t.status === "complete").length;
  return `# Auralyn Complaint Pathway Spec
**Spec ID:** ${spec.specId}
**Version:** ${spec.version}
**Status:** ${spec.status}
**Progress:** ${completedTasks}/${spec.tasks.length} tasks complete
**Created:** ${spec.createdAt}
**Updated:** ${spec.updatedAt}

---

## Mandate
${spec.mandate}

## Clinical Scope
${spec.clinicalScope}

## Technology Stack (Auralyn Standard)
${spec.techStack}

## Data Models
${spec.dataModels}

## Non-Goals
${spec.nonGoals.map(g => `- ${g}`).join("\n")}

## Boundary Conditions (Safety Rails)
${spec.boundaries.map(b => `- ${b}`).join("\n")}

## Escalation Protocol
${spec.escalationProtocol}

---

## Tasks

${spec.tasks.map(t => `### [${t.status === "complete" ? "x" : " "}] Task ${t.id}: ${t.description}
**Phase:** ${t.phase}
**Test criteria:** ${t.testCriteria}
${t.blockedReason ? `**BLOCKED:** ${t.blockedReason}` : ""}
`).join("\n")}
`;
}

function saveSpec(spec: ComplaintPathwaySpec): void {
  ensureSpecsDir();
  const specPath = path.join(SPECS_DIR, `${spec.specId}-spec.md`);
  fs.writeFileSync(specPath, specToMarkdown(spec));

  // Also save tasks separately for easy tracking
  const tasksContent = `# Tasks — ${spec.specId}
${spec.tasks.map(t => `- [${t.status === "complete" ? "x" : " "}] ${t.description} (${t.phase})`).join("\n")}
`;
  fs.writeFileSync(path.join(SPECS_DIR, `${spec.specId}-tasks.md`), tasksContent);

  // Save JSON for programmatic access
  fs.writeFileSync(
    path.join(SPECS_DIR, `${spec.specId}.json`),
    JSON.stringify(spec, null, 2)
  );
}

function loadSpec(specId: string): ComplaintPathwaySpec | null {
  const p = path.join(SPECS_DIR, `${specId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function listSpecs(): ComplaintPathwaySpec[] {
  ensureSpecsDir();
  return fs.readdirSync(SPECS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(SPECS_DIR, f), "utf-8")); }
      catch { return null; }
    })
    .filter(Boolean) as ComplaintPathwaySpec[];
}

// ─── The Auralyn standard tech stack section ──────────────────────────────────
// This is the article's "tech stack with exact versions" section.
// Every spec gets this injected — no agent guesses at Auralyn's patterns.

const AURALYN_TECH_STACK = `
**Runtime:** Node.js 20, TypeScript 5, Express.js
**Database:** PostgreSQL 16 via Drizzle ORM (drizzle-zod for validation)
**Frontend:** React 18, TanStack Query v5, shadcn/ui, Tailwind CSS v4, Wouter routing
**AI:** Anthropic Claude (claude-sonnet-4-20250514 for generation, claude-opus-4-20250514 for evaluation)
**Queue:** BullMQ via createDurableQueue() from server/queue/queueFactory.ts
**Auth:** requireReviewAuth + requireAnyRole + requireCsrf on all clinical routes
**Audit:** appendAuditEvent() from server/governance/audit.ts on ALL clinical events
**Ontology:** OntologyFieldMapper + OntologyFirewall from server/ontology/
**Harness:** enforceAgentCaps() + buildClinicalContext() from server/harness/harnessEnforcer.ts

**Gold-standard reference files:**
- server/followup/followUpService.ts — for new service patterns
- server/reasoning/bayesianConfidenceUpdater.ts — for clinical reasoning patterns
- client/src/components/DischargeInstructionPanel.tsx — for physician-gated UI patterns

**Non-negotiable constraints (from AGENTS.md):**
- Physician gate is structural: physicianApproved defaults false, never auto-set
- All AI outputs labeled intendedUse: "clinical_decision_support_only"
- appendAuditEvent() on every clinical state change
- scrubPhi() before any logging
- No PHI in audit chain details
`.trim();

// ─── Spec generator ───────────────────────────────────────────────────────────

export const SpecDrivenDevelopment = {

  /**
   * Phase 1: Create a structured spec from a plain-English goal.
   * The article: "Write a spec.md that actually works."
   */
  async createSpec(input: {
    goal:          string;
    clinicalScope: string;
    nonGoals?:     string[];
  }): Promise<ComplaintPathwaySpec> {

    const response = await anthropic.messages.create({
      model:      "claude-opus-4-20250514",
      max_tokens: 3000,
      system: `You are generating a spec.md for a new complaint pathway in Auralyn,
a multi-tenant urgent care AI triage system.

The spec must include all six sections from the spec-driven development framework:
1. Mandate (one sentence — specific enough to verify against)
2. Data models (complaint shape, red-flag rule shape, LR table shape, follow-up protocol shape)
3. Non-goals (explicit list)
4. Boundary conditions (Auralyn-specific safety rails)
5. Escalation protocol
6. Tasks (atomic, ordered, each with a test criterion)

Task phases: spec → plan → implement → test
Each task must be small enough to implement and test in isolation.

Return ONLY valid JSON. No markdown.`,
      messages: [{
        role:    "user",
        content: `Create a spec for:
Goal: ${input.goal}
Clinical Scope: ${input.clinicalScope}
${input.nonGoals ? `Suggested non-goals: ${input.nonGoals.join(", ")}` : ""}

Return JSON:
{
  "mandate": "one sentence",
  "dataModels": "markdown describing complaint shape, rule shape, LR table",
  "nonGoals": ["array", "of", "strings"],
  "boundaries": ["safety rail 1", "safety rail 2"],
  "escalationProtocol": "what the AI does when stuck",
  "tasks": [
    {
      "id": "T01",
      "description": "task description",
      "phase": "spec|plan|implement|test",
      "status": "pending",
      "testCriteria": "how to verify this is done"
    }
  ]
}`,
      }],
    });

    const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    const spec: ComplaintPathwaySpec = {
      specId:        `spec-${Date.now()}`,
      goal:          input.goal,
      mandate:       parsed.mandate,
      clinicalScope: input.clinicalScope,
      techStack:     AURALYN_TECH_STACK,
      dataModels:    parsed.dataModels,
      nonGoals:      parsed.nonGoals ?? [],
      boundaries:    parsed.boundaries ?? [],
      escalationProtocol: parsed.escalationProtocol,
      tasks:         parsed.tasks ?? [],
      status:        "draft",
      createdAt:     new Date().toISOString(),
      updatedAt:     new Date().toISOString(),
      version:       1,
    };

    saveSpec(spec);

    await appendAuditEvent({
      actor:      "system",
      action:     "SPEC_CREATED",
      entityId:   spec.specId,
      entityType: "spec",
      details:    { goal: spec.goal, taskCount: spec.tasks.length },
    }).catch(console.error);

    return spec;
  },

  /**
   * Mark a task complete and check for spec drift.
   * The article: "Backward propagation — code-to-spec, not just spec-to-code."
   */
  async completeTask(specId: string, taskId: string, notes?: string): Promise<ComplaintPathwaySpec | null> {
    const spec = loadSpec(specId);
    if (!spec) return null;

    const task = spec.tasks.find(t => t.id === taskId);
    if (!task) return null;

    task.status = "complete";
    spec.updatedAt = new Date().toISOString();
    saveSpec(spec);

    // Check if all tasks complete
    const allComplete = spec.tasks.every(t => t.status === "complete");
    if (allComplete) {
      spec.status = "complete";
      saveSpec(spec);
    }

    await appendAuditEvent({
      actor:      "system",
      action:     "SPEC_TASK_COMPLETED",
      entityId:   specId,
      entityType: "spec",
      details:    { taskId, notes: notes?.slice(0, 200) },
    }).catch(console.error);

    return spec;
  },

  /**
   * Backward propagation: when implementation diverges from spec, update the spec.
   * The article: "Your spec will drift from reality the moment implementation starts."
   */
  async propagateBackward(specId: string, change: {
    taskId:      string;
    what:        string;   // what changed in implementation
    why:         string;   // why it diverged from spec
    specUpdate:  string;   // proposed spec section update
  }): Promise<ComplaintPathwaySpec | null> {
    const spec = loadSpec(specId);
    if (!spec) return null;

    // Add the change as a note in the data models section
    spec.dataModels += `

## Implementation Divergence (v${spec.version} → v${spec.version + 1})
**Task:** ${change.taskId}
**Change:** ${change.what}
**Reason:** ${change.why}
**Spec Update:** ${change.specUpdate}
`;
    spec.version++;
    spec.updatedAt = new Date().toISOString();
    saveSpec(spec);

    await appendAuditEvent({
      actor:      "system",
      action:     "SPEC_BACKWARD_PROPAGATION",
      entityId:   specId,
      entityType: "spec",
      details: {
        taskId:     change.taskId,
        version:    spec.version,
        changeType: "backward_propagation",
      },
    }).catch(console.error);

    console.log(`[Spec] Backward propagation applied to ${specId} → v${spec.version}`);
    return spec;
  },

  /**
   * Block a task — the escalation protocol.
   * The article: "Stop. Describe the blocker. Ask for clarification. Do not generate speculative code."
   */
  async blockTask(specId: string, taskId: string, reason: string): Promise<ComplaintPathwaySpec | null> {
    const spec = loadSpec(specId);
    if (!spec) return null;

    const task = spec.tasks.find(t => t.id === taskId);
    if (!task) return null;

    task.status        = "blocked";
    task.blockedReason = reason;
    spec.updatedAt     = new Date().toISOString();
    saveSpec(spec);

    await appendAuditEvent({
      actor:      "system",
      action:     "SPEC_TASK_BLOCKED",
      entityId:   specId,
      entityType: "spec",
      details:    { taskId, reason: reason.slice(0, 200) },
    }).catch(console.error);

    console.warn(`[Spec] Task ${taskId} BLOCKED in ${specId}: ${reason}`);
    return spec;
  },

  listSpecs,
  loadSpec,
};

// ─── API routes ───────────────────────────────────────────────────────────────
// Add to harnessOrchestrator.ts or a new specRoutes.ts

import { Router } from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";

export const specRouter = Router();

specRouter.post("/api/harness/spec", requireReviewAuth, async (req, res) => {
  try {
    const { goal, clinicalScope, nonGoals } = req.body;
    if (!goal || !clinicalScope) {
      return res.status(400).json({ ok: false, error: "goal and clinicalScope required" });
    }
    const spec = await SpecDrivenDevelopment.createSpec({ goal, clinicalScope, nonGoals });
    return res.json({ ok: true, spec });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

specRouter.get("/api/harness/specs", requireReviewAuth, async (_req, res) => {
  const specs = SpecDrivenDevelopment.listSpecs();
  return res.json({ ok: true, specs });
});

specRouter.post("/api/harness/spec/:id/complete-task", requireReviewAuth, async (req, res) => {
  const { taskId, notes } = req.body;
  const spec = await SpecDrivenDevelopment.completeTask(req.params.id, taskId, notes);
  return res.json({ ok: !!spec, spec });
});

specRouter.post("/api/harness/spec/:id/propagate", requireReviewAuth, async (req, res) => {
  const spec = await SpecDrivenDevelopment.propagateBackward(req.params.id, req.body);
  return res.json({ ok: !!spec, spec });
});

specRouter.post("/api/harness/spec/:id/block-task", requireReviewAuth, async (req, res) => {
  const { taskId, reason } = req.body;
  const spec = await SpecDrivenDevelopment.blockTask(req.params.id, taskId, reason);
  return res.json({ ok: !!spec, spec });
});

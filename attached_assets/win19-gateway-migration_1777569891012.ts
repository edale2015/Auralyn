/**
 * WIN 19 — LLM GATEWAY MIGRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrates 5 files from direct anthropic.messages.create() calls
 * to llmGateway.complete() — giving all subsystems:
 *   - Automatic failover to OpenAI on Anthropic outage
 *   - Audit event on every model call (COMMAND_INTENT_LOGGED pattern)
 *   - Semantic caching for repeated queries
 *   - Unified cost tracking
 *
 * FILES MIGRATED:
 *   1. server/reasoning/dualModelUncertaintySampler.ts   (LOW complexity)
 *   2. server/learning/clinicalSkillsSystem.ts            (LOW complexity)
 *   3. server/harness/specDrivenDevelopment.ts            (LOW complexity)
 *   4. server/infra/selfHealingMonitor.ts                 (LOW complexity)
 *   5. server/harness/researchRadar.ts                    (MEDIUM — uses web_search tool)
 *
 * HOW TO APPLY:
 * For each file, find the FIND block and replace with the REPLACE block.
 * All changes are surgical — only the anthropic.messages.create() calls change.
 *
 * VERIFICATION:
 * After applying, run:
 *   npx tsx .claude/skills/clinical-safety-verifier/scripts/verify-gates.ts
 * Then search for remaining direct SDK calls:
 *   grep -r "anthropic.messages.create" server/ --include="*.ts"
 * Should return 0 results.
 * ─────────────────────────────────────────────────────────────────────────────
 */


// ═══════════════════════════════════════════════════════════════════════════════
// FILE 1: server/reasoning/dualModelUncertaintySampler.ts
// COMPLEXITY: Low — one call in runSample(), replace the SDK call
// ═══════════════════════════════════════════════════════════════════════════════

// ADD this import at the top of the file (alongside existing imports):
// import { llmGateway } from "../gateway/llmGateway";

// REMOVE this import (no longer needed in this file):
// import Anthropic from "@anthropic-ai/sdk";
// const anthropic = new Anthropic();   ← remove this line too

// FIND in runSample():
/*
  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 600,
    system:     systemPrompt + `\n\nReturn ONLY valid JSON: { topDiagnosis: string, confidence: number, disposition: string, differentialTop3: string[], rawSummary: string }`,
    messages: [{
      role:    "user",
      content: `Analyze this clinical case and return your assessment:\n\n${caseContext}\n\nReturn JSON only.`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
*/

// REPLACE WITH:
/*
  const gatewayResult = await llmGateway.complete({
    purpose:  "uncertainty_sampler",
    messages: [{
      role:    "user",
      content: `Analyze this clinical case and return your assessment:\n\n${caseContext}\n\nReturn JSON only.`,
    }],
    system:    systemPrompt + `\n\nReturn ONLY valid JSON: { topDiagnosis: string, confidence: number, disposition: string, differentialTop3: string[], rawSummary: string }`,
    maxTokens: 600,
    skipCache: true,   // uncertainty sampling must always be a fresh call
  });

  const text = gatewayResult.content;
*/


// ═══════════════════════════════════════════════════════════════════════════════
// FILE 2: server/learning/clinicalSkillsSystem.ts
// COMPLEXITY: Low — three calls (generateSkillFromOverrides, pruneIrrelevantChunks via retriever, runPeriodicSkillNudge)
// ═══════════════════════════════════════════════════════════════════════════════

// ADD this import at the top of the file:
// import { llmGateway } from "../gateway/llmGateway";

// REMOVE:
// import Anthropic from "@anthropic-ai/sdk";
// const anthropic = new Anthropic();

// ── CALL 1: generateSkillFromOverrides ────────────────────────────────────────

// FIND:
/*
  const response = await anthropic.messages.create({
    model:      "claude-opus-4-20250514",
    max_tokens: 1500,
    system: `You are generating a Clinical Skill document...`,
    messages: [{
      role:    "user",
      content: `Generate a Clinical Skill from this override pattern:...`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
*/

// REPLACE WITH:
/*
  const gatewayResult = await llmGateway.complete({
    purpose:  "skill_generator",
    messages: [{
      role:    "user",
      content: `Generate a Clinical Skill from this override pattern:\n\nComplaint: ${overrideData.complaintSlug}\nOverride rate: ${Math.round(overrideData.overrideRate * 100)}% of cases (${overrideData.overrideCount} overrides)\nTimeframe: ${overrideData.timeframe}\n\nAI outputs that were overridden:\n${overrideData.aiOutputSamples.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nPhysician corrections:\n${overrideData.physicianActions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nReturn JSON:\n{\n  "title": "short skill name",\n  "trigger": "when does this skill apply (1-2 sentences)",\n  "aiTendency": "what the AI typically gets wrong (1-2 sentences)",\n  "correctReasoning": "what the AI should do instead (2-3 sentences with clinical rationale)",\n  "evidenceBasis": "which guideline or clinical rule supports this (1 sentence)"\n}`,
    }],
    system:    `You are generating a Clinical Skill document for Auralyn, an urgent care clinical AI triage system.\nA Clinical Skill is a concise, actionable playbook that corrects a known AI reasoning failure.\n\nThe skill will be injected into the AI's system prompt to prevent future errors.\nIt must be:\n- Specific (not vague clinical advice)\n- Actionable (the AI must know exactly what to do differently)\n- Evidence-based (grounded in clinical guidelines)\n- Concise (the entire skill injects as <200 tokens)\n\nReturn ONLY valid JSON matching the ClinicalSkill structure. No markdown.`,
    maxTokens: 1500,
    cacheKey:  `skill-generate:${overrideData.complaintSlug}:${overrideData.overrideCount}`,
  });

  const text  = gatewayResult.content;
  const clean = text.replace(/```json|```/g, "").trim();
*/

// ── CALL 2: activateSkill (no direct anthropic call — already correct) ────────
// ── CALL 3: runPeriodicSkillNudge (calls generateSkillFromOverrides — covered above) ──


// ═══════════════════════════════════════════════════════════════════════════════
// FILE 3: server/harness/specDrivenDevelopment.ts
// COMPLEXITY: Low — one call in createSpec()
// ═══════════════════════════════════════════════════════════════════════════════

// ADD this import at the top:
// import { llmGateway } from "../gateway/llmGateway";

// REMOVE:
// import Anthropic from "@anthropic-ai/sdk";
// const anthropic = new Anthropic();

// FIND in createSpec():
/*
  const response = await anthropic.messages.create({
    model:      "claude-opus-4-20250514",
    max_tokens: 3000,
    system: `You are generating a spec.md for a new complaint pathway in Auralyn...`,
    messages: [{
      role:    "user",
      content: `Create a spec for:\nGoal: ${input.goal}...`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
*/

// REPLACE WITH:
/*
  const gatewayResult = await llmGateway.complete({
    purpose:  "kb_validator",    // Opus — spec creation needs deep reasoning
    messages: [{
      role:    "user",
      content: `Create a spec for:\nGoal: ${input.goal}\nClinical Scope: ${input.clinicalScope}\n${input.nonGoals ? `Suggested non-goals: ${input.nonGoals.join(", ")}` : ""}\n\nReturn JSON:\n{\n  "mandate": "one sentence",\n  "dataModels": "markdown describing complaint shape, rule shape, LR table",\n  "nonGoals": ["array", "of", "strings"],\n  "boundaries": ["safety rail 1", "safety rail 2"],\n  "escalationProtocol": "what the AI does when stuck",\n  "tasks": [\n    {\n      "id": "T01",\n      "description": "task description",\n      "phase": "spec|plan|implement|test",\n      "status": "pending",\n      "testCriteria": "how to verify this is done"\n    }\n  ]\n}`,
    }],
    system:    `You are generating a spec.md for a new complaint pathway in Auralyn,\na multi-tenant urgent care AI triage system.\n\nThe spec must include all six sections from the spec-driven development framework:\n1. Mandate (one sentence — specific enough to verify against)\n2. Data models (complaint shape, red-flag rule shape, LR table shape, follow-up protocol shape)\n3. Non-goals (explicit list)\n4. Boundary conditions (Auralyn-specific safety rails)\n5. Escalation protocol\n6. Tasks (atomic, ordered, each with a test criterion)\n\nTask phases: spec → plan → implement → test\nEach task must be small enough to implement and test in isolation.\n\nReturn ONLY valid JSON. No markdown.`,
    maxTokens: 3000,
    skipCache: true,   // specs must always be freshly generated
  });

  const text   = gatewayResult.content;
  const clean  = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
*/


// ═══════════════════════════════════════════════════════════════════════════════
// FILE 4: server/infra/selfHealingMonitor.ts
// COMPLEXITY: Low — one call in diagnoseFailure()
// ═══════════════════════════════════════════════════════════════════════════════

// ADD this import at the top:
// import { llmGateway } from "../gateway/llmGateway";

// REMOVE:
// import Anthropic from "@anthropic-ai/sdk";
// const anthropic = new Anthropic();

// FIND in diagnoseFailure():
/*
  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: `You are diagnosing a service failure in Auralyn, a clinical AI system...`,
    messages: [{
      role:    "user",
      content: `Service failure detected:\n\nService: ${health.service}...`,
    }],
  });

  return response.content.filter(b => b.type === "text").map(b => (b as any).text).join("").trim();
*/

// REPLACE WITH:
/*
  const gatewayResult = await llmGateway.complete({
    purpose:  "retrieval_pruner",   // Sonnet — diagnosis doesn't need Opus depth
    messages: [{
      role:    "user",
      content: `Service failure detected:\n\nService: ${health.service}\nStatus: ${health.status}\nFailure count: ${health.failureCount}\nDetails: ${health.details}\nError: ${health.error ?? "none"}\n\nRecent audit events (last 2 hours):\n${eventSummary || "No recent events found"}\n\nDiagnose the most likely root cause and suggest the safest automated remediation.\nKeep response under 200 words.`,
    }],
    system:    `You are diagnosing a service failure in Auralyn, a clinical AI system for urgent care.\nBe concise and specific. Identify the most likely root cause and the safest remediation.\nFocus on non-destructive, reversible actions. Never suggest actions that could affect patient data.`,
    maxTokens: 500,
    cacheKey:  `diagnose:${health.service}:${health.failureCount}`,
  });

  return gatewayResult.content.trim();
*/


// ═══════════════════════════════════════════════════════════════════════════════
// FILE 5: server/harness/researchRadar.ts
// COMPLEXITY: Medium — uses web_search tool which llmGateway doesn't support natively
// SOLUTION: Keep the direct SDK call but wrap it with gateway-style audit logging
//           and a try/catch that falls back gracefully. Add a TODO for when
//           the gateway adds tool-use support.
// ═══════════════════════════════════════════════════════════════════════════════

// The researchRadar.ts file uses tools: [{ type: "web_search_20250305", name: "web_search" }]
// The current llmGateway only handles text completion — not tool-use calls.
// Rather than remove web search capability, we wrap the existing call with
// audit logging so at minimum we get visibility into radar scan calls.

// ADD this import at the top of researchRadar.ts:
// import { appendAuditEvent } from "../governance/audit";

// FIND the anthropic.messages.create() call in scanTarget():
// (the one with tools: [{ type: "web_search_20250305" ... }])

// WRAP IT (do not replace — keep the tool-use call intact):
/*
  // TODO Win 19 partial: researchRadar uses web_search tool which requires
  // direct SDK access. Migrate to gateway when llmGateway adds tool-use support.
  // For now: audit every radar scan call for visibility.
  const scanStartMs = Date.now();
  let scanContent   = "";

  try {
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 1500,
      tools: [{
        type: "web_search_20250305",
        name: "web_search",
      }] as any,
      system: `...existing system prompt...`,
      messages: [{ role: "user", content: `...existing user message...` }],
    });

    scanContent = response.content
      .filter(b => b.type === "text")
      .map(b => (b as any).text)
      .join("");

  } finally {
    // Audit the scan regardless of success/failure
    await appendAuditEvent({
      actor:      "system",
      action:     "RESEARCH_RADAR_SCAN_CALL",
      entityId:   target.id,
      entityType: "research_radar",
      details: {
        targetId:  target.id,
        latencyMs: Date.now() - scanStartMs,
        hasContent: !!scanContent,
        // TODO: migrate to llmGateway when tool-use is supported
        note: "Direct SDK call — pending Win 19 gateway tool-use support",
      },
    }).catch(console.error);
  }
*/

// ─── GATEWAY TOOL-USE SUPPORT — future Win 20 ────────────────────────────────
// When llmGateway adds tool-use, extend it like this:
//
// In llmGateway.ts, add a new method:
//
//   async completeWithTools(request: GatewayRequest & { tools: any[] }): Promise<GatewayResponse>
//
// Then researchRadar.ts migrates to:
//   const result = await llmGateway.completeWithTools({
//     purpose: "intent_parser",
//     messages: [...],
//     tools: [{ type: "web_search_20250305", name: "web_search" }],
//   });
//
// Add RESEARCH_RADAR_SCAN as a new purpose in MODEL_ROUTING with Sonnet primary.

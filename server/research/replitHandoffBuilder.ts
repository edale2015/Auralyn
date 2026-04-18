/**
 * server/research/replitHandoffBuilder.ts
 * Replit Handoff Package Builder — creates a review packet for Replit Agent.
 *
 * Produces 3 markdown files committed alongside the patch:
 *   REVIEW_PACKET.md       — full context for Agent to understand the change
 *   AGENT_SKILL.md         — clinical safety constraints for Agent to follow
 *   IMPLEMENTATION_TASK.md — explicit task description with guardrails
 *
 * These files are committed to the GitHub branch so that when Replit syncs
 * from GitHub, Agent can read them and review/implement only that slice.
 */

export type ReplitHandoffInput = {
  proposalId:             number;
  title:                  string;
  rationale:              string;
  claudeRecommendations?: string;
  openaiSummary?:         string;
  affectedFiles:          string[];
  codeRecommendations:    string[];
  validationPlan:         string[];
};

export type ReplitHandoffBundle = Record<string, string>;

export function buildReplitHandoffBundle(input: ReplitHandoffInput): ReplitHandoffBundle {
  const reviewMd = `# Replit Review Packet — Proposal #${input.proposalId}

## Title
${input.title}

## Rationale
${input.rationale}

## Claude Recommendations
${input.claudeRecommendations ?? "N/A"}

## OpenAI Clinical Review Summary
${input.openaiSummary ?? "N/A"}

## Affected Files
${input.affectedFiles.map(f => `- ${f}`).join("\n")}

## Code Recommendations
${input.codeRecommendations.map(x => `- ${x}`).join("\n")}

## Validation Requirements
${input.validationPlan.map(x => `- ${x}`).join("\n")}

## Safety Constraints
- Do not weaken hallucination safeguards
- Do not bypass physician review
- Do not let RAG outputs directly set final disposition
- Preserve audit logging and validation gates
- Prefer additive changes and small diffs
- Changes to clinical logic require golden case coverage
`;

  const skillMd = `# Auralyn Medical Safety Skill

When reviewing or modifying this codebase:

## Clinical Safety Rules
- Optimize for conservative clinical safety at all times
- Treat unsafe under-triage as the highest-risk failure mode
- Never bypass validation gates or physician review queues
- Never let source-grounded Q&A directly set disposition
- Preserve auditability — every decision must be traceable

## Implementation Rules
- Keep diffs small and explicit
- Add tests where changes alter logic
- Use TypeScript strict mode
- Do not create new unbounded async loops
- Do not add new dependencies without explicit justification

## Scope Rules
- Review and implement ONLY what is described in REVIEW_PACKET.md
- Do not refactor unrelated code
- Do not rename existing symbols unless explicitly instructed
- Do not change existing tests unless the test itself is wrong
`;

  const taskMd = `# Replit Agent Task — Proposal #${input.proposalId}

Please independently review the proposed change in REVIEW_PACKET.md, then implement it ONLY if:
1. All existing safety barriers are preserved
2. No new path to unsafe home disposition is introduced
3. Validation discipline remains intact
4. The change improves maintainability or clinical safety

## Steps
1. Read REVIEW_PACKET.md and AGENT_SKILL.md
2. Review the affected files listed
3. Propose your implementation plan before writing code
4. Write code changes (minimal diff, no scope creep)
5. List exactly what changed
6. List any risks introduced
7. List what must be re-validated

## Stop Conditions
If the proposed change would:
- Weaken any hallucination guard → STOP and explain why
- Remove a physician review step → STOP and explain why
- Allow RAG to set final disposition → STOP and explain why

Do not proceed past a stop condition without explicit human instruction.
`;

  return {
    "research/replit/REVIEW_PACKET.md":       reviewMd,
    "research/replit/AGENT_SKILL.md":         skillMd,
    "research/replit/IMPLEMENTATION_TASK.md": taskMd,
  };
}

/** Slice-specific handoff — smaller scope, stays within one code slice */
export function buildSliceHandoffBundle(proposal: {
  id: number;
  title: string;
  rationale: string;
  affectedFiles: string[];
  validationPlan: string[];
}): ReplitHandoffBundle {
  return {
    "research/replit/SLICE_REVIEW_PACKET.md": `# Slice Review Packet — Proposal #${proposal.id}

Title: ${proposal.title}

Rationale:
${proposal.rationale}

Affected Files:
${(proposal.affectedFiles as string[]).map(f => `- ${f}`).join("\n")}

Validation Plan:
${(proposal.validationPlan as string[]).map(x => `- ${x}`).join("\n")}

## Constraints
- Stay within this slice unless a dependency is truly required
- Do not bypass physician review
- Do not weaken hallucination controls
- Keep diff small and testable
- Run validation harness after any clinical logic change
`,
    "research/replit/SLICE_IMPLEMENTATION_TASK.md": `# Agent Task — Slice #${proposal.id}

Implement this slice only. Do NOT roam into unrelated files.

Steps:
1. Independently review the proposed slice change
2. Suggest any safer alternatives if applicable
3. Write code ONLY for the files listed in SLICE_REVIEW_PACKET.md
4. List all risks introduced
5. List what must be re-validated after the change
`,
  };
}

/**
 * ClinicalContextManager — the deterministic harness
 *
 * Every prompt to every agent in the Auralyn pipeline is assembled HERE,
 * not in the agents themselves. When something goes wrong, the failure is
 * in one place — not scattered across six agents.
 *
 * Responsibilities:
 *   1. Hold the canonical encounter state (immutables, working, artifacts).
 *   2. Promote facts into immutables when they become red flags / constraints.
 *   3. Assemble a properly-budgeted prompt for a requested agent role.
 *   4. Answer queries like "have we already ruled this out?"
 *   5. Record artifacts produced by agents.
 *
 * It does NOT call the model. It does NOT decide what tools to use.
 * Those are upstream concerns. This module is the single source of truth
 * for "what does this agent see right now."
 *
 * File: server/context/ClinicalContextManager.ts
 */

import {
  AgentRole,
  Artifact,
  ArtifactType,
  AssembledPrompt,
  ClinicalImmutables,
  DifferentialItem,
  EncounterContext,
  RedFlag,
  WorkingContext,
} from "./types";

// Conservative token budget. Real models can take more, but performance
// degrades well before the limit. These are effective window sizes.
const PROMPT_BUDGET_TOKENS: Record<AgentRole, number> = {
  triage:       6_000,
  differential: 12_000,
  disposition:  14_000,
  billing:       8_000,
  supervisor:   16_000,
};

// Rough heuristic: 1 token ≈ 3.5 characters for clinical English with codes.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export class ClinicalContextManager {
  private ctx: EncounterContext;

  constructor(initial: EncounterContext) {
    this.ctx = initial;
  }

  // ─── Reads ──────────────────────────────────────────────────────────────

  getContext(): EncounterContext {
    return this.ctx;
  }

  getImmutables(): ClinicalImmutables {
    return this.ctx.immutables;
  }

  getArtifactsOfType(type: ArtifactType): Artifact[] {
    return this.ctx.artifacts.filter(a => a.type === type);
  }

  /**
   * Has this diagnosis already been ruled out? Prevents agents from
   * re-running the same exclusion reasoning.
   */
  isRuledOut(diagnosis: string): { ruledOut: boolean; reason?: string } {
    const match = this.ctx.artifacts.find(
      a =>
        a.type === "ruled_out" &&
        "diagnosis" in a.payload &&
        (a.payload as any).diagnosis.toLowerCase() === diagnosis.toLowerCase(),
    );
    if (!match) return { ruledOut: false };
    return {
      ruledOut: true,
      reason: "reason" in match.payload ? (match.payload as any).reason : undefined,
    };
  }

  /** Has this attempt already failed? Prevents retry loops. */
  hasFailedAttempt(attemptKey: string): boolean {
    return this.ctx.artifacts.some(
      a =>
        a.type === "failed_attempt" &&
        "attempted" in a.payload &&
        (a.payload as any).attempted === attemptKey,
    );
  }

  // ─── Writes ─────────────────────────────────────────────────────────────

  /** Idempotent: never add the same red flag twice. */
  addRedFlag(flag: RedFlag): void {
    if (this.ctx.immutables.redFlagsIdentified.some(f => f.id === flag.id)) return;
    this.ctx.immutables.redFlagsIdentified.push(flag);
  }

  addHardConstraint(constraint: string): void {
    if (!this.ctx.immutables.hardConstraints.includes(constraint)) {
      this.ctx.immutables.hardConstraints.push(constraint);
    }
  }

  /** Idempotent by id — agents may try to re-record the same finding. */
  recordArtifact(a: Artifact): void {
    if (this.ctx.artifacts.some(x => x.id === a.id)) return;
    this.ctx.artifacts.push(a);
  }

  updateWorking(patch: Partial<WorkingContext>): void {
    this.ctx.working = { ...this.ctx.working, ...patch };
  }

  upsertDifferentialItem(item: DifferentialItem): void {
    const existing = this.ctx.working.currentDifferential.findIndex(
      d => d.diagnosis === item.diagnosis,
    );
    if (existing >= 0) {
      this.ctx.working.currentDifferential[existing] = item;
    } else {
      this.ctx.working.currentDifferential.push(item);
    }
  }

  // ─── Prompt assembly ────────────────────────────────────────────────────

  /**
   * Build a prompt for a specific agent role. Each role gets ONLY what it
   * needs, in a stable order that favors recall: immutables at the TOP and
   * BOTTOM, working context in the middle.
   *
   * The bookending of immutables addresses middle-of-context recall failure —
   * safety-critical facts that appear only in the middle are more likely to
   * be missed by the model.
   */
  assemblePromptFor(role: AgentRole, instruction: string): AssembledPrompt {
    const budget = PROMPT_BUDGET_TOKENS[role];

    const systemPrompt     = this.buildSystemPrompt(role);
    const immutablesBlock  = this.serializeImmutables();
    const workingBlock     = this.serializeWorkingForRole(role);
    const { artifactBlock, includedIds, excludedIds } = this.selectArtifactsForRole(
      role,
      budget - estimateTokens(systemPrompt + immutablesBlock + workingBlock + instruction) - 500,
    );

    const userPrompt = [
      "## CLINICAL IMMUTABLES (top)",
      immutablesBlock,
      "",
      "## WORKING CONTEXT",
      workingBlock,
      "",
      "## DURABLE ARTIFACTS",
      artifactBlock,
      "",
      "## CLINICAL IMMUTABLES (re-stated)",
      this.serializeImmutablesCompact(),
      "",
      "## YOUR TASK",
      instruction,
    ].join("\n");

    const estimatedTokens = estimateTokens(systemPrompt + userPrompt);

    return {
      systemPrompt,
      userPrompt,
      estimatedTokens,
      includedArtifactIds: includedIds,
      toolNames: [],
      excluded: {
        artifactIds: excludedIds,
        reason:      excludedIds.length > 0 ? "token_budget" : "none",
      },
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private buildSystemPrompt(role: AgentRole): string {
    const base =
      "You are part of Auralyn, a clinical triage and revenue optimization platform. " +
      "You operate under physician supervision. NEVER override or contradict items " +
      "in CLINICAL IMMUTABLES — those are fixed safety constraints for this encounter. " +
      "If a red flag is present, your reasoning MUST account for it.";

    const roleSpecific: Record<AgentRole, string> = {
      triage:
        "Role: TRIAGE. Identify acuity, surface red flags, and propose initial questions. " +
        "Output: red flags found (if any), acuity classification, top 3 initial questions.",
      differential:
        "Role: DIFFERENTIAL. Maintain a ranked differential. For each entry, list supporting " +
        "and refuting findings. Use the RULED_OUT artifacts — do not re-litigate those. " +
        "Propose questions that DISCRIMINATE between top differentials.",
      disposition:
        "Role: DISPOSITION. Recommend disposition (home / urgent consult / ED transfer / admit). " +
        "Respect ALL hard constraints and red flags. Cite KB chunks for any guideline-driven " +
        "decision. If preconditions for the preferred disposition aren't met, say what's missing.",
      billing:
        "Role: BILLING. Propose CPT/E&M codes and modifiers grounded in the VALIDATED_FINDINGS " +
        "and DECISIONS artifacts. Do NOT infer findings not present in artifacts. Flag any " +
        "documentation gap that would block a clean claim.",
      supervisor:
        "Role: SUPERVISOR. Review the assembled context and either APPROVE the proposed " +
        "disposition or REJECT with a specific reason. You have authority to add hard " +
        "constraints. You CANNOT remove red flags.",
    };

    return `${base}\n\n${roleSpecific[role]}`;
  }

  private serializeImmutables(): string {
    const im    = this.ctx.immutables;
    const lines: string[] = [];
    lines.push(`Encounter: ${im.encounterId}  |  Started: ${im.encounterStartedAt}`);
    lines.push(
      `Patient: ${im.patient.ageYears}y ${im.patient.sex}` +
      (im.patient.pregnancyStatus && im.patient.pregnancyStatus !== "n/a"
        ? `  |  Pregnancy: ${im.patient.pregnancyStatus}`
        : ""),
    );
    lines.push(`Chief complaint: ${im.chiefComplaint}`);
    lines.push(`Allergies: ${im.patient.allergies.join(", ") || "NKDA"}`);
    lines.push(`Current meds: ${im.patient.currentMedications.join(", ") || "none reported"}`);
    if (im.patient.relevantHistory.length) {
      lines.push(`Active PMH: ${im.patient.relevantHistory.join("; ")}`);
    }
    if (im.presentingVitals) {
      const v = im.presentingVitals;
      const parts: string[] = [];
      if (v.hr)                     parts.push(`HR ${v.hr}`);
      if (v.sbp && v.dbp)           parts.push(`BP ${v.sbp}/${v.dbp}`);
      if (v.rr)                     parts.push(`RR ${v.rr}`);
      if (v.spo2)                   parts.push(`SpO2 ${v.spo2}%`);
      if (v.tempC)                  parts.push(`Temp ${v.tempC}°C`);
      if (v.painScale !== undefined) parts.push(`Pain ${v.painScale}/10`);
      lines.push(`Vitals: ${parts.join("  ")}`);
    }
    if (im.redFlagsIdentified.length) {
      lines.push("RED FLAGS (PERMANENT FOR THIS ENCOUNTER):");
      for (const rf of im.redFlagsIdentified) {
        lines.push(`  • ${rf.description}  (source: ${rf.source})`);
      }
    }
    if (im.hardConstraints.length) {
      lines.push("HARD CONSTRAINTS:");
      for (const c of im.hardConstraints) lines.push(`  • ${c}`);
    }
    return lines.join("\n");
  }

  private serializeImmutablesCompact(): string {
    const im          = this.ctx.immutables;
    const flags       = im.redFlagsIdentified.map(r => r.description).join("; ") || "none";
    const constraints = im.hardConstraints.join("; ") || "none";
    return `CC: ${im.chiefComplaint}  |  Red flags: ${flags}  |  Hard constraints: ${constraints}`;
  }

  private serializeWorkingForRole(role: AgentRole): string {
    const w     = this.ctx.working;
    const lines: string[] = [`Current step: ${w.step}  |  Current agent: ${w.currentAgent}`];

    if (role !== "billing" && w.currentDifferential.length) {
      lines.push("Current differential:");
      for (const d of w.currentDifferential.slice(0, 8)) {
        lines.push(
          `  • ${d.diagnosis} (${(d.likelihood * 100).toFixed(0)}%, ${d.evidenceQuality})  ` +
          `+: ${d.supportingFindings.join(",") || "—"}  ` +
          `-: ${d.refutingFindings.join(",") || "—"}`,
        );
      }
    }

    if ((role === "differential" || role === "disposition") && w.answeredQuestions.length) {
      lines.push("Answered questions (last 10):");
      for (const q of w.answeredQuestions.slice(-10)) {
        lines.push(`  Q: ${q.question}\n  A: ${q.answer}`);
      }
    }

    if ((role === "disposition" || role === "supervisor") && w.candidateDispositions.length) {
      lines.push("Candidate dispositions:");
      for (const d of w.candidateDispositions) {
        lines.push(
          `  • ${d.type}: ${d.rationale}  ` +
          `(blockers: ${d.blockers.join(", ") || "none"})`,
        );
      }
    }

    return lines.join("\n");
  }

  /**
   * Select which artifacts to include for this role, fitting within budget.
   * Priority: red-flag-relevant > role-relevant > recency.
   * `ruled_out` and `failed_attempt` always win priority — they prevent re-litigation.
   */
  private selectArtifactsForRole(
    role: AgentRole,
    tokenBudget: number,
  ): { artifactBlock: string; includedIds: string[]; excludedIds: string[] } {
    const relevance  = ARTIFACT_RELEVANCE_BY_ROLE[role];
    const candidates = this.ctx.artifacts
      .filter(a => relevance.includes(a.type))
      .sort((a, b) => {
        const aPri = (a.type === "failed_attempt" || a.type === "ruled_out") ? 0 : 1;
        const bPri = (b.type === "failed_attempt" || b.type === "ruled_out") ? 0 : 1;
        if (aPri !== bPri) return aPri - bPri;
        return b.producedAt.localeCompare(a.producedAt);
      });

    const included: Artifact[] = [];
    const excludedIds: string[] = [];
    let used = 0;
    for (const a of candidates) {
      if (used + a.estimatedTokens <= tokenBudget) {
        included.push(a);
        used += a.estimatedTokens;
      } else {
        excludedIds.push(a.id);
      }
    }

    const block = included.map(a => this.serializeArtifact(a)).join("\n");
    return { artifactBlock: block || "(none)", includedIds: included.map(a => a.id), excludedIds };
  }

  private serializeArtifact(a: Artifact): string {
    const head = `[${a.type} | ${a.producedBy} @ step from ${a.producedAt}]`;
    const cite =
      a.provenance.citation ||
      (a.provenance.kbChunkIds || []).join(",") ||
      a.provenance.source;
    const body = JSON.stringify(a.payload);
    return `${head}\n  cite: ${cite}\n  ${body}`;
  }
}

// Which artifact types each role actually needs.
// Smaller, role-specific selection = less context pollution.
const ARTIFACT_RELEVANCE_BY_ROLE: Record<AgentRole, ArtifactType[]> = {
  triage: ["validated_finding"],
  differential: [
    "validated_finding",
    "kb_retrieval",
    "ruled_out",
    "calculation",
    "uncertainty",
    "failed_attempt",
  ],
  disposition: [
    "validated_finding",
    "kb_retrieval",
    "ruled_out",
    "calculation",
    "decision",
    "uncertainty",
  ],
  billing:    ["validated_finding", "decision"],
  supervisor: [
    "validated_finding",
    "kb_retrieval",
    "ruled_out",
    "calculation",
    "decision",
    "uncertainty",
    "failed_attempt",
    "compaction_summary",
  ],
};

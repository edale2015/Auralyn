/**
 * AgentArtifactBus — structured inter-agent communication.
 *
 * Replaces the "everyone reads everyone's transcript" anti-pattern.
 *
 * Each agent role declares:
 *   - what artifact types it PRODUCES
 *   - what artifact types it CONSUMES
 *
 * The bus enforces the contract: a billing agent that tries to read
 * `failed_attempt` artifacts (which it doesn't need) gets nothing back.
 * A differential agent that tries to PRODUCE a `decision` artifact (which
 * is a disposition agent's job) gets rejected.
 *
 * This is what "communication via artifacts, not shared memory" looks like
 * in practice for Auralyn.
 */

import { AgentRole, Artifact, ArtifactType } from "./types";

interface AgentContract {
  produces: ArtifactType[];
  consumes: ArtifactType[];
}

const CONTRACTS: Record<AgentRole, AgentContract> = {
  triage: {
    produces: ["validated_finding"],
    consumes: [],
  },
  differential: {
    produces: ["validated_finding", "kb_retrieval", "ruled_out", "calculation", "uncertainty", "failed_attempt"],
    consumes: ["validated_finding", "kb_retrieval", "ruled_out", "calculation", "uncertainty", "failed_attempt"],
  },
  disposition: {
    produces: ["decision", "uncertainty"],
    consumes: ["validated_finding", "kb_retrieval", "ruled_out", "calculation", "uncertainty"],
  },
  billing: {
    produces: ["decision"], // billing codes ARE decisions
    consumes: ["validated_finding", "decision"],
  },
  supervisor: {
    // Supervisor can produce ruled_outs and decisions, AND has the unique
    // authority (enforced upstream in the ContextManager) to add hard
    // constraints and override.
    produces: ["ruled_out", "decision", "uncertainty"],
    consumes: [
      "validated_finding",
      "kb_retrieval",
      "ruled_out",
      "calculation",
      "decision",
      "uncertainty",
      "failed_attempt",
      "compaction_summary",
    ],
  },
};

export class ContractViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractViolation";
  }
}

export class AgentArtifactBus {
  private artifacts: Artifact[] = [];
  /** Per-agent read receipts so we can mark consumedBy on artifacts. */
  private readReceipts: Map<string, Set<AgentRole>> = new Map();

  /**
   * Publish an artifact produced by an agent. Throws ContractViolation if
   * the agent isn't authorized to produce this artifact type.
   */
  publish(producer: AgentRole, artifact: Artifact): void {
    const contract = CONTRACTS[producer];
    if (!contract.produces.includes(artifact.type)) {
      throw new ContractViolation(
        `Agent '${producer}' is not allowed to produce artifact type '${artifact.type}'. ` +
          `Allowed types: ${contract.produces.join(", ")}`,
      );
    }
    if (artifact.producedBy !== producer) {
      throw new ContractViolation(
        `Artifact.producedBy ('${artifact.producedBy}') does not match publisher ('${producer}').`,
      );
    }
    // Dedupe by id
    if (this.artifacts.some((a) => a.id === artifact.id)) return;
    this.artifacts.push(artifact);
  }

  /**
   * Read all artifacts available to a given consumer. Filters to only the
   * types the consumer is contracted to consume, and marks them as read.
   */
  readFor(consumer: AgentRole): Artifact[] {
    const contract = CONTRACTS[consumer];
    const visible = this.artifacts.filter((a) => contract.consumes.includes(a.type));
    for (const a of visible) {
      const set = this.readReceipts.get(a.id) ?? new Set();
      set.add(consumer);
      this.readReceipts.set(a.id, set);
      if (!a.consumedBy.includes(consumer)) {
        a.consumedBy = [...a.consumedBy, consumer];
      }
    }
    return visible;
  }

  /**
   * Inspect what an agent is contracted to do (useful for debugging
   * "why didn't the billing agent see X?").
   */
  contractFor(role: AgentRole): AgentContract {
    return CONTRACTS[role];
  }

  /** All artifacts (for the ContextManager to persist). */
  all(): Artifact[] {
    return [...this.artifacts];
  }

  /** Replace internal state — used when rehydrating from persistence. */
  hydrate(artifacts: Artifact[]): void {
    this.artifacts = [...artifacts];
    this.readReceipts.clear();
    for (const a of artifacts) {
      this.readReceipts.set(a.id, new Set(a.consumedBy));
    }
  }
}

// ─── Why this matters ──────────────────────────────────────────────────────
//
// In a typical "naïve" multi-agent setup, the billing agent receives the
// full conversation. It then has to reason: "OK, what was actually decided?
// What findings are real? What was just a question?"
//
// With this bus, the billing agent receives exactly two artifact types:
//   - validated_finding (what we actually established)
//   - decision (what was actually ordered/done)
//
// Less context, more relevant context, and the model can't hallucinate
// findings from the transcript because the transcript isn't there.
//
// And critically — the KV cache. Each agent has a STABLE, FILTERED view of
// the encounter. Repeated calls within the same step (retries, supervisor
// review) hit the same content, so KV caching actually helps.

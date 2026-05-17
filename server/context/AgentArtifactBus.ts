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
 * `failed_attempt` artifacts gets nothing back. A differential agent that
 * tries to PRODUCE a `decision` artifact gets rejected.
 *
 * File: server/context/AgentArtifactBus.ts
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
    produces: ["decision"],
    consumes: ["validated_finding", "decision"],
  },
  supervisor: {
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
  private artifacts:    Artifact[] = [];
  private readReceipts: Map<string, Set<AgentRole>> = new Map();

  /**
   * Publish an artifact produced by an agent.
   * Throws ContractViolation if the agent isn't authorized to produce this type.
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
    if (this.artifacts.some(a => a.id === artifact.id)) return;
    this.artifacts.push(artifact);
  }

  /**
   * Read all artifacts available to a given consumer.
   * Filters to only the types the consumer is contracted to consume.
   */
  readFor(consumer: AgentRole): Artifact[] {
    const contract = CONTRACTS[consumer];
    const visible = this.artifacts.filter(a => contract.consumes.includes(a.type));
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

  /** Inspect an agent's contract (useful for debugging "why didn't billing see X?"). */
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

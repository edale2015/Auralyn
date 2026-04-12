/**
 * Agent Conversation Loop (AutoGen equivalent)
 *
 * Article — AutoGen:
 *   "AutoGen lets multiple AI agents converse and solve problems together.
 *   In AutoGen, you define agents with roles, and they talk to each other.
 *   The conversation continues until the problem is solved or a max round limit
 *   is hit. One agent can initiate, another can evaluate, another can critique."
 *
 * What's already present:
 *   - debateEngine.ts — parallel one-round vote: all specialists vote simultaneously,
 *     winner is picked by confidence sum. No back-and-forth. No iteration.
 *
 * What's missing:
 *   The AutoGen pattern is fundamentally different: it's a CONVERSATION.
 *   Agent A proposes → Agent B challenges → Agent A refines → Agent C validates.
 *   The loop continues across multiple rounds until:
 *     (a) two consecutive agents agree (convergence), or
 *     (b) max rounds are exhausted (human handoff required)
 *
 * Clinical example:
 *   Round 1: DiagnosticAgent → "This is likely GERD — low-risk"
 *   Round 1: SkepticAgent   → "HEART score is 4 — troponin not yet returned"
 *   Round 2: DiagnosticAgent → "Agreed — keep in observation pending troponin"
 *   Round 2: SkepticAgent   → "Agree — observation appropriate"
 *   → Convergence achieved. Consensus: OBSERVATION pending troponin.
 *
 *   Without convergence:
 *   → Escalation flag set. Attending physician required.
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentRole =
  | "proposer"     // initiates the conversation with a hypothesis
  | "skeptic"      // challenges the hypothesis
  | "validator"    // confirms or rejects the refined position
  | "mediator"     // breaks deadlocks between proposer and skeptic
  | "summarizer";  // produces final output

export interface ConversationAgent {
  id:    string;
  name:  string;
  role:  AgentRole;
  /**
   * Given the conversation history and context, return a response.
   * The agent may AGREE, CHALLENGE, or ABSTAIN.
   */
  respond: (
    history:  ConversationTurn[],
    context:  Record<string, unknown>
  ) => Promise<AgentResponse>;
}

export interface AgentResponse {
  agentId:   string;
  agentName: string;
  role:      AgentRole;
  position:  string;      // the agent's stated position
  stance:    "agree" | "challenge" | "abstain" | "escalate";
  confidence:number;      // 0–1
  reasoning: string;      // why this stance
  revision?: string;      // if stance is "agree" on a previous challenge: new refined position
}

export interface ConversationTurn {
  round:    number;
  agentId:  string;
  response: AgentResponse;
}

export type ConversationOutcome =
  | "converged"   // agents reached agreement
  | "max_rounds"  // limit hit without consensus
  | "escalated";  // an agent signaled human escalation required

export interface ConversationResult {
  conversationId: string;
  outcome:        ConversationOutcome;
  rounds:         number;
  turns:          ConversationTurn[];
  consensus:      string | null;   // final agreed position (null if not converged)
  consensusAgent: string | null;
  confidence:     number;
  dissent:        Array<{ agentName: string; lastPosition: string }>;
  escalationReason?:string;
  durationMs:     number;
  summary:        string;
}

// ── Convergence detector ──────────────────────────────────────────────────────

function detectConvergence(
  turns:     ConversationTurn[],
  minAgents: number
): { converged: boolean; position?: string; confidence?: number; agentName?: string } {
  // Check last N turns (one per agent) for agreement
  const lastRound = Math.max(...turns.map((t) => t.round));
  const lastTurns = turns.filter((t) => t.round === lastRound);

  const agreements = lastTurns.filter((t) => t.response.stance === "agree");
  if (agreements.length >= minAgents) {
    const position   = agreements[0].response.revision ?? agreements[0].response.position;
    const confidence = agreements.reduce((s, t) => s + t.response.confidence, 0) / agreements.length;
    return { converged: true, position, confidence, agentName: agreements[0].response.agentName };
  }

  // Also check if all non-mediator agents agreed in previous round
  const prevRound = lastRound - 1;
  if (prevRound > 0) {
    const prevTurns = turns.filter((t) => t.round === prevRound && t.response.role !== "mediator");
    if (prevTurns.length >= 2 && prevTurns.every((t) => t.response.stance === "agree")) {
      const position   = prevTurns[0].response.revision ?? prevTurns[0].response.position;
      const confidence = prevTurns.reduce((s, t) => s + t.response.confidence, 0) / prevTurns.length;
      return { converged: true, position, confidence, agentName: prevTurns[0].response.agentName };
    }
  }

  return { converged: false };
}

// ── Core conversation loop ────────────────────────────────────────────────────

/**
 * Run a multi-agent conversation until convergence or max rounds.
 * The AutoGen equivalent: agents talk back-and-forth across rounds,
 * each seeing the full conversation history before responding.
 */
export async function runAgentConversation(params: {
  agents:      ConversationAgent[];
  context:     Record<string, unknown>;
  maxRounds?:  number;
  minAgreeFor?: number;   // how many agents must agree to converge (default: 2)
}): Promise<ConversationResult> {
  const { agents, context, maxRounds = 5, minAgreeFor = 2 } = params;
  const conversationId = `conv-${randomUUID().slice(0, 8)}`;
  const tStart         = Date.now();
  const turns:          ConversationTurn[] = [];
  let round            = 1;
  let outcome:          ConversationOutcome = "max_rounds";
  let consensus:        string | null = null;
  let consensusAgent:   string | null = null;
  let consensusConf     = 0;
  let escalationReason: string | undefined;

  while (round <= maxRounds) {
    let escalated = false;

    for (const agent of agents) {
      const response = await agent.respond(turns, context);

      const turn: ConversationTurn = { round, agentId: agent.id, response };
      turns.push(turn);

      if (response.stance === "escalate") {
        escalated        = true;
        outcome          = "escalated";
        escalationReason = response.reasoning;
        break;
      }
    }

    if (escalated) break;

    // Check for convergence after every round
    const conv = detectConvergence(turns, minAgreeFor);
    if (conv.converged) {
      outcome        = "converged";
      consensus      = conv.position ?? null;
      consensusAgent = conv.agentName ?? null;
      consensusConf  = conv.confidence ?? 0;
      break;
    }

    round++;
  }

  // Build dissent list (agents who never agreed)
  const agentLastStance = new Map<string, ConversationTurn>();
  for (const turn of turns) {
    agentLastStance.set(turn.agentId, turn);
  }
  const dissent = [...agentLastStance.values()]
    .filter((t) => t.response.stance !== "agree")
    .map((t) => ({
      agentName:    t.response.agentName,
      lastPosition: t.response.position,
    }));

  const durationMs = Date.now() - tStart;

  const summary = outcome === "converged"
    ? `Converged in ${round} round(s). Consensus: "${consensus?.slice(0, 80)}..." (${(consensusConf * 100).toFixed(0)}% confidence)`
    : outcome === "escalated"
    ? `Escalated at round ${round}: ${escalationReason?.slice(0, 80)}`
    : `No consensus after ${maxRounds} rounds — human review required`;

  return {
    conversationId,
    outcome,
    rounds:   Math.min(round, maxRounds),
    turns,
    consensus,
    consensusAgent,
    confidence: consensusConf,
    dissent,
    escalationReason,
    durationMs,
    summary,
  };
}

// ── Built-in clinical agent factories ────────────────────────────────────────

/**
 * Create a rule-based Proposer agent for clinical scenarios.
 * In production: wrap an LLM call. Here: deterministic for testing.
 */
export function makeClinicalProposer(params: {
  agentId?:   string;
  name:       string;
  hypotheses: Array<{ condition: string; hypothesis: string; confidence: number }>;
}): ConversationAgent {
  return {
    id:   params.agentId ?? `proposer-${randomUUID().slice(0, 6)}`,
    name: params.name,
    role: "proposer",
    async respond(history, context): Promise<AgentResponse> {
      const hasChallenge = history.some(
        (t) => t.response.role === "skeptic" && t.response.stance === "challenge"
      );

      // On challenge, revise to a more cautious position
      if (hasChallenge) {
        const lastChallenge = [...history]
          .reverse()
          .find((t) => t.response.stance === "challenge");
        const revision = `Revised given challenge: ${lastChallenge?.response.reasoning?.slice(0, 60)} — recommend observation and further workup`;
        return {
          agentId:   params.agentId ?? "proposer",
          agentName: params.name,
          role:      "proposer",
          position:  revision,
          stance:    "agree",
          confidence:0.75,
          reasoning: "Accepting skeptic's concern and revising to more conservative disposition",
          revision,
        };
      }

      // First round: propose based on context
      const complaint = String(context.chiefComplaint ?? "").toLowerCase();
      const match = params.hypotheses.find((h) => complaint.includes(h.condition));
      const hyp   = match ?? params.hypotheses[0] ?? { hypothesis: "Undifferentiated — further workup required", confidence: 0.5, condition: "" };

      return {
        agentId:   params.agentId ?? "proposer",
        agentName: params.name,
        role:      "proposer",
        position:  hyp.hypothesis,
        stance:    "agree",
        confidence:hyp.confidence,
        reasoning: `Based on chief complaint "${context.chiefComplaint}" — pattern matched to ${hyp.condition || "general protocol"}`,
      };
    },
  };
}

/**
 * Create a rule-based Skeptic agent for clinical scenarios.
 */
export function makeClinicalSkeptic(params: {
  agentId?:string;
  name:    string;
  flags:   Array<{ field: string; operator: "gt" | "lt" | "missing" | "present"; threshold?: number; concern: string }>;
}): ConversationAgent {
  return {
    id:   params.agentId ?? `skeptic-${randomUUID().slice(0, 6)}`,
    name: params.name,
    role: "skeptic",
    async respond(history, context): Promise<AgentResponse> {
      // Check if skeptic already challenged and proposer agreed
      const proposerAgreed = history.some(
        (t) => t.response.role === "proposer" && t.response.stance === "agree" && history.some((h) => h.response.role === "skeptic" && h.response.stance === "challenge")
      );

      if (proposerAgreed) {
        return {
          agentId:   params.agentId ?? "skeptic",
          agentName: params.name,
          role:      "skeptic",
          position:  "Proposer has acknowledged concerns and revised appropriately",
          stance:    "agree",
          confidence:0.85,
          reasoning: "Revision addresses primary concerns",
        };
      }

      // Find any unresolved concerns
      const concerns: string[] = [];
      for (const flag of params.flags) {
        const val = context[flag.field];
        if (flag.operator === "missing" && (val === undefined || val === null || val === "")) {
          concerns.push(flag.concern);
        } else if (flag.operator === "present" && val !== undefined && val !== null) {
          concerns.push(flag.concern);
        } else if (flag.operator === "gt" && Number(val) > (flag.threshold ?? 0)) {
          concerns.push(flag.concern);
        } else if (flag.operator === "lt" && Number(val) < (flag.threshold ?? 0)) {
          concerns.push(flag.concern);
        }
      }

      if (concerns.length === 0) {
        return {
          agentId:   params.agentId ?? "skeptic",
          agentName: params.name,
          role:      "skeptic",
          position:  "No critical concerns identified",
          stance:    "agree",
          confidence:0.9,
          reasoning: "All safety checks passed",
        };
      }

      // Escalate if multiple critical concerns
      if (concerns.length >= 3) {
        return {
          agentId:   params.agentId ?? "skeptic",
          agentName: params.name,
          role:      "skeptic",
          position:  `${concerns.length} critical concerns — cannot reach safe consensus`,
          stance:    "escalate",
          confidence:1.0,
          reasoning: concerns.join("; "),
        };
      }

      return {
        agentId:   params.agentId ?? "skeptic",
        agentName: params.name,
        role:      "skeptic",
        position:  `Challenge: ${concerns.join("; ")}`,
        stance:    "challenge",
        confidence:0.8,
        reasoning: concerns.join("; "),
      };
    },
  };
}

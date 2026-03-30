/**
 * ============================================================
 * DOMAIN 4: ARCHITECTURE & SCALABILITY — Interface Contracts
 * Auralyn / ENT Flu Slice — HIPAA/FDA Medical Triage Platform
 * ============================================================
 *
 * What is here: TypeScript interfaces, enums, constants, and
 * function signatures only. No implementation bodies.
 *
 * Files this represents:
 *   server/engines/versionedEngine.ts
 *   server/agents/agentConfig.ts       (existing — shown for context)
 *   server/queue/redis.ts              (existing — shown for context)
 *
 * REVIEW QUESTIONS FOR CLAUDE:
 *   1. Is 10% shadow traffic the right default for the
 *      FeatureFlaggedEngine? What does Epic use for staged rollouts?
 *   2. Is auto-disabling the candidate at >5% error rate delta
 *      the right threshold, or should this require human approval?
 *   3. The agent config is currently in-memory with Redis write-through.
 *      What's the right TTL? 24h? Should it be longer for weights
 *      that update slowly?
 *   4. Rec 4.3 (Google Sheets → PostgreSQL clinical rule store) is
 *      marked PLANNED in the breach register. What's the minimum
 *      viable implementation that satisfies the HIPAA BAA gap?
 *   5. With 70 engine files, how should we handle breaking changes
 *      to the VersionedClinicalEngine interface? Deprecation window?
 * ============================================================
 */


// ─── 4.1 · Versioned Clinical Engine Interface ───────────────────────────────

/**
 * Rec 4.2 — Contract-first versioning prevents downstream breakage
 * when engines are modified. Every engine declares its version, backward
 * compatibility range, and exposes a health check.
 */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface EngineHealthSnapshot {
  engineId:          string;
  version:           string;       // "major.minor.patch"
  lastInvocationAt?: string;
  invocationCount:   number;
  errorCount:        number;
  errorRate:         number;       // 0–1
  avgLatencyMs:      number;
}

export interface VersionedClinicalEngine<TInput = unknown, TOutput = unknown> {
  engineId:       string;
  version:        SemanticVersion;
  compatibleWith: SemanticVersion[];    // backward compatibility declaration

  invoke(input: TInput): Promise<TOutput>;
  healthCheck(): EngineHealthSnapshot;
}


// ─── 4.2 · Feature-Flagged Shadow Mode Engine ────────────────────────────────

/**
 * Wraps stable + candidate engines in shadow mode.
 *
 * Behavior:
 *   - Stable result always returned to patient
 *   - Candidate runs on `shadowPct` fraction of traffic (default 10%)
 *   - Divergences are logged for analysis (capped at 100 entries)
 *   - Agent addition: if candidate error rate exceeds stable by >5%,
 *     shadow mode is automatically disabled (no human needed to catch it)
 *
 * This enables safe engine rollouts without patient risk.
 * Mirrors the pattern Epic uses for CDSS model A/B testing.
 */
export declare class FeatureFlaggedEngine<TInput, TOutput>
  implements VersionedClinicalEngine<TInput, TOutput> {

  engineId:       string;
  version:        SemanticVersion;
  compatibleWith: SemanticVersion[];

  constructor(
    stable:     VersionedClinicalEngine<TInput, TOutput>,
    candidate:  VersionedClinicalEngine<TInput, TOutput>,
    shadowPct?: number    // default: 0.10 (10% of traffic)
  );

  /** Always returns the stable result. Candidate runs as side-effect. */
  invoke(input: TInput): Promise<TOutput>;

  /** Returns all logged divergences between stable and candidate outputs. */
  getDivergenceLog(): Array<{
    at:              string;
    input:           unknown;
    stableOutput:    unknown;
    candidateOutput: unknown;
  }>;

  isShadowEnabled(): boolean;
  enableShadow():    void;
  disableShadow():   void;

  healthCheck(): EngineHealthSnapshot;
}


// ─── 4.3 · Redis Persistence for Agent Config ────────────────────────────────

/**
 * Rec 4.1 — Agent config (weights, policy mode, drift state) is currently
 * in-memory with Redis write-through on update. This means:
 *   - On restart: weights load from Redis (or defaults if Redis miss)
 *   - On Redis failure: in-memory fallback is used, incident is logged
 *   - TTL: 24 hours (weights refresh from PostgreSQL if stale)
 *
 * Redis key pattern: "phase9:agent_accuracy" (hash: agentId → accuracy)
 * Redis key pattern: "phase9:policy_weights" (JSON: PolicyWeights object)
 */
export interface AgentConfigPersistenceLayer {
  /** Load agent accuracy from Redis. Returns 0.75 (default) on miss. */
  getAgentAccuracy(agentId: string): Promise<number>;

  /** Update agent accuracy in Redis using adaptive EMA. */
  updateAgentAccuracy(agentId: string, correct: boolean): Promise<void>;

  /** Load policy weights from Redis. Returns defaults on miss. */
  getPolicyWeights(): Promise<PolicyWeights>;

  /** Write policy weights to Redis with 24h TTL. */
  setPolicyWeights(weights: PolicyWeights): Promise<void>;
}

export interface PolicyWeights {
  conservative:  number;   // bias toward ER escalation
  balanced:      number;   // standard hybrid weighting
  probabilistic: number;   // lean on Bayesian engine
  updatedAt:     string;
  version:       number;
}

/** Upstash Redis client (REST-based, not TCP — compatible with Replit environment). */
export declare function getRedisAsync(): Promise<RedisClient | null>;
// Note: BullMQ is NOT usable in this environment — TCP-only, blocked by Upstash REST.

// Placeholder type for the Upstash Redis client
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, fields: Record<string, string>): Promise<void>;
}


// ─── 4.4 · Google Sheets Risk (Rec 4.3) — Proposed Architecture ─────────────

/**
 * CURRENT STATE: Google Sheets is used as a clinical rule store.
 * RISK: No HIPAA BAA, no SLA, no transactional consistency.
 * STATUS: BR-006 in breach register — marked PLANNED.
 *
 * PROPOSED INTERFACE (not yet implemented):
 * Rules live in PostgreSQL. Sheets is editor UI only.
 * Promotion requires physician approval (never direct-to-production).
 */
export interface ClinicalRuleStore {
  /** Fetch rules from PostgreSQL (not Sheets). */
  getRules(packId: string, version?: string): Promise<ClinicalRule[]>;

  /** Publish a new version — requires approvingPhysicianId. */
  publishRules(rules: ClinicalRule[], publishedBy: string): Promise<RuleVersion>;

  /** Roll back to a prior published version. */
  rollbackRules(packId: string, targetVersion: string): Promise<void>;

  /** One-way sync: Sheets → staging only, never directly to production. */
  syncFromSheets(sheetsId: string): Promise<StagingRuleSet>;

  /** Validate staged rules before promotion. */
  validateStagingRules(stagingId: string): Promise<ValidationResult>;

  /** Promote staging to production — requires physician sign-off. */
  promoteToProduction(stagingId: string, approvedBy: string): Promise<void>;
}

// Placeholder types for the proposed rule store
interface ClinicalRule { ruleId: string; content: unknown; }
interface RuleVersion   { versionId: string; publishedAt: string; }
interface StagingRuleSet { stagingId: string; ruleCount: number; }
interface ValidationResult { valid: boolean; errors: string[]; warnings: string[]; }

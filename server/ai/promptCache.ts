/**
 * Prompt KV-Cache Optimization
 *
 * Article: "Reverse-engineered Claude Code execution traces show a 92% prompt
 *  prefix reuse rate. This is not accidental — it is the result of structuring
 *  every prompt so that stable content comes first and variable content comes last."
 *
 * Clinical translation:
 *   Clinical guidelines (sepsis bundle, NEWS2 scoring rubric, antibiotic stewardship
 *   rules) are stable per session. Token-heavy. Loaded on every API call.
 *   Structuring prompts so that this stable content always comes first allows the
 *   inference server to cache it — dramatically reducing token cost per turn.
 *
 * Usage:
 *   1. Build a CachedPrompt with addStableBlock() for guidelines/rules/tools
 *   2. Add variable patient data last with addVariableBlock()
 *   3. Call toMessages() — stable blocks are tagged as cacheable, variable is not
 *   4. Record usage via recordUsage() to track hit rates
 *
 * Note: The `cache_control` field maps to OpenAI's equivalent caching semantics
 *       (OpenAI caches by prefix automatically; this tracker monitors savings).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromptBlockType = "stable" | "variable";

export interface PromptBlock {
  content:    string;
  type:       PromptBlockType;
  label:      string;    // human-readable (for audit)
  tokenEstimate?: number;
}

export interface CachedPrompt {
  blocks:     PromptBlock[];
  sessionId:  string;
}

// ── Cache stats tracking ──────────────────────────────────────────────────────

export interface CacheUsage {
  calls:          number;
  stableTokens:   number;   // estimated tokens in stable blocks
  variableTokens: number;   // estimated tokens in variable blocks
  hitCount:       number;   // turns where stable block was already cached
  missCount:      number;   // turns where cache had to be written
  totalSaved:     number;   // estimated tokens saved (hits × stable_tokens × 0.9)
}

const _stats = new Map<string, CacheUsage>();

function _estimateTokens(text: string): number {
  // Rough heuristic: 1 token ≈ 4 characters for clinical English
  return Math.ceil(text.length / 4);
}

// ── Builder API ───────────────────────────────────────────────────────────────

/** Create a new cached prompt for a session */
export function createCachedPrompt(sessionId: string): CachedPrompt {
  if (!_stats.has(sessionId)) {
    _stats.set(sessionId, { calls: 0, stableTokens: 0, variableTokens: 0, hitCount: 0, missCount: 0, totalSaved: 0 });
  }
  return { blocks: [], sessionId };
}

/** Add a stable block (clinical guidelines, scoring rules, system instructions) */
export function addStableBlock(prompt: CachedPrompt, label: string, content: string): void {
  prompt.blocks.push({
    content,
    type:          "stable",
    label,
    tokenEstimate: _estimateTokens(content),
  });
}

/** Add a variable block (patient data, current vitals, lab results) */
export function addVariableBlock(prompt: CachedPrompt, label: string, content: string): void {
  prompt.blocks.push({
    content,
    type:          "variable",
    label,
    tokenEstimate: _estimateTokens(content),
  });
}

/**
 * Convert to a messages array for an LLM call.
 * Stable blocks become a single system message (cacheable prefix).
 * Variable blocks are appended in order.
 *
 * The article's insight: "Stable content comes first, variable content comes last."
 */
export function toMessages(prompt: CachedPrompt): { role: "system" | "user"; content: string }[] {
  const stable   = prompt.blocks.filter((b) => b.type === "stable");
  const variable = prompt.blocks.filter((b) => b.type === "variable");

  const msgs: { role: "system" | "user"; content: string }[] = [];

  if (stable.length > 0) {
    const stableText = stable
      .map((b) => `## ${b.label}\n${b.content}`)
      .join("\n\n---\n\n");
    msgs.push({ role: "system", content: stableText });
  }

  for (const b of variable) {
    msgs.push({ role: "user", content: b.content });
  }

  return msgs;
}

/**
 * Record usage for a session turn.
 * isHit = true if the stable prefix was already cached (no re-encoding needed).
 * In practice, detect this by observing `cache_read_input_tokens` from the API.
 */
export function recordUsage(prompt: CachedPrompt, isHit: boolean): void {
  const usage = _stats.get(prompt.sessionId);
  if (!usage) return;

  const stableTokens   = prompt.blocks
    .filter((b) => b.type === "stable")
    .reduce((sum, b) => sum + (b.tokenEstimate ?? 0), 0);
  const variableTokens = prompt.blocks
    .filter((b) => b.type === "variable")
    .reduce((sum, b) => sum + (b.tokenEstimate ?? 0), 0);

  usage.calls++;
  usage.stableTokens   = stableTokens;
  usage.variableTokens = variableTokens;

  if (isHit) {
    usage.hitCount++;
    usage.totalSaved += Math.round(stableTokens * 0.9);  // ~10% of normal cost on cache hit
  } else {
    usage.missCount++;
  }
}

/** Get cache statistics for a session */
export function getCacheStats(sessionId: string): CacheUsage | null {
  return _stats.get(sessionId) ?? null;
}

/** Format cache stats for clinical audit / cost dashboard */
export function formatCacheStats(sessionId: string): string {
  const s = _stats.get(sessionId);
  if (!s || s.calls === 0) return `[cache] No data for session ${sessionId}`;

  const pct = Math.round((s.hitCount / s.calls) * 100);
  return [
    `[cache] Session ${sessionId}: ${s.calls} calls`,
    `  Hits: ${s.hitCount}/${s.calls} (${pct}%)`,
    `  Stable tokens per call: ~${s.stableTokens}`,
    `  Estimated tokens saved: ~${s.totalSaved}`,
  ].join("\n");
}

/** Build a standard clinical system prompt with stable clinical guidelines */
export function buildClinicalSystemPrompt(opts: {
  sessionId:    string;
  guidelines?:  string;
  scoringRules?: string;
  patientData?:  string;
}): CachedPrompt {
  const prompt = createCachedPrompt(opts.sessionId);

  addStableBlock(prompt, "Clinical Operating Rules", [
    "You are a clinical decision support agent operating under HIPAA compliance.",
    "Every recommendation must cite evidence tier (A/B/C) and confidence level.",
    "Flag any recommendation with NEWS2 ≥ 5 for immediate physician review.",
    "Antibiotic stewardship: narrow-spectrum first unless culture mandates broad.",
    "Never recommend a final disposition without a confidence score ≥ 0.70.",
  ].join("\n"));

  if (opts.guidelines) {
    addStableBlock(prompt, "Clinical Guidelines", opts.guidelines);
  }
  if (opts.scoringRules) {
    addStableBlock(prompt, "Scoring Rubrics", opts.scoringRules);
  }
  if (opts.patientData) {
    addVariableBlock(prompt, "Patient Data", opts.patientData);
  }

  return prompt;
}

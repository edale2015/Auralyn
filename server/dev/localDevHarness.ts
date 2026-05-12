/**
 * localDevHarness.ts
 * Drop into: server/dev/localDevHarness.ts
 *
 * LOCAL LLM DEVELOPMENT HARNESS
 *
 * PURPOSE:
 * Allows Auralyn developers to test non-clinical code paths
 * using a local Ollama instance instead of the Anthropic API.
 *
 * WHAT THIS IS FOR:
 *   ✅ Testing intent_parser logic with new ⌘K commands
 *   ✅ Testing discharge instruction template rendering
 *   ✅ Testing KB retrieval formatting and prompt block structure
 *   ✅ Testing new pipeline steps without API cost
 *   ✅ Offline development when internet is unavailable
 *   ✅ CI/CD pipeline smoke tests (no API key required)
 *
 * WHAT THIS IS NOT FOR:
 *   ❌ clinical_brain — never replaced with local model
 *   ❌ Production use of any kind
 *   ❌ Testing with real patient data
 *   ❌ Validating clinical reasoning quality
 *   ❌ Any pathway that touches a physician's clinical decision
 *
 * WHY LOCAL MODELS ARE INSUFFICIENT FOR CLINICAL BRAIN:
 *   Llama 3.2 70B is a capable general model. It is not sufficient for:
 *   - Must-not-miss diagnosis reasoning (NSTEMI, PE, aortic dissection)
 *   - Drug interaction detection across complex medication lists
 *   - Nuanced disposition decisions in ambiguous presentations
 *   - Clinical pearl injection from specialist knowledge
 *   These require Opus-class reasoning. Patient safety is not a cost
 *   optimization target.
 *
 * SETUP (developer machine only):
 *   1. Install Ollama: curl -fsSL https://ollama.com/install.sh | sh
 *   2. Pull a model: ollama pull llama3.2
 *   3. Set env: LOCAL_DEV_LLM=1 in .env.local (never in .env)
 *   4. Run Auralyn: the harness intercepts non-clinical LLM calls
 *
 * OLLAMA MODELS BY USE CASE:
 *   intent_parser tests:    ollama pull llama3.2        (fast, cheap)
 *   discharge tests:        ollama pull llama3.2        (readable output)
 *   retrieval_pruner tests: ollama pull gemma3:1b       (smallest, fastest)
 *   KB format tests:        ollama pull mistral         (good instruction following)
 *
 * COST IMPACT:
 *   A developer running 100 test calls/day against Anthropic API:
 *     Sonnet: 100 × ~$0.002 = $0.20/day
 *     Opus:   100 × ~$0.08  = $8.00/day  (if accidentally hitting clinical)
 *   With local harness:
 *     All non-clinical: $0.00/day
 *     clinical_brain stays on API (protected)
 *   Monthly dev cost reduction per developer: ~$6-240/month
 */

import { fileURLToPath } from "url";
import type { ModelPurpose } from "../gateway/llmGateway";

// ─── Guard: only active in development with explicit opt-in ───────────────────

const LOCAL_DEV_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.LOCAL_DEV_LLM === "1";

// Purposes that may NEVER be routed to local models
const CLINICAL_ONLY: Set<ModelPurpose> = new Set([
  "clinical_brain",
  "kb_validator",
  "skill_generator",
]);

// ─── Ollama client ────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL ?? "llama3.2";

async function ollamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ollamaComplete(
  messages: Array<{ role: string; content: string }>,
  system?:  string,
  maxTokens = 1000
): Promise<string> {

  const allMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  const response = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      model:       OLLAMA_MODEL,
      messages:    allMessages,
      max_tokens:  maxTokens,
      temperature: 0.1,
      stream:      false,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── Main harness function ────────────────────────────────────────────────────

export interface LocalHarnessResult {
  content:      string;
  model:        string;
  provider:     "ollama_local";
  isLocal:      true;
  costUsd:      0;
  warningFlags: string[];
}

export async function localDevComplete(params: {
  purpose:    ModelPurpose;
  messages:   Array<{ role: "user" | "assistant"; content: string }>;
  system?:    string;
  maxTokens?: number;
}): Promise<LocalHarnessResult | null> {

  // Only active when explicitly enabled
  if (!LOCAL_DEV_ENABLED) return null;

  // Hard block on clinical purposes — never intercept these
  if (CLINICAL_ONLY.has(params.purpose)) {
    console.log(`[LocalDev] ${params.purpose} → Anthropic (clinical — never local)`);
    return null;
  }

  // Check Ollama is running
  if (!(await ollamaAvailable())) {
    console.warn("[LocalDev] Ollama not available — falling back to Anthropic API");
    console.warn("[LocalDev] Start Ollama: ollama serve");
    return null;
  }

  console.log(`[LocalDev] ${params.purpose} → Ollama (${OLLAMA_MODEL}) — $0.00`);

  const content = await ollamaComplete(
    params.messages,
    params.system,
    params.maxTokens
  );

  return {
    content,
    model:        OLLAMA_MODEL,
    provider:     "ollama_local",
    isLocal:      true,
    costUsd:      0,
    warningFlags: [
      "LOCAL_MODEL_OUTPUT — do not use for clinical validation",
      `Model: ${OLLAMA_MODEL} (not Opus — reasoning quality is lower)`,
    ],
  };
}

// ─── CI/CD smoke test runner ──────────────────────────────────────────────────
// Run: npx tsx server/dev/localDevHarness.ts --smoke-test

export async function runSmokeTests(): Promise<void> {
  console.log("\n[LocalDev] Running non-clinical smoke tests against Ollama...\n");

  const tests = [
    {
      name:    "intent_parser — ⌘K command parsing",
      purpose: "intent_parser" as ModelPurpose,
      messages: [{ role: "user" as const, content: "how much are we spending on AI today" }],
      system:  "Parse this as a clinical intent. Return JSON: { intent: string, category: string }",
    },
    {
      name:    "retrieval_pruner — KB context pruning",
      purpose: "retrieval_pruner" as ModelPurpose,
      messages: [{ role: "user" as const, content: "Given 50 diagnosis rules for chest pain, return the 10 most relevant for a 65yo male with exertional pressure and radiation to left arm." }],
    },
    {
      name:    "discharge_generator — instruction template",
      purpose: "discharge_generator" as ModelPurpose,
      messages: [{ role: "user" as const, content: "Generate discharge instructions for a patient with uncomplicated UTI prescribed nitrofurantoin for 5 days." }],
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`  ${test.name}... `);
    try {
      const result = await localDevComplete(test);
      if (result?.content && result.content.length > 10) {
        console.log(`✅ (${result.content.length} chars)`);
        passed++;
      } else {
        console.log("❌ (empty response)");
        failed++;
      }
    } catch (err: any) {
      console.log(`❌ (${err.message})`);
      failed++;
    }
  }

  console.log(`\n[LocalDev] Smoke tests: ${passed} passed, ${failed} failed`);
  console.log("[LocalDev] clinical_brain was NOT tested — Anthropic API required for clinical validation\n");
}

// ─── Developer setup guide ────────────────────────────────────────────────────

export const SETUP_GUIDE = `
LOCAL LLM DEVELOPMENT SETUP
════════════════════════════

1. Install Ollama (one time):
   macOS/Linux: curl -fsSL https://ollama.com/install.sh | sh
   Windows:     https://ollama.com/download

2. Pull a model (one time per model):
   ollama pull llama3.2          # General use — 2GB
   ollama pull gemma3:1b         # Fastest/smallest — 800MB

3. Configure .env.local (never .env):
   LOCAL_DEV_LLM=1
   OLLAMA_MODEL=llama3.2
   OLLAMA_URL=http://localhost:11434

4. Verify Ollama is running:
   ollama serve                  # if not already running as service

5. Run smoke tests:
   npx tsx server/dev/localDevHarness.ts --smoke-test

6. Start Auralyn:
   Non-clinical LLM calls → Ollama ($0.00)
   clinical_brain calls   → Anthropic API (unchanged)

WHAT CHANGES IN DEVELOPMENT:
  Before: Every test call costs ~$0.002-0.08
  After:  intent_parser, retrieval_pruner, discharge_generator = $0.00
  Unchanged: clinical_brain, kb_validator, skill_generator → Anthropic

WHAT NEVER CHANGES:
  clinical_brain is ALWAYS Anthropic Opus.
  No local model, ever, for clinical reasoning.
  This is enforced structurally in localDevComplete().
`;

// CLI runner — ESM-safe entry guard
const _isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (_isMain) {
  if (process.argv.includes("--smoke-test")) {
    runSmokeTests().catch(console.error);
  } else if (process.argv.includes("--setup")) {
    console.log(SETUP_GUIDE);
  } else {
    console.log("Usage: npx tsx server/dev/localDevHarness.ts --smoke-test | --setup");
  }
}

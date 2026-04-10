/**
 * LLM Template Generator — Packet 20 "Generate" feature
 *
 * Converts a plain-English prompt ("log into portal, fill patient form, submit")
 * into a valid AutomationTemplate JSON using GPT-4o-mini.
 *
 * Design rules:
 *   1. Lazy OpenAI init (never instantiated at module top-level)
 *   2. System prompt enforces strict JSON schema matching AutomationTemplate
 *   3. JSON parse is validated; invalid output throws a structured error
 *   4. No silent fallbacks — caller gets a real error to surface in the UI
 *
 * Different from aiSelectorGenerator.ts which generates CSS selectors from a
 * live Playwright page context. This generates entire template structures from
 * a user's text description, without a browser session.
 */

import type { AutomationTemplate, AutomationAction, AutomationActionType } from "./types";

// ── Lazy OpenAI ───────────────────────────────────────────────────────────────

let _openai: any = null;
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set — LLM template generation unavailable");
    }
    const { default: OpenAI } = require("openai");
    _openai = new OpenAI();
  }
  return _openai;
}

// ── Schema reference injected into the system prompt ──────────────────────────

const SCHEMA_REFERENCE = `
{
  "templateKey": "string (snake_case identifier)",
  "name": "string (human-readable)",
  "description": "string (optional)",
  "startUrl": "https://example.com",
  "actions": [
    {
      "type": "goto | fill | select | check | click | waitFor | screenshot | extractText | humanApproval | assertVisible",
      "name": "string (short description of this step)",
      "selector": "CSS selector string (required for fill/click/select/check/assertVisible/extractText)",
      "value": "string (required for fill/select/check; omit for click/goto)",
      "timeout": 5000,
      "mapping": "payload key that maps to this field (optional)",
      "fallbackSelectors": ["alternative CSS selectors (optional array)"]
    }
  ]
}
`.trim();

const SYSTEM_PROMPT = `You are an expert Playwright automation template generator for a HIPAA-compliant medical triage platform.

Your job: convert the user's plain-English description into a valid JSON AutomationTemplate.

Rules:
- Return ONLY valid JSON. No markdown code fences, no explanations, no extra text.
- Every action MUST have "type" and "name".
- "selector" is required for: fill, click, select, check, assertVisible, extractText.
- "value" is required for: fill, select. For check it should be "true" or "false".
- Use specific, stable CSS selectors (prefer id, name, aria-label, placeholder attributes).
- Keep selector strings safe — no unsanitised user input in attribute values.
- The startUrl should be a real-looking URL based on the portal described.
- Use snake_case for templateKey.
- Generate 3–12 actions appropriate for the described workflow.

Output schema:
${SCHEMA_REFERENCE}`;

// ── Valid action types (for client-side validation) ───────────────────────────

const VALID_TYPES: Set<AutomationActionType> = new Set([
  "goto", "fill", "select", "check", "click",
  "waitFor", "screenshot", "extractText", "humanApproval", "assertVisible",
]);

// ── Core generator ────────────────────────────────────────────────────────────

function validateAndCoerce(raw: unknown): AutomationTemplate {
  if (!raw || typeof raw !== "object") throw new Error("LLM returned non-object JSON");

  const obj = raw as Record<string, unknown>;
  if (typeof obj.templateKey !== "string" || !obj.templateKey) {
    throw new Error("Missing or invalid 'templateKey' in LLM output");
  }
  if (typeof obj.name !== "string" || !obj.name) {
    throw new Error("Missing or invalid 'name' in LLM output");
  }
  if (typeof obj.startUrl !== "string" || !obj.startUrl.startsWith("http")) {
    throw new Error("Missing or invalid 'startUrl' in LLM output");
  }
  if (!Array.isArray(obj.actions) || obj.actions.length === 0) {
    throw new Error("'actions' must be a non-empty array");
  }

  const actions: AutomationAction[] = obj.actions.map((a: any, i: number) => {
    if (!VALID_TYPES.has(a.type)) {
      throw new Error(`actions[${i}].type "${a.type}" is not a valid AutomationActionType`);
    }
    if (typeof a.name !== "string" || !a.name) {
      throw new Error(`actions[${i}].name is required`);
    }
    return {
      type:              a.type as AutomationActionType,
      name:              String(a.name),
      selector:          a.selector ? String(a.selector) : undefined,
      value:             a.value    ? String(a.value)    : undefined,
      timeout:           typeof a.timeout === "number" ? a.timeout : undefined,
      mapping:           a.mapping  ? String(a.mapping)  : undefined,
      fallbackSelectors: Array.isArray(a.fallbackSelectors)
        ? a.fallbackSelectors.map(String)
        : undefined,
    };
  });

  return {
    templateKey:  String(obj.templateKey),
    name:         String(obj.name),
    description:  obj.description ? String(obj.description) : undefined,
    startUrl:     String(obj.startUrl),
    actions,
  };
}

export interface GenerateResult {
  template:    AutomationTemplate;
  rawContent:  string;   // the raw LLM output (for debugging)
  tokensUsed?: number;
}

/**
 * Generate a full AutomationTemplate from a plain-English description.
 *
 * @param prompt  Natural language description ("Log into portal X, fill patient form, submit")
 * @returns       Validated AutomationTemplate + raw LLM content for debugging
 */
export async function generateTemplateFromPrompt(prompt: string): Promise<GenerateResult> {
  if (!prompt?.trim()) throw new Error("Prompt must not be empty");

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model:       "gpt-4o-mini",
    temperature: 0.3,    // low temperature for deterministic structured output
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: prompt.trim() },
    ],
  });

  const rawContent = response.choices[0]?.message?.content ?? "";
  if (!rawContent) throw new Error("LLM returned empty content");

  // Strip any accidental markdown fences
  const jsonStr = rawContent
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/,      "")
    .replace(/```\s*$/,      "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`LLM output is not valid JSON: ${jsonStr.slice(0, 200)}`);
  }

  const template = validateAndCoerce(parsed);

  return {
    template,
    rawContent,
    tokensUsed: response.usage?.total_tokens,
  };
}

/**
 * Repair a template step whose selector is drifting.
 * Used by the Auto-Repair Agent as a final fallback when
 * standard healing and AI selector generation both fail.
 */
export async function repairTemplateStep(
  templateKey: string,
  failedSelector: string
): Promise<string> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model:       "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are a Playwright selector repair expert. Given a CSS selector that is failing, " +
          "return ONLY a single alternative CSS selector string — no JSON, no explanation, no quotes, no fences.",
      },
      {
        role: "user",
        content:
          `Template: ${templateKey}\nFailing selector: ${failedSelector}\n` +
          `Suggest a more resilient CSS selector (prefer [aria-label], [placeholder], [name], #id attributes).`,
      },
    ],
  });
  const repaired = (response.choices[0]?.message?.content ?? "").trim();
  if (!repaired) throw new Error("LLM could not suggest a repaired selector");
  return repaired;
}

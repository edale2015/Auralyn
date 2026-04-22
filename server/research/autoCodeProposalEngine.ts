/**
 * server/research/autoCodeProposalEngine.ts
 * Step A: GPT-4o Code Architect Pass
 *
 * Given an article (title, excerpt, tags, summary) + the most relevant Auralyn
 * source files for that topic, GPT-4o produces concrete TypeScript implementation
 * proposals — NOT TODO stubs. Real file patches with full function bodies.
 *
 * SAFETY CONTRACT: output is a proposal only. Nothing touches the live codebase
 * until it passes the review chain + human approval + agent sign-off.
 */

import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";

export type CodeProposalFile = {
  path: string;
  content: string;
  explanation: string;
};

export type CodeProposal = {
  files: CodeProposalFile[];
  summary: string;
  concerns: string[];
};

// ── Topic → relevant Auralyn files mapping ────────────────────────────────

const TOPIC_FILE_MAP: Array<{ keywords: string[]; files: string[] }> = [
  {
    keywords: ["calibration", "brier", "reliability", "expected calibration", "overconfidence"],
    files: [
      "server/validation/calibrationMonitor.ts",
      "server/routes/validationRoutes.ts",
    ],
  },
  {
    keywords: ["sepsis", "early warning", "qsofa", "news2", "sirs", "deterioration", "shock"],
    files: [
      "server/prediction/deteriorationEngine.ts",
      "server/ai/bayesianNetwork.ts",
    ],
  },
  {
    keywords: ["bayesian", "posterior", "prior", "conditional probability", "inference", "cpt"],
    files: [
      "server/ai/bayesianNetwork.ts",
      "server/clinical/bayesianEngine.ts",
    ],
  },
  {
    keywords: ["fhir", "hl7", "smart on fhir", "epic", "athena", "ehr integration", "electronic health"],
    files: [
      "server/ehr/fhir/fhirClient.ts",
      "server/ehr/fhir/fhirAuth.ts",
    ],
  },
  {
    keywords: ["hallucination", "factual grounding", "safety guard", "output filter", "refusal", "rag"],
    files: [
      "server/clinical/hallucinationExtensions.ts",
      "server/clinical/safetyGate.ts",
    ],
  },
  {
    keywords: ["fda", "510k", "samd", "software as a medical device", "audit trail", "regulatory"],
    files: [
      "server/fda/fdaAuditChain.ts",
      "server/routes/fdaAuditRoutes.ts",
    ],
  },
  {
    keywords: ["triage", "disposition", "urgency", "chief complaint", "acuity"],
    files: [
      "server/clinical/clinicalDispositionEngine.ts",
      "server/ai/triageEngine.ts",
    ],
  },
  {
    keywords: ["rlhf", "reinforcement", "feedback", "reward model", "fine-tuning"],
    files: [
      "server/ai/rlhfEngine.ts",
      "server/learning/feedbackLoop.ts",
    ],
  },
];

function resolveRelevantFiles(text: string): Record<string, string> {
  const lower = text.toLowerCase();
  const result: Record<string, string> = {};

  for (const entry of TOPIC_FILE_MAP) {
    if (entry.keywords.some(k => lower.includes(k))) {
      for (const filePath of entry.files) {
        const abs = path.join(process.cwd(), filePath);
        if (fs.existsSync(abs)) {
          try {
            const content = fs.readFileSync(abs, "utf-8").slice(0, 2500);
            result[filePath] = content;
          } catch {
            result[filePath] = `// (could not read — file exists but unreadable)`;
          }
        } else {
          result[filePath] = `// (file not yet created — provide implementation skeleton)`;
        }
      }
    }
  }

  return result;
}

// ── GPT-4o Code Architect call ─────────────────────────────────────────────

const ARCHITECT_SYSTEM = `You are a senior TypeScript/Node.js engineer for Auralyn, a HIPAA-compliant, FDA-regulated medical triage system used in NYC urgent care.

Your job: given a research article and the relevant Auralyn source files, produce CONCRETE, PRODUCTION-READY TypeScript code patches — not TODO stubs, not pseudocode. Real, working function bodies.

Critical constraints:
- Never weaken hallucination safeguards or safety gates
- Never remove physician review gates
- Never allow AI output to directly set final clinical disposition
- All EHR writes must go through ehrWriter.ts with audit logging
- HIPAA: never log PHI; mask patient IDs in console output
- FDA SaMD: all algorithm changes must include validation annotations

Return strict JSON matching this schema:
{
  "files": [
    {
      "path": "server/path/to/file.ts",
      "content": "FULL file content with the change applied — not a diff, the complete file",
      "explanation": "What changed and why, in 2-3 sentences"
    }
  ],
  "summary": "2-paragraph summary of what this implementation does and why it is clinically justified",
  "concerns": ["list any safety, HIPAA, or FDA concerns with this implementation that the reviewer should check"]
}`;

export async function generateCodeProposal(args: {
  articleId: number;
  title: string;
  excerpt: string | null;
  tags: string[];
  summary: string | null;
}): Promise<CodeProposal> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing — code proposal engine unavailable");

  const topicText = `${args.title} ${args.excerpt ?? ""} ${args.tags.join(" ")}`;
  const relevantFiles = resolveRelevantFiles(topicText);

  const fileSection = Object.entries(relevantFiles)
    .map(([fp, code]) => `FILE: ${fp}\n\`\`\`typescript\n${code}\n\`\`\``)
    .join("\n\n");

  const userPrompt = `
Research article:
Title: ${args.title}
Tags: ${args.tags.join(", ")}
Excerpt: ${(args.excerpt ?? "(none)").slice(0, 600)}
Summary: ${(args.summary ?? "(none)").slice(0, 800)}

Relevant Auralyn source files:
${fileSection || "(no directly matching files — propose new file if appropriate)"}

Based on the article's findings, produce concrete TypeScript code changes for Auralyn.
Focus on the most impactful, clinically safe improvements first.
Only propose changes directly supported by evidence in the article.
If no concrete improvement is warranted, return a single file with an explanation of why.
`.trim();

  try {
    const openai = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });

    const resp = await openai.chat.completions.create({
      model:           "gpt-4o",
      max_tokens:      3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ARCHITECT_SYSTEM },
        { role: "user",   content: userPrompt },
      ],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as CodeProposal;

    if (!Array.isArray(parsed.files) || !parsed.summary) {
      throw new Error("GPT-4o Code Architect returned invalid structure");
    }

    return parsed;
  } catch (err: any) {
    console.error("[autoCodeProposalEngine] GPT-4o call failed:", err?.message);
    return {
      files: [],
      summary: `Code proposal generation failed: ${err?.message ?? "unknown error"}. Manual review of article required.`,
      concerns: ["Pipeline failed — manual engineering review needed before any implementation."],
    };
  }
}

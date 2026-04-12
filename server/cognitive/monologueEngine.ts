/**
 * Clinical Monologue Engine
 * Generates an internal reasoning trace BEFORE the system commits to a diagnosis.
 * Uses GPT-4o-mini when OPENAI_API_KEY is present; deterministic fallback otherwise.
 */

let _openai: any = null;
function getOpenAI() {
  if (!_openai) { const { default: OpenAI } = require("openai"); _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); }
  return _openai;
}

export interface ClinicalMonologue {
  uncertainty_level:      number;       // 0–1
  dangerous_misses:       string[];
  bias_flags:             string[];
  confidence_gaps:        string[];
  recommended_strategy:   "rule_out" | "reassure" | "escalate" | "observe";
  reasoning_summary:      string;
}

function deterministicMonologue(context: any): ClinicalMonologue {
  const symptoms  = (context.symptoms  as string[] | undefined) ?? [];
  const vitals    = (context.vitals    as Record<string, number> | undefined) ?? {};
  const redFlags  = context.redFlags;
  const hr        = Number(vitals.hr   ?? 72);
  const spo2      = Number(vitals.spo2 ?? 99);
  const tempF     = Number(vitals.tempF ?? 98.6);
  const sbp       = Number(vitals.systolicBP ?? 120);

  const dangerous_misses: string[] = [];
  const bias_flags:       string[] = [];
  const confidence_gaps:  string[] = [];

  // Red-flag dangerous misses
  if (symptoms.includes("chest pain") || symptoms.includes("chest_pain")) {
    dangerous_misses.push("ACS", "PE");
  }
  if (spo2 < 92) dangerous_misses.push("respiratory_failure");
  if (sbp < 90)  dangerous_misses.push("septic_shock");
  if (tempF > 103 && hr > 110) dangerous_misses.push("sepsis");

  // Bias flags
  if (symptoms.length <= 1) bias_flags.push("anchoring_single_symptom");
  if (!vitals.hr)           confidence_gaps.push("heart_rate_missing");
  if (!vitals.spo2)         confidence_gaps.push("oxygen_saturation_missing");

  // Uncertainty scoring
  const severityScore = (dangerous_misses.length * 0.2) + (confidence_gaps.length * 0.1);
  const uncertainty_level = Math.min(1, redFlags ? 0.85 : severityScore);

  // Strategy
  let recommended_strategy: ClinicalMonologue["recommended_strategy"] = "reassure";
  if (redFlags || uncertainty_level > 0.7)          recommended_strategy = "rule_out";
  else if (uncertainty_level > 0.4)                 recommended_strategy = "escalate";
  else if (dangerous_misses.length === 0)           recommended_strategy = "observe";

  return {
    uncertainty_level: Number(uncertainty_level.toFixed(3)),
    dangerous_misses,
    bias_flags,
    confidence_gaps,
    recommended_strategy,
    reasoning_summary: `Symptoms: [${symptoms.join(", ")}]. Dangerous misses to rule out: [${dangerous_misses.join(", ") || "none"}]. Strategy: ${recommended_strategy}.`,
  };
}

export async function generateClinicalMonologue(context: any): Promise<ClinicalMonologue> {
  if (!process.env.OPENAI_API_KEY) return deterministicMonologue(context);

  try {
    const ai     = getOpenAI();
    const prompt = `You are a clinical reasoning engine performing an internal pre-decision monologue for a physician AI.

Patient context:
${JSON.stringify(context, null, 2)}

Analyse diagnostic uncertainty, dangerous misses, potential cognitive biases, and missing data. Return ONLY valid JSON with this exact structure:
{
  "uncertainty_level": <float 0-1>,
  "dangerous_misses": [<strings>],
  "bias_flags": [<strings>],
  "confidence_gaps": [<strings>],
  "recommended_strategy": <"rule_out"|"reassure"|"escalate"|"observe">,
  "reasoning_summary": <string>
}`;

    const res = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Expert clinical reasoning AI. Return only valid JSON." },
        { role: "user",   content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
    });

    const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
    return {
      uncertainty_level:    Number(parsed.uncertainty_level ?? 0.5),
      dangerous_misses:     Array.isArray(parsed.dangerous_misses) ? parsed.dangerous_misses : [],
      bias_flags:           Array.isArray(parsed.bias_flags) ? parsed.bias_flags : [],
      confidence_gaps:      Array.isArray(parsed.confidence_gaps) ? parsed.confidence_gaps : [],
      recommended_strategy: parsed.recommended_strategy ?? "observe",
      reasoning_summary:    String(parsed.reasoning_summary ?? ""),
    };
  } catch {
    return deterministicMonologue(context);
  }
}

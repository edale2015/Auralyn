import { openai } from "../replit_integrations/audio/client";

export interface ClinicalReasoningInput {
  complaint: string;
  answers: Record<string, any>;
  redFlags?: string[];
  patientAge?: number;
  patientSex?: string;
  existingDiagnoses?: string[];
}

export interface ClinicalReasoningOutput {
  differentialDiagnoses: Array<{
    diagnosis: string;
    probability: number;
    reasoning: string;
  }>;
  recommendedDisposition: string;
  criticalFindings: string[];
  nextSteps: string[];
  confidence: string;
  reasoning: string;
  latencyMs: number;
  model: string;
}

const SYSTEM_PROMPT = `You are a clinical reasoning AI assistant specializing in ENT and flu-like illness triage.
Given patient complaint, structured answers, and red flags, provide:
1. Differential diagnoses with estimated probabilities (sum to 1.0)
2. Recommended disposition (ED_IMMEDIATE, ED_URGENT, URGENT_CARE, OFFICE_VISIT, HOME_CARE, TELEHEALTH)
3. Critical findings that require immediate attention
4. Recommended next steps for the clinician
5. Overall confidence level (HIGH, MODERATE, LOW)
6. Brief clinical reasoning narrative

Respond in valid JSON with this exact structure:
{
  "differentialDiagnoses": [{"diagnosis": "...", "probability": 0.X, "reasoning": "..."}],
  "recommendedDisposition": "...",
  "criticalFindings": ["..."],
  "nextSteps": ["..."],
  "confidence": "HIGH|MODERATE|LOW",
  "reasoning": "..."
}`;

export async function runClinicalReasoningAgent(input: ClinicalReasoningInput): Promise<ClinicalReasoningOutput> {
  const t0 = Date.now();

  const userMessage = [
    `Complaint: ${input.complaint}`,
    `Patient: ${input.patientAge ?? "unknown"} year old ${input.patientSex ?? "unknown"}`,
    `Answers: ${JSON.stringify(input.answers)}`,
    input.redFlags?.length ? `Red Flags: ${input.redFlags.join(", ")}` : "",
    input.existingDiagnoses?.length ? `Known diagnoses: ${input.existingDiagnoses.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const latencyMs = Date.now() - t0;

    return {
      differentialDiagnoses: parsed.differentialDiagnoses ?? [],
      recommendedDisposition: parsed.recommendedDisposition ?? "OFFICE_VISIT",
      criticalFindings: parsed.criticalFindings ?? [],
      nextSteps: parsed.nextSteps ?? [],
      confidence: parsed.confidence ?? "LOW",
      reasoning: parsed.reasoning ?? "",
      latencyMs,
      model: "gpt-4o",
    };
  } catch (err: any) {
    throw new Error(`Clinical reasoning agent failed: ${err?.message ?? "Unknown error"}`);
  }
}

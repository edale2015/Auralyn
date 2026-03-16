import { openai } from "../replit_integrations/audio/client";

export interface ChartInput {
  complaint: string;
  answers: Record<string, any>;
  disposition: string;
  differentialDiagnoses?: Array<{ diagnosis: string; probability: number }>;
  redFlags?: string[];
  physicianNotes?: string;
}

export interface ChartOutput {
  chiefComplaint: string;
  hpi: string;
  reviewOfSystems: string;
  assessment: string;
  plan: string;
  icdCodes: string[];
  cptCodes: string[];
  latencyMs: number;
  model: string;
}

const SYSTEM_PROMPT = `You are a medical chart documentation AI assistant.
Given patient complaint data, triage answers, disposition, and differential diagnoses, generate a structured clinical note.
Output valid JSON with:
{
  "chiefComplaint": "One-line chief complaint",
  "hpi": "History of present illness narrative (2-3 sentences)",
  "reviewOfSystems": "Pertinent ROS findings",
  "assessment": "Clinical assessment with differentials",
  "plan": "Recommended plan of care",
  "icdCodes": ["ICD-10 codes"],
  "cptCodes": ["CPT codes for E/M level"]
}`;

export async function runChartAgent(input: ChartInput): Promise<ChartOutput> {
  const t0 = Date.now();

  const userMessage = [
    `Complaint: ${input.complaint}`,
    `Disposition: ${input.disposition}`,
    `Answers: ${JSON.stringify(input.answers)}`,
    input.differentialDiagnoses?.length
      ? `Differentials: ${input.differentialDiagnoses.map((d) => `${d.diagnosis} (${(d.probability * 100).toFixed(0)}%)`).join(", ")}`
      : "",
    input.redFlags?.length ? `Red Flags: ${input.redFlags.join(", ")}` : "",
    input.physicianNotes ? `Physician Notes: ${input.physicianNotes}` : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const latencyMs = Date.now() - t0;

    return {
      chiefComplaint: parsed.chiefComplaint ?? "",
      hpi: parsed.hpi ?? "",
      reviewOfSystems: parsed.reviewOfSystems ?? "",
      assessment: parsed.assessment ?? "",
      plan: parsed.plan ?? "",
      icdCodes: parsed.icdCodes ?? [],
      cptCodes: parsed.cptCodes ?? [],
      latencyMs,
      model: "gpt-4o",
    };
  } catch (err: any) {
    throw new Error(`Chart agent failed: ${err?.message ?? "Unknown error"}`);
  }
}

import { Router } from "express";
import OpenAI from "openai";

const router = Router();

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
}

router.post("/", async (req, res) => {
  const { transcript, complaintId, fields } = req.body as {
    transcript: string;
    complaintId: string;
    fields: Array<{ field: string; label: string }>;
  };

  if (!transcript?.trim()) {
    return res.status(400).json({ error: "No transcript provided" });
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    return res.status(400).json({ error: "No fields provided" });
  }

  const ai = getOpenAI();
  if (!ai) {
    return res.status(503).json({ error: "AI service not configured" });
  }

  const fieldList = fields.map(f => `- ${f.field}: "${f.label}"`).join("\n");

  const prompt = `You are a medical scribe. A clinician dictated the following patient history for complaint: ${complaintId}

TRANSCRIPT:
"${transcript}"

TASK:
Below are clinical data fields. For each field, determine if the transcript clearly indicates YES or NO.
Return ONLY a valid JSON object with field IDs as keys and "yes" or "no" as values.
Only include fields where the transcript CLEARLY indicates yes or no — omit anything unclear or not mentioned.

FIELDS:
${fieldList}

Respond with valid JSON only. No explanation. Example: {"Q_CP_CONSTANT":"yes","Q_CP_EXERTIONAL":"no"}`;

  try {
    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    const fieldIds = new Set(fields.map(f => f.field));
    const fieldValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (fieldIds.has(k) && (v === "yes" || v === "no")) {
        fieldValues[k] = v as string;
      }
    }

    return res.json({ fieldValues });
  } catch (err: any) {
    console.error("[VoiceParse] Error:", err?.message);
    return res.status(500).json({ error: err?.message ?? "Parse error" });
  }
});

export default router;

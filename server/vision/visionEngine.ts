import OpenAI from "openai";
import { responseCache } from "../cache/responseCache";

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export interface ScreenAnalysis {
  fields: Array<{ selector: string; label: string; type: string }>;
  buttons: Array<{ selector: string; label: string; action: string }>;
  rawDescription: string;
  confidence: "high" | "medium" | "low";
}

export async function analyzeScreenshot(base64Image: string): Promise<ScreenAnalysis> {
  const cacheKey = `vision:${base64Image.slice(0, 64)}`;
  const cached = responseCache.get<ScreenAnalysis>(cacheKey);
  if (cached) return cached;

  const client = getClient();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are analyzing a UI screenshot for automated form filling.
Return a JSON object with this exact structure:
{
  "fields": [{"selector": "#css-selector", "label": "Field Label", "type": "text|email|date|number|select|textarea"}],
  "buttons": [{"selector": "#css-selector", "label": "Button Text", "action": "submit|cancel|navigate|other"}],
  "rawDescription": "Brief description of what this screen shows",
  "confidence": "high|medium|low"
}
Only return valid JSON, no markdown.`,
          },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64Image}` },
          },
        ],
      },
    ],
    max_tokens: 1000,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";

  let parsed: ScreenAnalysis;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      fields: [],
      buttons: [],
      rawDescription: raw,
      confidence: "low",
    };
  }

  responseCache.set(cacheKey, parsed, 300_000);
  return parsed;
}

export async function smartFill(
  pageContent: string,
  variables: Record<string, string>
): Promise<Array<{ selector: string; value: string }>> {
  const cacheKey = `smartfill:${pageContent.slice(0, 64)}:${JSON.stringify(variables).slice(0, 32)}`;
  const cached = responseCache.get<Array<{ selector: string; value: string }>>(cacheKey);
  if (cached) return cached;

  const client = getClient();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `You are a form-filling assistant. Given this HTML page content and data, return a JSON array of {selector, value} pairs to fill the form.

HTML (truncated):
${pageContent.slice(0, 3000)}

Data to fill:
${JSON.stringify(variables, null, 2)}

Return ONLY a JSON array like: [{"selector": "#field-id", "value": "value to fill"}]`,
      },
    ],
    max_tokens: 500,
  });

  const raw = response.choices[0]?.message?.content ?? "[]";
  let result: Array<{ selector: string; value: string }>;
  try {
    result = JSON.parse(raw);
  } catch {
    result = [];
  }

  responseCache.set(cacheKey, result, 60_000);
  return result;
}

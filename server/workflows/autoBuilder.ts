let _openai: any = null;
function getOpenAI() {
  if (!_openai) {
    const { default: OpenAI } = require("openai");
    _openai = new OpenAI();
  }
  return _openai;
}

export interface GeneratedWorkflow {
  nodes: Array<{ id: string; position: { x: number; y: number }; data: { label: string }; [key: string]: unknown }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

const FALLBACK_WORKFLOW: GeneratedWorkflow = {
  nodes: [
    { id: "s1", position: { x: 50,  y: 80 }, data: { label: "⚡ Fast Triage" } },
    { id: "s2", position: { x: 280, y: 80 }, data: { label: "🔀 Safety Check" } },
    { id: "s3", position: { x: 510, y: 80 }, data: { label: "💰 Bill" } },
  ],
  edges: [
    { id: "e1-2", source: "s1", target: "s2" },
    { id: "e2-3", source: "s2", target: "s3" },
  ],
};

export async function generateWorkflow(prompt: string): Promise<GeneratedWorkflow> {
  try {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            'Return ONLY valid JSON (no markdown) with shape: {"nodes":[{"id":"n1","position":{"x":50,"y":80},"data":{"label":"Step"}}],"edges":[{"id":"e1","source":"n1","target":"n2"}]}. Nodes represent clinical workflow steps. Keep it under 6 nodes.',
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 600,
    });

    const text = res.choices[0]?.message?.content?.trim() ?? "";
    const jsonStr = text.startsWith("```")
      ? text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "")
      : text;
    const parsed = JSON.parse(jsonStr) as GeneratedWorkflow;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return FALLBACK_WORKFLOW;
    }
    return parsed;
  } catch {
    return FALLBACK_WORKFLOW;
  }
}

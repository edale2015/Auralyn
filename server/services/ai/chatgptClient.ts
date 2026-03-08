export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
  timestamp: string;
}

export async function chatCompletion(messages: ChatMessage[], options?: { model?: string; maxTokens?: number }): Promise<ChatCompletionResult> {
  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI();
    const response = await client.chat.completions.create({
      model: options?.model || "gpt-4o",
      messages,
      max_tokens: options?.maxTokens || 1000,
    });
    return {
      content: response.choices?.[0]?.message?.content || "",
      model: response.model || options?.model || "gpt-4o",
      tokensUsed: response.usage?.total_tokens || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      content: `AI service unavailable: ${err?.message ?? "unknown error"}`,
      model: options?.model || "gpt-4o",
      tokensUsed: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

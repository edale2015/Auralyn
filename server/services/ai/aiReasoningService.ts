import { chatCompletion, type ChatMessage } from "./chatgptClient";
import { getTemplate } from "./promptTemplates";

export interface ReasoningRequest {
  templateId: string;
  variables: Record<string, string>;
}

export interface ReasoningResponse {
  templateId: string;
  output: string;
  tokensUsed: number;
  timestamp: string;
}

export async function runAiReasoning(request: ReasoningRequest): Promise<ReasoningResponse> {
  const template = getTemplate(request.templateId);
  if (!template) throw new Error(`Template not found: ${request.templateId}`);

  let userContent = template.userPromptTemplate;
  for (const [key, value] of Object.entries(request.variables)) {
    userContent = userContent.replace(`{{${key}}}`, value);
  }

  const messages: ChatMessage[] = [
    { role: "system", content: template.systemPrompt },
    { role: "user", content: userContent },
  ];

  const result = await chatCompletion(messages);

  return {
    templateId: request.templateId,
    output: result.content,
    tokensUsed: result.tokensUsed,
    timestamp: result.timestamp,
  };
}

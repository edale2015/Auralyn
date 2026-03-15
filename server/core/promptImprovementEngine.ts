import { openai } from '../replit_integrations/audio/client';

export interface PromptImprovementRequest {
  originalPrompt: string;
  context: string;
  goal: 'clarity' | 'empathy' | 'completeness' | 'de_escalation' | 'engagement';
  complaint?: string;
}

export interface PromptImprovementResult {
  original: string;
  improved: string;
  reasoning: string;
  changesSummary: string[];
  toneShift: string;
  readabilityImprovement: string;
}

export async function promptImprovementEngine(
  request: PromptImprovementRequest
): Promise<PromptImprovementResult> {
  const goalDescriptions: Record<string, string> = {
    clarity: 'Make the language simpler, shorter sentences, avoid medical jargon, use plain English',
    empathy: 'Add warmer tone, acknowledge patient feelings, use empathetic phrasing',
    completeness: 'Ensure all key clinical questions are asked (onset, duration, severity, red flags, modifiers)',
    de_escalation: 'Calm the patient, validate emotions, avoid dismissive phrases, use supportive language',
    engagement: 'Make the conversation more natural, friendly, and encouraging for the patient',
  };

  const systemPrompt = `You are an expert clinical communication coach. 
You rewrite AI-to-patient clinical conversation prompts to improve ${goalDescriptions[request.goal]}.
Return valid JSON only with these exact fields: improved, reasoning, changesSummary (array of strings), toneShift, readabilityImprovement.`;

  const userPrompt = `Original prompt:
"${request.originalPrompt}"

Context: ${request.context}
${request.complaint ? `Clinical complaint: ${request.complaint.replace(/_/g, ' ')}` : ''}
Goal: ${request.goal}

Improve this prompt. Return JSON only.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? '{}');

    return {
      original: request.originalPrompt,
      improved: parsed.improved ?? request.originalPrompt,
      reasoning: parsed.reasoning ?? 'No reasoning provided',
      changesSummary: Array.isArray(parsed.changesSummary) ? parsed.changesSummary : [],
      toneShift: parsed.toneShift ?? 'Unknown',
      readabilityImprovement: parsed.readabilityImprovement ?? 'Unknown',
    };
  } catch (err: any) {
    return {
      original: request.originalPrompt,
      improved: request.originalPrompt,
      reasoning: `GPT-4o unavailable: ${err.message}`,
      changesSummary: ['Manual review required'],
      toneShift: 'None applied',
      readabilityImprovement: 'None applied',
    };
  }
}

export async function replayWithBetterTone(
  messages: { role: string; text: string }[],
  targetTone: string
): Promise<{ replayedMessages: { role: string; original: string; improved: string }[] }> {
  const aiMessages = messages.filter((m) => m.role === 'ai');

  const results = await Promise.all(
    aiMessages.map(async (msg) => {
      const result = await promptImprovementEngine({
        originalPrompt: msg.text,
        context: `Conversation replay with ${targetTone} tone`,
        goal: targetTone === 'empathy' ? 'empathy' :
              targetTone === 'de_escalation' ? 'de_escalation' :
              targetTone === 'clarity' ? 'clarity' : 'engagement',
      });
      return { role: msg.role, original: msg.text, improved: result.improved };
    })
  );

  return { replayedMessages: results };
}

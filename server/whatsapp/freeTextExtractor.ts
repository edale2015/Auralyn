/**
 * freeTextExtractor.ts
 * Fix 2 + Fix 4: GPT-4o-mini free-text answer extraction + adaptive follow-up.
 *
 * When a patient sends a natural language reply (e.g. "no it started with a
 * fever, then my nose was stuffy and I just started coughing yesterday"), this
 * module:
 *   1. Extracts structured answers for any unanswered Q_IDs it can infer
 *   2. Generates a short warm acknowledgment of what was said
 *   3. Generates a natural conversational follow-up for the next unanswered point
 *
 * Runs async after the immediate "Got it…" ack is already sent — total GPT
 * latency is ~400-700ms on gpt-4o-mini.
 */

import OpenAI from "openai";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI();
  return _client;
}

export interface ExtractionResult {
  extractedAnswers:  Record<string, string | number>;
  acknowledgment:    string;       // e.g. "Got it — so the cough just started yesterday."
  nextQuestionText:  string;       // e.g. "Any trouble breathing or chest tightness?"
}

const ANSWER_HINT: Record<string, string> = {
  tri:     "yes or no",
  boolean: "yes or no",
  number:  "integer 1-10",
};

export async function extractAndAdapt(params: {
  patientText:          string;
  complaintDisplay:     string;
  unansweredQuestions:  Array<{ Q_ID: string; QUESTION_TEXT: string; ANSWER_TYPE: string }>;
}): Promise<ExtractionResult> {
  const { patientText, complaintDisplay, unansweredQuestions } = params;
  const nextQ = unansweredQuestions[0];

  if (!nextQ) {
    return { extractedAnswers: {}, acknowledgment: "", nextQuestionText: "" };
  }

  const questionList = unansweredQuestions
    .slice(0, 6)
    .map((q, i) =>
      `${i + 1}. Q_ID="${q.Q_ID}" | "${q.QUESTION_TEXT}" | answer: ${ANSWER_HINT[q.ANSWER_TYPE] ?? q.ANSWER_TYPE}`
    )
    .join("\n");

  const systemPrompt =
    `You are a clinical triage assistant. A patient reported "${complaintDisplay}". ` +
    `Extract clinical information from their message and write a short conversational follow-up.\n` +
    `Rules:\n` +
    `- acknowledgment: 1 sentence, ≤15 words, warm, conversational, summarise what you heard\n` +
    `- nextQuestionText: ≤10 words, natural, conversational (not clinical form language)\n` +
    `- Only extract answers you are confident about from the text\n` +
    `- yes/no fields: use "yes" or "no" exactly\n` +
    `- number fields: integer only\n` +
    `- Respond ONLY with valid JSON, no markdown`;

  const userPrompt =
    `Patient said: "${patientText}"\n\n` +
    `Unanswered questions (extract answers where the patient's text already covers them):\n` +
    `${questionList}\n\n` +
    `Return JSON:\n` +
    `{\n` +
    `  "extractedAnswers": { "Q_ID": "value", ... },\n` +
    `  "acknowledgment": "Got it — ...",\n` +
    `  "nextQuestionText": "..."\n` +
    `}`;

  try {
    const resp = await getClient().chat.completions.create({
      model:           "gpt-4o-mini",
      messages:        [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      temperature:     0.25,
      max_tokens:      280,
      response_format: { type: "json_object" },
    });

    const raw    = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    return {
      extractedAnswers: parsed.extractedAnswers  ?? {},
      acknowledgment:   parsed.acknowledgment    ?? "",
      nextQuestionText: parsed.nextQuestionText  ?? nextQ.QUESTION_TEXT,
    };
  } catch (e: any) {
    console.warn("[FreeTextExtractor] GPT extraction failed:", e?.message);
    return {
      extractedAnswers: {},
      acknowledgment:   "",
      nextQuestionText: nextQ.QUESTION_TEXT,
    };
  }
}

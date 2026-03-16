export interface GoldenConversationMessage {
  role: 'patient' | 'ai' | 'physician';
  text: string;
  turn: number;
  isIdeal?: boolean;
  notes?: string;
}

export interface GoldenConversation {
  id: string;
  complaint: string;
  messages: GoldenConversationMessage[];
  idealQuestions: string[];
  idealDisposition: string;
  targetEmpathyScore: number;
  targetCompletenessScore: number;
  redFlagsAddressed: string[];
  modifiersAsked: string[];
  createdAt: string;
  createdBy?: string;
  tags: string[];
  version: number;
}

export interface GoldenConversationInput {
  complaint: string;
  messages: { role: string; text: string }[];
  questions: string[];
  disposition: string;
  redFlagsAddressed?: string[];
  modifiersAsked?: string[];
  createdBy?: string;
  tags?: string[];
}

const goldenStore: Map<string, GoldenConversation> = new Map();

export function createGoldenConversation(data: GoldenConversationInput): GoldenConversation {
  const id = `golden_${data.complaint}_${Date.now()}`;

  const messages: GoldenConversationMessage[] = data.messages.map((m, i) => ({
    role: m.role as GoldenConversationMessage['role'],
    text: m.text,
    turn: i + 1,
    isIdeal: true,
  }));

  const targetEmpathyScore = scoreEmpathy(messages);
  const targetCompletenessScore = scoreCompleteness(data.questions, messages);

  const golden: GoldenConversation = {
    id,
    complaint: data.complaint,
    messages,
    idealQuestions: data.questions,
    idealDisposition: data.disposition,
    targetEmpathyScore,
    targetCompletenessScore,
    redFlagsAddressed: data.redFlagsAddressed ?? inferRedFlags(messages),
    modifiersAsked: data.modifiersAsked ?? inferModifiers(messages),
    createdAt: new Date().toISOString(),
    createdBy: data.createdBy,
    tags: data.tags ?? [data.complaint],
    version: 1,
  };

  goldenStore.set(id, golden);
  return golden;
}

export function getGoldenConversation(id: string): GoldenConversation | null {
  return goldenStore.get(id) ?? null;
}

export function listGoldenConversations(complaint?: string): GoldenConversation[] {
  const all = Array.from(goldenStore.values());
  return complaint ? all.filter((g) => g.complaint === complaint) : all;
}

export function deleteGoldenConversation(id: string): boolean {
  return goldenStore.delete(id);
}

export function scoreConversationAgainstGolden(
  messages: { role: string; text: string }[],
  goldenId: string
): {
  empathyDelta: number;
  completenessDelta: number;
  missedQuestions: string[];
  overallMatch: number;
} {
  const golden = goldenStore.get(goldenId);
  if (!golden) throw new Error(`Golden conversation ${goldenId} not found`);

  const combinedText = messages.map((m) => m.text.toLowerCase()).join(' ');
  const missedQuestions = golden.idealQuestions.filter(
    (q) => !combinedText.includes(q.toLowerCase().slice(0, 20))
  );

  const empathyScore = scoreEmpathy(messages.map((m, i) => ({ ...m, role: m.role as any, turn: i })));
  const completenessScore = scoreCompleteness(golden.idealQuestions, messages.map((m, i) => ({ ...m, role: m.role as any, turn: i })));

  return {
    empathyDelta: parseFloat((empathyScore - golden.targetEmpathyScore).toFixed(2)),
    completenessDelta: parseFloat((completenessScore - golden.targetCompletenessScore).toFixed(2)),
    missedQuestions,
    overallMatch: parseFloat(((1 - missedQuestions.length / Math.max(1, golden.idealQuestions.length)) * 100).toFixed(1)),
  };
}

function scoreEmpathy(messages: GoldenConversationMessage[]): number {
  const aiText = messages.filter((m) => m.role === 'ai').map((m) => m.text.toLowerCase()).join(' ');
  const empathyWords = ['understand', 'hear you', 'sorry', 'concern', 'together', 'support', 'sense', 'difficult'];
  return Math.min(1.0, empathyWords.filter((w) => aiText.includes(w)).length / 4);
}

function scoreCompleteness(questions: string[], messages: GoldenConversationMessage[]): number {
  const text = messages.map((m) => m.text.toLowerCase()).join(' ');
  const covered = questions.filter((q) => text.includes(q.toLowerCase().slice(0, 20))).length;
  return questions.length > 0 ? covered / questions.length : 1.0;
}

function inferRedFlags(messages: GoldenConversationMessage[]): string[] {
  const text = messages.map((m) => m.text.toLowerCase()).join(' ');
  const flags = ['chest pain', 'shortness of breath', 'syncope', 'blood', 'stroke', 'severe headache'];
  return flags.filter((f) => text.includes(f));
}

function inferModifiers(messages: GoldenConversationMessage[]): string[] {
  const text = messages.map((m) => m.text.toLowerCase()).join(' ');
  const modifiers = ['when did', 'how long', 'worse', 'better', 'medication', 'allerg'];
  return modifiers.filter((m) => text.includes(m));
}

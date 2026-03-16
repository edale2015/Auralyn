export type ToneStrategy =
  | 'calm_reassuring'
  | 'urgent_directive'
  | 'empathetic_gathering'
  | 'de_escalating'
  | 'focused_clinical'
  | 'gentle_informing';

export interface ToneContext {
  anxietyLevel?: number;
  severity?: 'low' | 'moderate' | 'high' | 'critical';
  emotionalState?: 'calm' | 'anxious' | 'angry' | 'confused' | 'frightened';
  conversationTurn?: number;
  complaint?: string;
  redFlagPresent?: boolean;
}

export interface ToneStrategyResult {
  strategy: ToneStrategy;
  openingPhrase: string;
  paceDirective: string;
  questionStyle: string;
  avoidPatterns: string[];
  rationale: string;
}

const STRATEGY_CONFIGS: Record<ToneStrategy, Omit<ToneStrategyResult, 'strategy' | 'rationale'>> = {
  calm_reassuring: {
    openingPhrase: "I hear you, and I want you to know we\'re going to work through this together.",
    paceDirective: 'Slow, deliberate — one point at a time',
    questionStyle: 'Open, gentle, affirming',
    avoidPatterns: ['Don\'t worry', 'It\'s nothing', 'Just relax', 'Calm down'],
  },
  urgent_directive: {
    openingPhrase: "I need to ask you a few quick important questions right now.",
    paceDirective: 'Efficient, focused — no tangents',
    questionStyle: 'Closed, direct yes/no questions',
    avoidPatterns: ['Maybe', 'Probably', 'Let\'s see', 'Not sure'],
  },
  empathetic_gathering: {
    openingPhrase: "Thank you for sharing that with me. I want to make sure I fully understand your situation.",
    paceDirective: 'Steady — let patient lead with prompts',
    questionStyle: 'Open-ended, exploratory',
    avoidPatterns: ['Just', 'Simply', 'Obviously', 'You should already know'],
  },
  de_escalating: {
    openingPhrase: "I completely understand why you\'re feeling this way. Let\'s slow down together.",
    paceDirective: 'Very slow — validate before each question',
    questionStyle: 'Single-topic, ultra-focused',
    avoidPatterns: ['Calm down', 'You\'re overreacting', 'I already told you', 'That\'s not possible'],
  },
  focused_clinical: {
    openingPhrase: "To help you best, I need to ask a few specific questions about your symptoms.",
    paceDirective: 'Moderate, structured — one domain at a time',
    questionStyle: 'Semi-closed, systematic',
    avoidPatterns: ['Long explanations mid-question', 'Multiple questions at once'],
  },
  gentle_informing: {
    openingPhrase: "I\'d like to share some important information with you, and please feel free to ask me anything.",
    paceDirective: 'Measured — pause between information chunks',
    questionStyle: 'Check for understanding after each chunk',
    avoidPatterns: ['Information dumps', 'Technical jargon', 'Rushed explanations'],
  },
};

export function toneStrategyEngine(context: ToneContext): ToneStrategyResult {
  const anxiety = context.anxietyLevel ?? 0;
  const severity = context.severity ?? 'low';
  const emotional = context.emotionalState ?? 'calm';
  const redFlag = context.redFlagPresent ?? false;

  let strategy: ToneStrategy;
  let rationale: string;

  if (redFlag || severity === 'critical') {
    strategy = 'urgent_directive';
    rationale = 'Red flag or critical severity — rapid, direct information gathering required';
  } else if (emotional === 'angry' || anxiety > 0.8) {
    strategy = 'de_escalating';
    rationale = 'High emotional arousal — de-escalation must precede clinical questioning';
  } else if (anxiety > 0.7 || emotional === 'frightened') {
    strategy = 'calm_reassuring';
    rationale = 'Elevated anxiety — prioritize emotional safety before clinical depth';
  } else if (emotional === 'confused') {
    strategy = 'gentle_informing';
    rationale = 'Patient confused — clarity and structured explanation mode';
  } else if (severity === 'high') {
    strategy = 'focused_clinical';
    rationale = 'High severity, stable affect — systematic clinical gathering';
  } else {
    strategy = 'empathetic_gathering';
    rationale = 'Standard engagement — open gathering with empathetic foundation';
  }

  return {
    strategy,
    rationale,
    ...STRATEGY_CONFIGS[strategy],
  };
}

export function getToneForSeverityAndAnxiety(severity: string, anxietyLevel: number): ToneStrategy {
  return toneStrategyEngine({ severity: severity as any, anxietyLevel }).strategy;
}

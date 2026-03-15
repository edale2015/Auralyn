export interface DeEscalationInput {
  patientStatement: string;
  emotionalState?: 'anxious' | 'angry' | 'frightened' | 'confused' | 'calm';
  complaint?: string;
}

export interface DeEscalationResult {
  detectedState: string;
  escalationLevel: 0 | 1 | 2 | 3;
  protocol: DeEscalationProtocol;
  suggestedResponse: string;
  followUpPrompts: string[];
  avoidPhrases: string[];
}

export interface DeEscalationProtocol {
  name: string;
  steps: string[];
  tone: string;
  priority: 'immediate' | 'moderate' | 'standard';
}

const ANXIETY_MARKERS = ['scared', 'terrified', 'worried', 'panic', 'anxious', 'fear', 'afraid', 'dying'];
const ANGER_MARKERS = ['angry', 'frustrated', 'furious', 'upset', 'ridiculous', 'incompetent', 'useless', 'waste'];
const CONFUSION_MARKERS = ['confused', "don't understand", 'what do you mean', 'not sure', 'lost'];

const PROTOCOLS: Record<string, DeEscalationProtocol> = {
  anxiety: {
    name: 'Anxiety De-escalation',
    tone: 'calm, reassuring, measured',
    priority: 'immediate',
    steps: [
      'Acknowledge feelings without dismissing: "I can hear that you\'re frightened"',
      'Normalize the emotion: "It makes complete sense to feel worried about this"',
      'Redirect to immediate next step: "Let\'s focus on what we can do right now"',
      'Provide a concrete action: "First, tell me what feels most urgent"',
      'Offer support: "I\'m here with you every step of the way"',
    ],
  },
  anger: {
    name: 'Anger De-escalation',
    tone: 'neutral, non-defensive, empathetic',
    priority: 'immediate',
    steps: [
      'Validate without agreeing: "I understand this has been frustrating"',
      'Avoid defensive language or counter-arguments',
      'Lower your own tone: "Let me make sure I understand your concern correctly"',
      'Find common ground: "We both want the best outcome for you"',
      'Offer a concrete next step to move forward constructively',
    ],
  },
  confusion: {
    name: 'Clarity Protocol',
    tone: 'patient, simple language, step-by-step',
    priority: 'moderate',
    steps: [
      'Check comprehension gently: "Let me explain that more clearly"',
      'Break information into numbered steps',
      'Ask confirmation: "Does that make sense so far?"',
      'Invite questions: "What part would you like me to clarify?"',
      'Summarize at the end: "So to recap what we covered..."',
    ],
  },
  standard: {
    name: 'Standard Engagement',
    tone: 'warm, professional',
    priority: 'standard',
    steps: [
      'Greet warmly and establish rapport',
      'Use the patient\'s name',
      'Ask open-ended questions first',
      'Summarize what was shared to confirm understanding',
      'End with clear next steps',
    ],
  },
};

export function deEscalationEngine(input: DeEscalationInput): DeEscalationResult {
  const lower = input.patientStatement.toLowerCase();

  const isAnxious = ANXIETY_MARKERS.some((m) => lower.includes(m));
  const isAngry = ANGER_MARKERS.some((m) => lower.includes(m));
  const isConfused = CONFUSION_MARKERS.some((m) => lower.includes(m));

  const detectedState = isAngry ? 'angry' : isAnxious ? 'anxious' : isConfused ? 'confused' : 'calm';

  const escalationLevel: 0 | 1 | 2 | 3 =
    isAngry ? 3 :
    isAnxious ? 2 :
    isConfused ? 1 : 0;

  const protocolKey = isAngry ? 'anger' : isAnxious ? 'anxiety' : isConfused ? 'confusion' : 'standard';
  const protocol = PROTOCOLS[protocolKey];

  const suggestedResponse = buildSuggestedResponse(detectedState, input.complaint);

  const followUpPrompts = [
    `Can you tell me more about what's worrying you most?`,
    `I want to make sure I'm understanding your concern correctly — can you describe it again in your own words?`,
    `What would feel most helpful right now?`,
  ];

  const avoidPhrases = [
    "Calm down",
    "You're overreacting",
    "It's not that serious",
    "Don't worry about it",
    "I already told you",
    "That's not possible",
  ];

  return {
    detectedState,
    escalationLevel,
    protocol,
    suggestedResponse,
    followUpPrompts,
    avoidPhrases,
  };
}

function buildSuggestedResponse(state: string, complaint?: string): string {
  const c = complaint ? ` about your ${complaint.replace(/_/g, ' ')}` : '';
  if (state === 'anxious') {
    return `I hear that you're concerned${c}. That's completely understandable. Let's work through this together, one step at a time. I'm right here with you — what feels most important to address first?`;
  }
  if (state === 'angry') {
    return `I understand this has been a difficult experience${c}. Your frustration makes sense, and I want to help resolve this. Can you help me understand exactly what's been most challenging, so I can find the best way to assist you?`;
  }
  if (state === 'confused') {
    return `I realize I may not have explained that clearly enough${c}. Let me try again more simply. [pause] Does that explanation make more sense? Please stop me at any point if something isn't clear.`;
  }
  return `Thank you for sharing that with me${c}. I want to make sure I understand your situation fully. Can you tell me a bit more?`;
}

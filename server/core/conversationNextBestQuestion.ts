export interface QuestionContext {
  complaint: string;
  askedQuestions: string[];
  knownSymptoms?: string[];
  conversationTurn: number;
}

export interface NextBestQuestion {
  question: string;
  rationale: string;
  category: string;
  priority: 'critical' | 'high' | 'moderate' | 'low';
  followUps: string[];
}

interface QuestionTemplate {
  question: string;
  rationale: string;
  category: string;
  priority: NextBestQuestion['priority'];
  followUps: string[];
}

const UNIVERSAL_TEMPLATES: QuestionTemplate[] = [
  {
    question: 'When did this problem first start, and how long has it been going on?',
    rationale: 'Onset and duration help distinguish acute vs chronic and guide urgency',
    category: 'onset_duration',
    priority: 'critical',
    followUps: ['Was the onset sudden or gradual?', 'Has it been constant or intermittent?'],
  },
  {
    question: 'On a scale from 0 to 10, how would you rate the severity right now?',
    rationale: 'Severity scoring enables triage prioritization',
    category: 'severity',
    priority: 'critical',
    followUps: ['What was the worst it has been?', 'Is it improving or worsening?'],
  },
  {
    question: 'Are you experiencing any chest pain, shortness of breath, or difficulty breathing?',
    rationale: 'Red flag screen — must rule out emergency presentations',
    category: 'red_flags',
    priority: 'critical',
    followUps: ['Any pressure or tightness?', 'Does it radiate to arm or jaw?'],
  },
  {
    question: 'What makes your symptoms better or worse?',
    rationale: 'Aggravating and relieving factors help narrow the differential',
    category: 'modifiers',
    priority: 'high',
    followUps: ['Does rest help?', 'Does eating affect it?', 'Does position change it?'],
  },
  {
    question: 'Are you currently taking any medications, supplements, or over-the-counter drugs?',
    rationale: 'Medications can both cause symptoms and affect treatment choices',
    category: 'medications',
    priority: 'high',
    followUps: ['Any recent medication changes?', 'Are you taking antibiotics?'],
  },
  {
    question: 'Do you have any known allergies to medications, foods, or other substances?',
    rationale: 'Critical safety check before any treatment recommendation',
    category: 'allergies',
    priority: 'critical',
    followUps: ['What type of reaction?', 'Was it anaphylaxis?'],
  },
  {
    question: 'Have you had similar symptoms before, or do you have any chronic medical conditions?',
    rationale: 'Prior history modifies differential probability significantly',
    category: 'history',
    priority: 'high',
    followUps: ['Were you hospitalized for this?', 'What helped last time?'],
  },
  {
    question: 'Are there any other symptoms you have noticed, even if they seem unrelated?',
    rationale: 'Associated symptoms often reveal the unifying diagnosis',
    category: 'associated_symptoms',
    priority: 'high',
    followUps: ['Any fever or chills?', 'Any appetite or weight changes?'],
  },
];

const COMPLAINT_SPECIFIC: Record<string, QuestionTemplate[]> = {
  cough: [
    {
      question: 'Is the cough producing mucus or phlegm, and if so, what color is it?',
      rationale: 'Productive vs dry and sputum color distinguishes infection type',
      category: 'associated_symptoms',
      priority: 'high',
      followUps: ['Any blood in the mucus?', 'How much are you producing?'],
    },
    {
      question: 'Do you smoke or have you ever smoked?',
      rationale: 'Smoking history is a primary risk modifier for respiratory complaints',
      category: 'history',
      priority: 'high',
      followUps: ['How many pack-years?', 'Current or ex-smoker?'],
    },
  ],
  chest_pain: [
    {
      question: 'Is the chest pain sharp, squeezing, burning, or pressure-like?',
      rationale: 'Character is the most important differentiator for chest pain etiology',
      category: 'associated_symptoms',
      priority: 'critical',
      followUps: ['Does it radiate anywhere?', 'Is it worse with breathing or movement?'],
    },
  ],
  headache: [
    {
      question: 'Was this headache sudden and the worst of your life, or did it come on gradually?',
      rationale: 'Thunderclap onset requires immediate subarachnoid hemorrhage workup',
      category: 'red_flags',
      priority: 'critical',
      followUps: ['Any neck stiffness?', 'Any vision changes?', 'Any fever?'],
    },
  ],
  uti: [
    {
      question: 'Do you have any flank pain or fever along with the urinary symptoms?',
      rationale: 'Flank pain and fever suggest upper tract involvement — pyelonephritis',
      category: 'red_flags',
      priority: 'critical',
      followUps: ['Any chills or rigors?', 'Any nausea or vomiting?'],
    },
  ],
};

export function conversationNextBestQuestion(context: QuestionContext): NextBestQuestion {
  const alreadyAsked = new Set(context.askedQuestions.map((q) => q.toLowerCase()));
  const complaintTemplates = COMPLAINT_SPECIFIC[context.complaint] ?? [];
  const allTemplates = [...complaintTemplates, ...UNIVERSAL_TEMPLATES];

  const eligible = allTemplates.filter((t) => {
    const q = t.question.toLowerCase();
    return !Array.from(alreadyAsked).some((asked) =>
      asked.includes(q.slice(0, 30)) || q.includes(asked.slice(0, 30))
    );
  });

  const sorted = eligible.sort((a, b) => {
    const p = { critical: 4, high: 3, moderate: 2, low: 1 };
    return p[b.priority] - p[a.priority];
  });

  return sorted[0] ?? UNIVERSAL_TEMPLATES[0];
}

export function buildQuestionQueue(context: QuestionContext, count = 5): NextBestQuestion[] {
  const queue: NextBestQuestion[] = [];
  const tempAsked = [...context.askedQuestions];

  for (let i = 0; i < count; i++) {
    const next = conversationNextBestQuestion({ ...context, askedQuestions: tempAsked });
    queue.push(next);
    tempAsked.push(next.question);
  }

  return queue;
}

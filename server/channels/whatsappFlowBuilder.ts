export interface FlowQuestion {
  id: string;
  text: string;
  type: 'yes_no' | 'multiple_choice' | 'number' | 'text' | 'scale';
  options?: string[];
  required?: boolean;
}

export interface FlowStep {
  stepId: string;
  type: 'question';
  text: string;
  answers: { id: string; title: string }[];
  nextStepOnAnswer?: Record<string, string>;
}

export interface WhatsAppFlow {
  flowId: string;
  version: string;
  screens: WhatsAppFlowScreen[];
}

export interface WhatsAppFlowScreen {
  screenId: string;
  title: string;
  type: 'FORM';
  children: WhatsAppFlowComponent[];
}

export interface WhatsAppFlowComponent {
  type: 'TextInput' | 'RadioButtonsGroup' | 'CheckboxGroup' | 'Dropdown' | 'DatePicker';
  label: string;
  name: string;
  required: boolean;
  options?: { id: string; title: string }[];
  inputType?: 'text' | 'number';
}

function questionToComponent(q: FlowQuestion): WhatsAppFlowComponent {
  if (q.type === 'yes_no') {
    return {
      type: 'RadioButtonsGroup',
      label: q.text,
      name: q.id,
      required: q.required ?? true,
      options: [
        { id: 'yes', title: 'Yes' },
        { id: 'no', title: 'No' },
      ],
    };
  }

  if (q.type === 'multiple_choice' && q.options?.length) {
    const isMultiSelect = (q.options?.length ?? 0) > 2;
    return {
      type: isMultiSelect ? 'CheckboxGroup' : 'RadioButtonsGroup',
      label: q.text,
      name: q.id,
      required: q.required ?? true,
      options: q.options.map((o) => ({ id: o.toLowerCase().replace(/\s+/g, '_'), title: o })),
    };
  }

  if (q.type === 'number') {
    return {
      type: 'TextInput',
      label: q.text,
      name: q.id,
      required: q.required ?? true,
      inputType: 'number',
    };
  }

  if (q.type === 'scale') {
    const scaleOptions = Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), title: String(i + 1) }));
    return {
      type: 'RadioButtonsGroup',
      label: q.text,
      name: q.id,
      required: q.required ?? true,
      options: scaleOptions,
    };
  }

  return {
    type: 'TextInput',
    label: q.text,
    name: q.id,
    required: q.required ?? true,
    inputType: 'text',
  };
}

export function buildWhatsAppFlow(
  questions: FlowQuestion[],
  opts: { flowId?: string; screenTitle?: string; version?: string } = {}
): WhatsAppFlow {
  const { flowId = `flow_${Date.now()}`, screenTitle = 'Symptom Assessment', version = '3.0' } = opts;

  const children: WhatsAppFlowComponent[] = questions.map(questionToComponent);

  return {
    flowId,
    version,
    screens: [
      {
        screenId: 'MAIN_SCREEN',
        title: screenTitle,
        type: 'FORM',
        children,
      },
    ],
  };
}

export function buildFlowSteps(questions: FlowQuestion[]): FlowStep[] {
  return questions.map((q) => {
    const answers: { id: string; title: string }[] = q.type === 'yes_no'
      ? [{ id: 'yes', title: 'Yes' }, { id: 'no', title: 'No' }]
      : (q.options ?? []).map((o) => ({ id: o.toLowerCase().replace(/\s+/g, '_'), title: o }));

    return {
      stepId: q.id,
      type: 'question',
      text: q.text,
      answers,
    };
  });
}

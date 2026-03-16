export interface WhatsAppFlowQuestion {
  question: string;
  type: 'yesno' | 'number' | 'text' | 'multiple' | 'scale';
  options?: string[];
  required?: boolean;
}

export interface WhatsAppFlowBundle {
  complaint: string;
  displayName: string;
  version: string;
  flowId: string;
  questions: WhatsAppFlowQuestion[];
  completionMessage: string;
}

export const whatsappFlowSchema: Record<string, WhatsAppFlowBundle> = {
  cough: {
    complaint: 'cough',
    displayName: 'Cough Assessment',
    version: '1.2',
    flowId: 'flow_cough_v1',
    completionMessage: 'Thank you. A clinician will review your answers shortly.',
    questions: [
      { question: 'How long have you had the cough?',                   type: 'number', required: true },
      { question: 'Do you have fever?',                                  type: 'yesno',  required: true },
      { question: 'Shortness of breath?',                                type: 'yesno',  required: true },
      { question: 'Any chest pain?',                                     type: 'yesno',  required: true },
      { question: 'Coughing up blood?',                                  type: 'yesno',  required: true },
    ],
  },

  headache: {
    complaint: 'headache',
    displayName: 'Headache Assessment',
    version: '1.2',
    flowId: 'flow_headache_v1',
    completionMessage: 'Thank you. We will contact you shortly about next steps.',
    questions: [
      { question: 'Is this the worst headache of your life?',            type: 'yesno',  required: true },
      { question: 'Did it come on suddenly like a thunderclap?',         type: 'yesno',  required: true },
      { question: 'Neck stiffness?',                                     type: 'yesno',  required: true },
      { question: 'Fever?',                                              type: 'yesno',  required: true },
      { question: 'Rate severity (1-10)',                                 type: 'scale',  required: true },
    ],
  },

  sore_throat: {
    complaint: 'sore_throat',
    displayName: 'Sore Throat Assessment',
    version: '1.0',
    flowId: 'flow_sorethroat_v1',
    completionMessage: 'Thank you. A clinician will review your response.',
    questions: [
      { question: 'How many days of sore throat?',                      type: 'number', required: true },
      { question: 'Fever?',                                              type: 'yesno',  required: true },
      { question: 'Is swallowing very painful?',                         type: 'yesno',  required: true },
      { question: 'Can you open your mouth fully?',                      type: 'yesno',  required: true },
      { question: 'Any drooling or difficulty handling saliva?',         type: 'yesno',  required: true },
    ],
  },

  ear_pain: {
    complaint: 'ear_pain',
    displayName: 'Ear Pain Assessment',
    version: '1.0',
    flowId: 'flow_earpain_v1',
    completionMessage: 'Thank you. A clinician will be in touch soon.',
    questions: [
      { question: 'How many days of ear pain?',                         type: 'number', required: true },
      { question: 'Any discharge from the ear?',                        type: 'yesno',  required: true },
      { question: 'Hearing loss?',                                       type: 'yesno',  required: true },
      { question: 'Fever?',                                              type: 'yesno',  required: true },
    ],
  },

  dizziness: {
    complaint: 'dizziness',
    displayName: 'Dizziness Assessment',
    version: '1.0',
    flowId: 'flow_dizziness_v1',
    completionMessage: 'Thank you. A clinician will review your answers.',
    questions: [
      { question: 'Does the room spin around you?',                      type: 'yesno',  required: true },
      { question: 'Have you fallen or nearly fallen?',                   type: 'yesno',  required: true },
      { question: 'Any hearing loss or ringing?',                        type: 'yesno',  required: true },
      { question: 'Nausea or vomiting?',                                 type: 'yesno',  required: true },
    ],
  },

  shortness_of_breath: {
    complaint: 'shortness_of_breath',
    displayName: 'Breathlessness Assessment',
    version: '1.0',
    flowId: 'flow_sob_v1',
    completionMessage: 'Thank you. A clinician will prioritise your case.',
    questions: [
      { question: 'Did shortness of breath start suddenly?',             type: 'yesno',  required: true },
      { question: 'Are you breathless at rest right now?',               type: 'yesno',  required: true },
      { question: 'Any chest pain?',                                     type: 'yesno',  required: true },
      { question: 'Leg swelling?',                                       type: 'yesno',  required: true },
    ],
  },

  fever: {
    complaint: 'fever',
    displayName: 'Fever Assessment',
    version: '1.0',
    flowId: 'flow_fever_v1',
    completionMessage: 'Thank you. We will follow up shortly.',
    questions: [
      { question: 'How many days of fever?',                            type: 'number', required: true },
      { question: 'Shaking chills (rigors)?',                           type: 'yesno',  required: true },
      { question: 'Any rash?',                                          type: 'yesno',  required: true },
      { question: 'Confusion or difficulty waking up?',                 type: 'yesno',  required: true },
    ],
  },
};

export function getWhatsAppFlow(complaint: string): WhatsAppFlowBundle | null {
  const key = complaint.toLowerCase().replace(/[\s-]+/g, '_');
  return whatsappFlowSchema[key] ?? null;
}

export function listWhatsAppFlows(): string[] {
  return Object.keys(whatsappFlowSchema);
}

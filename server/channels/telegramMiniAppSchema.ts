import type { Question } from '../engines/compactQuestionComposer';

export interface MiniAppComplaintSchema {
  complaint: string;
  displayName: string;
  version: string;
  questions: Question[];
}

export const telegramMiniAppSchema: Record<string, MiniAppComplaintSchema> = {
  cough: {
    complaint: 'cough',
    displayName: 'Cough',
    version: '1.2',
    questions: [
      { id: 'duration',   text: 'How many days have you had the cough?',        type: 'number', required: true },
      { id: 'fever',      text: 'Do you have a fever?',                         type: 'yesno',  required: true },
      { id: 'sob',        text: 'Are you short of breath?',                     type: 'yesno',  required: true },
      { id: 'chestpain',  text: 'Do you have any chest pain?',                  type: 'yesno',  required: true },
      { id: 'sputum',     text: 'Are you coughing up any blood or discoloured mucus?', type: 'yesno', required: true },
      { id: 'severity',   text: 'Rate the severity of your cough (1-10)',       type: 'scale',  required: true },
    ],
  },

  headache: {
    complaint: 'headache',
    displayName: 'Headache',
    version: '1.2',
    questions: [
      { id: 'worst',      text: 'Is this the worst headache of your life?',     type: 'yesno',  required: true },
      { id: 'sudden',     text: 'Did it come on suddenly (thunderclap)?',       type: 'yesno',  required: true },
      { id: 'neckstiff',  text: 'Do you have neck stiffness?',                  type: 'yesno',  required: true },
      { id: 'fever',      text: 'Do you have a fever?',                         type: 'yesno',  required: true },
      { id: 'vision',     text: 'Any vision changes or eye pain?',              type: 'yesno',  required: true },
      { id: 'duration',   text: 'How many hours has the headache lasted?',      type: 'number', required: true },
      { id: 'severity',   text: 'Rate headache severity (1-10)',                type: 'scale',  required: true },
    ],
  },

  sore_throat: {
    complaint: 'sore_throat',
    displayName: 'Sore Throat',
    version: '1.0',
    questions: [
      { id: 'duration',   text: 'How many days have you had a sore throat?',    type: 'number', required: true },
      { id: 'fever',      text: 'Do you have a fever?',                         type: 'yesno',  required: true },
      { id: 'swallowing', text: 'Is swallowing very painful?',                  type: 'yesno',  required: true },
      { id: 'drooling',   text: 'Are you drooling or unable to swallow saliva?',type: 'yesno',  required: true },
      { id: 'trismus',    text: 'Can you open your mouth fully?',               type: 'yesno',  required: true },
    ],
  },

  ear_pain: {
    complaint: 'ear_pain',
    displayName: 'Ear Pain',
    version: '1.0',
    questions: [
      { id: 'duration',   text: 'How many days of ear pain?',                   type: 'number', required: true },
      { id: 'discharge',  text: 'Any discharge from the ear?',                  type: 'yesno',  required: true },
      { id: 'hearing',    text: 'Has your hearing changed?',                    type: 'yesno',  required: true },
      { id: 'fever',      text: 'Do you have a fever?',                         type: 'yesno',  required: true },
      { id: 'severity',   text: 'Rate ear pain severity (1-10)',                type: 'scale',  required: true },
    ],
  },

  dizziness: {
    complaint: 'dizziness',
    displayName: 'Dizziness / Vertigo',
    version: '1.0',
    questions: [
      { id: 'type',       text: 'Does the room spin, or do you feel lightheaded?', type: 'multiple', options: ['Room spins', 'Lightheaded', 'Both'], required: true },
      { id: 'duration',   text: 'How long do episodes last?',                   type: 'multiple', options: ['Seconds', 'Minutes', 'Hours', 'Constant'], required: true },
      { id: 'falls',      text: 'Have you fallen or nearly fallen?',            type: 'yesno',  required: true },
      { id: 'nausea',     text: 'Are you nauseated or vomiting?',               type: 'yesno',  required: true },
      { id: 'hearing',    text: 'Any hearing loss or ringing in your ear?',     type: 'yesno',  required: true },
    ],
  },

  shortness_of_breath: {
    complaint: 'shortness_of_breath',
    displayName: 'Shortness of Breath',
    version: '1.0',
    questions: [
      { id: 'onset',      text: 'Did shortness of breath come on suddenly?',    type: 'yesno',  required: true },
      { id: 'rest',       text: 'Are you short of breath at rest right now?',   type: 'yesno',  required: true },
      { id: 'chestpain',  text: 'Do you have any chest pain?',                  type: 'yesno',  required: true },
      { id: 'legswelling',text: 'Do you have leg swelling?',                    type: 'yesno',  required: true },
      { id: 'severity',   text: 'Rate severity (1-10)',                         type: 'scale',  required: true },
    ],
  },

  fever: {
    complaint: 'fever',
    displayName: 'Fever',
    version: '1.0',
    questions: [
      { id: 'temp',       text: 'What is your temperature in °C?',              type: 'number', required: false },
      { id: 'duration',   text: 'How many days of fever?',                      type: 'number', required: true },
      { id: 'rigors',     text: 'Do you have shaking chills (rigors)?',         type: 'yesno',  required: true },
      { id: 'rash',       text: 'Do you have a rash?',                          type: 'yesno',  required: true },
      { id: 'confusion',  text: 'Are you confused or very drowsy?',             type: 'yesno',  required: true },
    ],
  },

  chest_pain: {
    complaint: 'chest_pain',
    displayName: 'Chest Pain',
    version: '1.0',
    questions: [
      { id: 'radiation',  text: 'Does the pain go to your arm, jaw or back?',   type: 'yesno',  required: true },
      { id: 'onset',      text: 'Did the pain come on suddenly at rest?',       type: 'yesno',  required: true },
      { id: 'sob',        text: 'Are you short of breath?',                     type: 'yesno',  required: true },
      { id: 'sweat',      text: 'Are you sweating profusely?',                  type: 'yesno',  required: true },
      { id: 'severity',   text: 'Rate severity (1-10)',                         type: 'scale',  required: true },
    ],
  },
};

export function getMiniAppSchema(complaint: string): MiniAppComplaintSchema | null {
  const key = complaint.toLowerCase().replace(/[\s-]+/g, '_');
  return telegramMiniAppSchema[key] ?? null;
}

export function listMiniAppComplaints(): string[] {
  return Object.keys(telegramMiniAppSchema);
}

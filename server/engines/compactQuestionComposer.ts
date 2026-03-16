export type QuestionType = 'yesno' | 'number' | 'text' | 'multiple' | 'scale' | 'date';

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
  followUpIf?: { answer: string; askId: string };
}

export interface QuestionBundle {
  complaint: string;
  version?: string;
  questions: Question[];
}

// ── Telegram ──────────────────────────────────────────────────────────────────
export interface TelegramMessage {
  text: string;
  reply_markup: {
    keyboard?: string[][];
    inline_keyboard?: Array<Array<{ text: string; callback_data: string }>>;
    resize_keyboard?: boolean;
    one_time_keyboard?: boolean;
    remove_keyboard?: boolean;
  };
}

// ── Telegram Mini App ─────────────────────────────────────────────────────────
export interface TelegramMiniAppField {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
}

// ── WhatsApp Interactive ───────────────────────────────────────────────────────
export interface WhatsAppMessage {
  type: 'interactive' | 'text';
  body: { text: string };
  action?: {
    buttons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
    sections?: Array<{ title: string; rows: Array<{ id: string; title: string }> }>;
  };
}

// ── WhatsApp Flow ─────────────────────────────────────────────────────────────
export interface WhatsAppFlowStep {
  name: string;
  question: string;
  type: QuestionType;
  answers: string[];
  required?: boolean;
}

export class CompactQuestionComposer {
  toTelegram(bundle: QuestionBundle): TelegramMessage[] {
    return bundle.questions.map((q) => {
      const keyboard = this.buildKeyboard(q);
      return {
        text: `*${q.text}*`,
        reply_markup: keyboard
          ? { keyboard, resize_keyboard: true, one_time_keyboard: true }
          : { remove_keyboard: true },
      };
    });
  }

  toTelegramMiniApp(bundle: QuestionBundle): TelegramMiniAppField[] {
    return bundle.questions.map((q) => ({
      id: q.id,
      label: q.text,
      type: q.type,
      options: q.options,
      required: q.required ?? true,
    }));
  }

  toWhatsApp(bundle: QuestionBundle): WhatsAppMessage[] {
    return bundle.questions.map((q) => {
      if (q.type === 'yesno') {
        return {
          type: 'interactive',
          body: { text: q.text },
          action: {
            buttons: [
              { type: 'reply', reply: { id: `${q.id}_yes`, title: 'Yes' } },
              { type: 'reply', reply: { id: `${q.id}_no`,  title: 'No' } },
            ],
          },
        };
      }
      if (q.type === 'multiple' && q.options && q.options.length <= 3) {
        return {
          type: 'interactive',
          body: { text: q.text },
          action: {
            buttons: q.options.map((o) => ({
              type: 'reply' as const,
              reply: { id: `${q.id}_${o.toLowerCase().replace(/\s+/g, '_')}`, title: o.slice(0, 20) },
            })),
          },
        };
      }
      if (q.type === 'multiple' && q.options) {
        return {
          type: 'interactive',
          body: { text: q.text },
          action: {
            sections: [{
              title: 'Options',
              rows: q.options.map((o) => ({
                id: `${q.id}_${o.toLowerCase().replace(/\s+/g, '_')}`,
                title: o.slice(0, 24),
              })),
            }],
          },
        };
      }
      return { type: 'text', body: { text: q.text } };
    });
  }

  toWhatsAppFlow(bundle: QuestionBundle): WhatsAppFlowStep[] {
    return bundle.questions.map((q) => ({
      name: q.id,
      question: q.text,
      type: q.type,
      answers: q.options ?? (q.type === 'yesno' ? ['Yes', 'No'] : []),
      required: q.required ?? true,
    }));
  }

  toSMSShortForm(bundle: QuestionBundle): string[] {
    return bundle.questions.map((q, i) => {
      const opts = q.options ?? (q.type === 'yesno' ? ['Y/N'] : []);
      return `Q${i + 1}: ${q.text}${opts.length ? ` (${opts.join('/')})` : ''}`;
    });
  }

  toJSON(bundle: QuestionBundle): object {
    return { complaint: bundle.complaint, version: bundle.version ?? '1.0', questions: bundle.questions };
  }

  private buildKeyboard(q: Question): string[][] | null {
    if (q.type === 'yesno') return [['Yes', 'No']];
    if (q.type === 'scale') return [['1','2','3','4','5'], ['6','7','8','9','10']];
    if (q.type === 'multiple' && q.options) {
      const rows: string[][] = [];
      for (let i = 0; i < q.options.length; i += 2) {
        rows.push(q.options.slice(i, i + 2));
      }
      return rows;
    }
    return null;
  }
}

export const compactQuestionComposer = new CompactQuestionComposer();

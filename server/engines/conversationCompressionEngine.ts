export interface QuestionSet {
  questions: string[];
  maxMergeSize?: number;
}

export interface CompressedTurn {
  text: string;
  options: string[];
  type: 'multi_select' | 'single_select' | 'yes_no' | 'text';
  source: string[];
}

export class ConversationCompressionEngine {
  readonly name = 'conversationCompressionEngine';

  private readonly DEFAULT_MAX_MERGE = 4;
  private readonly YES_NO_PATTERN = /^(do you|have you|are you|is there|did you|can you)/i;

  compress(questionSet: QuestionSet): CompressedTurn[] {
    const { questions, maxMergeSize = this.DEFAULT_MAX_MERGE } = questionSet;
    if (!questions.length) return [];

    const turns: CompressedTurn[] = [];
    let i = 0;

    while (i < questions.length) {
      const chunk = questions.slice(i, i + maxMergeSize);

      if (chunk.length === 1) {
        turns.push(this.singleQuestion(chunk[0]));
        i++;
        continue;
      }

      const allYesNo = chunk.every((q) => this.YES_NO_PATTERN.test(q.trim()));

      if (allYesNo) {
        turns.push({
          text: 'Do any of the following apply?',
          options: chunk,
          type: 'multi_select',
          source: chunk,
        });
      } else {
        turns.push({
          text: chunk[0],
          options: chunk.slice(1).map((q, idx) => `Option ${idx + 1}: ${q}`),
          type: 'single_select',
          source: chunk,
        });
      }

      i += chunk.length;
    }

    return turns;
  }

  private singleQuestion(q: string): CompressedTurn {
    if (this.YES_NO_PATTERN.test(q.trim())) {
      return { text: q, options: ['Yes', 'No'], type: 'yes_no', source: [q] };
    }
    return { text: q, options: [], type: 'text', source: [q] };
  }

  compressToText(questionSet: QuestionSet): string {
    const turns = this.compress(questionSet);
    return turns
      .map((t, i) => {
        const optStr = t.options.length ? `\n  Options: ${t.options.join(' / ')}` : '';
        return `Q${i + 1}. ${t.text}${optStr}`;
      })
      .join('\n\n');
  }

  run(context: any): any {
    const questions: string[] = context.pendingQuestions ?? [];
    if (!questions.length) return { ...context, compressedTurns: [], compressionApplied: false };

    const compressed = this.compress({ questions, maxMergeSize: context.compressionMaxMerge ?? 4 });
    return {
      ...context,
      compressedTurns: compressed,
      compressionApplied: true,
      turnReduction: questions.length - compressed.length,
    };
  }
}

export const conversationCompressionEngine = new ConversationCompressionEngine();

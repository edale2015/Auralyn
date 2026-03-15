export interface ToneAnalysis {
  tone: 'clinical' | 'warm' | 'neutral' | 'rushed' | 'dismissive' | 'alarming';
  toneScore: number;
  readabilityGrade: number;
  avgWordsPerSentence: number;
  passiveVoiceCount: number;
  jargonCount: number;
  jargonTerms: string[];
  recommendations: string[];
  rewriteSuggestion?: string;
}

const MEDICAL_JARGON = [
  'erythema', 'dyspnea', 'tachycardia', 'bradycardia', 'diaphoresis',
  'edema', 'ecchymosis', 'hemoptysis', 'pallor', 'tachypnea',
  'exacerbation', 'contraindicated', 'etiology', 'prognosis', 'comorbidity',
  'idiopathic', 'paresthesia', 'syncope', 'palpitation', 'nausea',
];

const WARM_MARKERS = [
  'understand', 'feel', 'concerned', 'help', 'together', 'care', 'safe',
  'support', 'explain', 'question', 'ask',
];

const DISMISSIVE_MARKERS = [
  "it's just", "only", "nothing serious", "probably not", "unlikely",
  "you're fine", "no need to worry", "basic",
];

export function conversationToneEngine(text: string): ToneAnalysis {
  const lower = text.toLowerCase();
  const sentences = text.split(/[.!?]/).filter((s) => s.trim().length > 5);
  const words = text.split(/\s+/).filter(Boolean);

  const avgWordsPerSentence = words.length / Math.max(1, sentences.length);

  const jargonTerms = MEDICAL_JARGON.filter((j) => lower.includes(j));
  const jargonCount = jargonTerms.length;

  const warmHits = WARM_MARKERS.filter((w) => lower.includes(w)).length;
  const dismissiveHits = DISMISSIVE_MARKERS.filter((d) => lower.includes(d)).length;

  const passiveVoiceCount = (text.match(/\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi) ?? []).length;

  let tone: ToneAnalysis['tone'];
  if (dismissiveHits > 1) tone = 'dismissive';
  else if (warmHits > 3) tone = 'warm';
  else if (jargonCount > 5) tone = 'clinical';
  else if (avgWordsPerSentence > 35) tone = 'rushed';
  else tone = 'neutral';

  const toneScore =
    (tone === 'warm' ? 1.0 :
     tone === 'neutral' ? 0.7 :
     tone === 'clinical' ? 0.5 :
     tone === 'rushed' ? 0.4 :
     tone === 'dismissive' ? 0.1 : 0.6);

  const readabilityGrade = Math.min(12, Math.round(0.39 * avgWordsPerSentence + 11.8 * (jargonCount / Math.max(1, words.length) * 100) - 15.59));

  const recommendations: string[] = [];
  if (jargonCount > 3) recommendations.push(`Replace medical terms with plain language: ${jargonTerms.slice(0, 3).join(', ')}`);
  if (avgWordsPerSentence > 25) recommendations.push('Use shorter sentences (aim for 15–20 words)');
  if (passiveVoiceCount > 2) recommendations.push('Use active voice to improve clarity');
  if (warmHits < 2) recommendations.push('Add empathetic phrases to build patient rapport');
  if (dismissiveHits > 0) recommendations.push('Avoid minimizing language that may reduce patient trust');

  const rewriteSuggestion = jargonCount > 2
    ? text.replace(/\berythema\b/gi, 'redness')
          .replace(/\bdyspnea\b/gi, 'difficulty breathing')
          .replace(/\btachycardia\b/gi, 'fast heart rate')
          .replace(/\bdiaphoresis\b/gi, 'sweating')
          .replace(/\bedema\b/gi, 'swelling')
    : undefined;

  return {
    tone,
    toneScore,
    readabilityGrade,
    avgWordsPerSentence: parseFloat(avgWordsPerSentence.toFixed(1)),
    passiveVoiceCount,
    jargonCount,
    jargonTerms,
    recommendations,
    rewriteSuggestion,
  };
}

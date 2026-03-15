import type { DistillationResult } from '../../research/types/researchTypes';

const MEDICAL_TERMS = new Set([
  'fever', 'cough', 'pain', 'ache', 'headache', 'nausea', 'vomiting', 'fatigue',
  'dizziness', 'shortness', 'breath', 'swelling', 'rash', 'itching', 'chills',
  'sore', 'throat', 'earache', 'discharge', 'bleeding', 'chest', 'stomach',
  'dizzy', 'tired', 'weak', 'numb', 'tingling', 'burning', 'pressure', 'tight',
  'doctor', 'hospital', 'medication', 'antibiotic', 'steroid', 'prescription',
  'diagnosed', 'diagnosis', 'symptoms', 'treatment', 'recovery', 'worse', 'better',
  'urgent', 'emergency', 'clinic', 'urgent', 'chronic', 'acute', 'sudden',
  'blood', 'urine', 'culture', 'test', 'xray', 'ultrasound', 'ecg', 'scan',
]);

const STOP_WORDS = new Set([
  'that', 'this', 'with', 'have', 'from', 'they', 'will', 'been', 'were',
  'said', 'each', 'which', 'their', 'there', 'what', 'about', 'when', 'your',
  'more', 'also', 'just', 'like', 'some', 'into', 'than', 'then', 'both',
  'very', 'over', 'such', 'only', 'come', 'most', 'make', 'much', 'does',
  'after', 'back', 'even', 'because', 'here', 'same', 'well', 'still',
]);

export function commentDistillationEngine(comments: string[]): DistillationResult {
  const themes: Record<string, number> = {};
  const medicalDetected = new Set<string>();

  for (const comment of comments) {
    const words = comment.toLowerCase().split(/\W+/).filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
    for (const word of words) {
      themes[word] = (themes[word] ?? 0) + 1;
      if (MEDICAL_TERMS.has(word)) medicalDetected.add(word);
    }
  }

  const sorted = Object.entries(themes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  const medicalFirst = sorted.filter((s) => MEDICAL_TERMS.has(s.word));
  const nonMedical = sorted.filter((s) => !MEDICAL_TERMS.has(s.word));
  const topThemes = [...medicalFirst, ...nonMedical].slice(0, 15);

  const summaryBullets: string[] = [];

  // Group medical topics
  if (medicalFirst.length > 0) {
    summaryBullets.push(`Common symptoms mentioned: ${medicalFirst.slice(0, 5).map((t) => t.word).join(', ')}`);
  }
  // Frequent concern indicators
  const urgencyWords = topThemes.filter((t) => ['urgent', 'emergency', 'worse', 'sudden', 'severe'].includes(t.word));
  if (urgencyWords.length > 0) summaryBullets.push(`Urgency indicators detected: ${urgencyWords.map((t) => t.word).join(', ')}`);
  // Treatment-related
  const txWords = topThemes.filter((t) => ['antibiotic', 'medication', 'treatment', 'prescription', 'steroid'].includes(t.word));
  if (txWords.length > 0) summaryBullets.push(`Treatment references: ${txWords.map((t) => t.word).join(', ')}`);
  // General volume stats
  summaryBullets.push(`Analysed ${comments.length} comment${comments.length !== 1 ? 's' : ''} — ${Object.keys(themes).length} unique terms`);
  // Top overall terms
  summaryBullets.push(`Most frequent terms: ${topThemes.slice(0, 5).map((t) => `${t.word} (${t.count})`).join(', ')}`);
  // Disclaimer
  summaryBullets.push('ℹ️ Informational only — patient forum data is not validated for clinical use');

  return {
    summaryBullets,
    topThemes,
    medicalTermsDetected: [...medicalDetected],
    commentCount: comments.length,
  };
}

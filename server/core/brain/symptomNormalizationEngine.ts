const MAP: Record<string, string> = {
  'burning urination': 'dysuria',
  'painful urination': 'dysuria',
  'throwing up': 'vomiting',
  'worst headache of my life': 'thunderclap_headache',
  'short of breath': 'shortness_of_breath',
  'sob': 'shortness_of_breath',
  'pee often': 'urinary_frequency',
  'pee urgency': 'urinary_urgency',
  'one sided weakness': 'weakness_one_side',
  'stiff neck': 'neck_stiffness'
};

export function normalizeSymptoms(raw: string[]): string[] {
  return [...new Set(raw.map((s) => MAP[s.trim().toLowerCase()] ?? s.trim().toLowerCase().replace(/\s+/g, '_')))];
}

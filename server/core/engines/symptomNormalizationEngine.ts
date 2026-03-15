const synonyms: Record<string, string> = {
  'sob': 'shortness_of_breath',
  'short of breath': 'shortness_of_breath',
  'throwing up': 'vomiting',
  'puking': 'vomiting',
  'runny nose': 'rhinorrhea',
  'stuffy nose': 'nasal_congestion',
  'belly pain': 'abdominal_pain',
  'stomach pain': 'abdominal_pain',
  'chest tightness': 'chest_pain',
  'pee pain': 'dysuria',
};

export function normalizeSymptoms(symptoms: string[]): string[] {
  return symptoms.map((s) => synonyms[s.toLowerCase()] ?? s);
}

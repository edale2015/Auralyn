export class SymptomOntology {
  private ontology: Record<string, string[]> = {
    chest_pain: ['pressure', 'tightness', 'angina', 'chest pressure', 'chest tightness', 'sternal pain'],
    shortness_of_breath: ['sob', 'breathless', 'dyspnea', 'breathlessness', 'cant breathe', 'air hunger'],
    dysuria: ['burning urination', 'pain urinating', 'burning pee', 'painful urination', 'burning when peeing'],
    urinary_frequency: ['peeing a lot', 'frequent urination', 'nocturia', 'urinary urgency'],
    fever: ['temperature', 'febrile', 'high temp', 'feeling hot', 'chills and fever'],
    cough: ['hacking cough', 'productive cough', 'dry cough', 'wet cough', 'coughing'],
    sore_throat: ['throat pain', 'throat soreness', 'painful swallowing', 'odynophagia'],
    ear_pain: ['earache', 'ear ache', 'otalgia', 'ear hurts', 'pain in ear'],
    headache: ['head pain', 'migraine', 'head hurts', 'cephalgia'],
    nausea: ['feeling sick', 'nauseated', 'queasy', 'upset stomach'],
    vomiting: ['throwing up', 'puking', 'emesis', 'vomited'],
    abdominal_pain: ['belly pain', 'stomach pain', 'abdominal cramps', 'tummy ache', 'stomach ache'],
    diarrhea: ['loose stools', 'watery stools', 'frequent bowel movements', 'the runs'],
    diaphoresis: ['sweating', 'night sweats', 'profuse sweating', 'cold sweat', 'sweaty'],
    fatigue: ['tired', 'exhausted', 'lethargy', 'weakness', 'no energy', 'worn out'],
    dizziness: ['lightheaded', 'vertigo', 'room spinning', 'dizzy spell'],
    rash: ['skin rash', 'hives', 'erythema', 'redness', 'skin eruption'],
    stiff_neck: ['neck stiffness', 'neck pain', 'meningismus', 'cant move neck'],
    pleuritic_pain: ['pain with breathing', 'sharp chest pain on inspiration', 'pleurisy'],
    hemoptysis: ['coughing blood', 'blood in sputum', 'bloody cough'],
    nasal_congestion: ['stuffy nose', 'blocked nose', 'congested', 'nasal stuffiness'],
    rhinorrhea: ['runny nose', 'nasal discharge', 'nasal drip'],
    altered_consciousness: ['confused', 'disoriented', 'altered mental status', 'unresponsive', 'ams'],
  };

  normalize(symptom: string): string {
    const lower = symptom.toLowerCase().trim();
    for (const [canonical, synonyms] of Object.entries(this.ontology)) {
      if (lower === canonical || synonyms.some((s) => s === lower || lower.includes(s))) {
        return canonical;
      }
    }
    return lower;
  }

  normalizeList(symptoms: string[]): string[] {
    return symptoms.map((s) => this.normalize(s));
  }

  getSynonyms(canonical: string): string[] {
    return this.ontology[canonical] ?? [];
  }

  getCanonicalTerms(): string[] {
    return Object.keys(this.ontology);
  }

  addMapping(canonical: string, synonyms: string[]): void {
    this.ontology[canonical] = [...(this.ontology[canonical] ?? []), ...synonyms];
  }
}

export const symptomOntology = new SymptomOntology();

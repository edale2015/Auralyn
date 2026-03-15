import type { KnowledgeEdge, ValidationResult } from '../types/researchTypes';

const KNOWN_MEDICAL_TERMS = new Set([
  'fever', 'cough', 'dyspnea', 'pneumonia', 'infection', 'sepsis', 'meningitis',
  'asthma', 'copd', 'hypertension', 'diabetes', 'tachycardia', 'bradycardia',
  'hypoxia', 'hypotension', 'chest_pain', 'palpitations', 'syncope', 'fatigue',
  'nausea', 'vomiting', 'diarrhea', 'abdominal_pain', 'dysuria', 'hematuria',
  'headache', 'vertigo', 'seizure', 'stroke', 'aortic_dissection', 'pulmonary_embolism',
  'antibiotics', 'steroids', 'ecg', 'chest_xray', 'blood_culture', 'urinalysis',
]);

function isLikelyMedical(term: string): boolean {
  if (KNOWN_MEDICAL_TERMS.has(term)) return true;
  // Accept multi-word compound terms and reasonable length
  if (term.length < 2 || term.length > 60) return false;
  // Reject pure numbers
  if (/^\d+$/.test(term)) return false;
  return true;
}

export function researchValidationEngine(edges: KnowledgeEdge[]): ValidationResult {
  const safe: KnowledgeEdge[] = [];
  const rejected: KnowledgeEdge[] = [];
  const rejectionReasons: Record<string, string> = {};

  for (const e of edges) {
    const id = `${e.from}→${e.to}→${e.relation}`;

    if (!e.from || !e.to) {
      rejected.push(e);
      rejectionReasons[id] = 'Missing from or to node';
      continue;
    }

    if (e.from === e.to) {
      rejected.push(e);
      rejectionReasons[id] = 'Self-referential edge (from === to)';
      continue;
    }

    if (!isLikelyMedical(e.from) && !isLikelyMedical(e.to)) {
      rejected.push(e);
      rejectionReasons[id] = `Neither node appears to be a medical term: "${e.from}" / "${e.to}"`;
      continue;
    }

    if (e.provenance?.evidenceStrength === 'unknown' && !e.provenance?.reviewedByHuman) {
      // Allow but annotate — don't reject, just flag
      safe.push({ ...e, provenance: { ...e.provenance, reviewNotes: (e.provenance.reviewNotes ?? '') + ' [Pending evidence classification]' } });
      continue;
    }

    safe.push(e);
  }

  return { safe, rejected, rejectionReasons };
}

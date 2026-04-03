import { describe, expect, it } from 'vitest';
import { classifyAcuity } from '../server/clinical/acuityPreClassifier';

describe('classifyAcuity', () => {
  it('routes high-risk chest pain to ER_NOW', () => {
    const result = classifyAcuity({ symptoms: ['chest pain', 'diaphoresis', 'jaw pain'] });
    expect(result.disposition).toBe('ER_NOW');
    expect(result.signal).toBe('possible_stemi');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('routes classic stroke FAST pattern to ER_NOW', () => {
    const result = classifyAcuity({ symptoms: ['facial droop', 'left arm weakness', 'slurred speech'] });
    expect(result.disposition).toBe('ER_NOW');
    expect(result.signal).toBe('possible_stroke');
  });

  it('routes hypoxic patient to ER_NOW with severe_dyspnea', () => {
    const result = classifyAcuity({
      symptoms: ['shortness of breath'],
      vitals: { spo2: 87 },
    });
    expect(result.disposition).toBe('ER_NOW');
    expect(result.signal).toBe('severe_dyspnea');
  });

  it('routes possible sepsis to ER_NOW', () => {
    const result = classifyAcuity({
      symptoms: ['confusion', 'not acting right'],
      vitals: { temperatureF: 102, heartRate: 125, systolicBP: 85 },
    });
    expect(result.disposition).toBe('ER_NOW');
    expect(result.signal).toBe('possible_sepsis');
  });

  it('routes anaphylaxis pattern to ER_NOW', () => {
    const result = classifyAcuity({
      symptoms: ['hives', 'facial swelling', 'shortness of breath', 'wheezing'],
    });
    expect(result.disposition).toBe('ER_NOW');
    expect(result.signal).toBe('anaphylaxis');
  });

  it('continues pipeline for mild sore throat and runny nose', () => {
    const result = classifyAcuity({
      symptoms: ['sore throat', 'runny nose', 'mild congestion'],
    });
    expect(result.disposition).toBe('CONTINUE_PIPELINE');
    expect(result.matched).toBe(false);
  });

  it('continues pipeline for sprained ankle', () => {
    const result = classifyAcuity({
      symptoms: ['ankle pain', 'swelling in ankle', 'difficulty walking'],
    });
    expect(result.disposition).toBe('CONTINUE_PIPELINE');
    expect(result.matched).toBe(false);
  });
});

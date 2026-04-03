import { describe, expect, it } from 'vitest';
import { computeCentorScore } from '../../server/services/scoring/centorScore';

describe('computeCentorScore', () => {
  it('returns 0 for no criteria present (low risk)', () => {
    const r = computeCentorScore({ fever: false, tonsillarExudate: false, tenderAnteriorCervicalNodes: false, absenceOfCough: false });
    expect(r.score).toBe(0);
    expect(r.interpretation).toMatch(/low risk/i);
  });

  it('returns 4 for all criteria present (high risk, typical strep adult)', () => {
    const r = computeCentorScore({ fever: true, tonsillarExudate: true, tenderAnteriorCervicalNodes: true, absenceOfCough: true, age: 30 });
    expect(r.score).toBe(4);
    expect(r.interpretation).toMatch(/high risk/i);
  });

  it('adds +1 age modifier for children 3–14', () => {
    const r = computeCentorScore({ fever: true, tonsillarExudate: true, tenderAnteriorCervicalNodes: true, absenceOfCough: true, age: 10 });
    expect(r.score).toBe(5);
  });

  it('adds -1 age modifier for adults ≥45', () => {
    const r = computeCentorScore({ fever: true, tonsillarExudate: true, tenderAnteriorCervicalNodes: true, absenceOfCough: true, age: 50 });
    expect(r.score).toBe(3);
    expect(r.interpretation).toMatch(/moderate-high/i);
  });

  it('score never goes below 0 with age modifier', () => {
    const r = computeCentorScore({ fever: false, tonsillarExudate: false, tenderAnteriorCervicalNodes: false, absenceOfCough: false, age: 50 });
    expect(r.score).toBe(0);
  });

  it('score 2 returns moderate risk', () => {
    const r = computeCentorScore({ fever: true, tonsillarExudate: true, tenderAnteriorCervicalNodes: false, absenceOfCough: false });
    expect(r.score).toBe(2);
    expect(r.interpretation).toMatch(/moderate/i);
  });

  it('maxScore is 5', () => {
    const r = computeCentorScore({ fever: false, tonsillarExudate: false, tenderAnteriorCervicalNodes: false, absenceOfCough: false });
    expect(r.maxScore).toBe(5);
  });

  it('components array has exactly 4 entries', () => {
    const r = computeCentorScore({ fever: true, tonsillarExudate: false, tenderAnteriorCervicalNodes: true, absenceOfCough: false });
    expect(r.components).toHaveLength(4);
  });
});

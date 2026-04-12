/**
 * In-memory case + cognitive trace store.
 * Circular buffer of the most recent 500 cognitive runs.
 */

import crypto from "crypto";

export interface CognitiveCase {
  id:          string;
  createdAt:   string;
  input:       Record<string, unknown>;
  diagnosis:   string;
  disposition: string;
  confidence:  number;
  strategy:    string;
  reasoning:   {
    monologue: Record<string, unknown>;
    debate:    Record<string, unknown>;
  };
  patientMessage: Record<string, unknown>;
  durationMs:  number;
}

const MAX_CASES = 500;
const cases: CognitiveCase[] = [];

export function persistCognitiveCase(c: Omit<CognitiveCase, "id" | "createdAt">): CognitiveCase {
  const full: CognitiveCase = { ...c, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  cases.unshift(full);
  if (cases.length > MAX_CASES) cases.splice(MAX_CASES);
  return full;
}

export function listCognitiveCases(limit = 20): CognitiveCase[] {
  return cases.slice(0, limit);
}

export function getCognitiveCase(id: string): CognitiveCase | undefined {
  return cases.find((c) => c.id === id);
}

export function caseCount(): number {
  return cases.length;
}

export function clearCases(): void {
  cases.splice(0);
}

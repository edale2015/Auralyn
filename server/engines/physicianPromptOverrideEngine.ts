import type { ToneStrategy } from './toneStrategyEngine';

export interface PhysicianOverrideInput {
  note?: string;
  question?: string;
  tone?: ToneStrategy;
  deEscalate?: boolean;
  urgencyBoost?: boolean;
  suppressAIQuestion?: boolean;
  customInstruction?: string;
  targetComplaint?: string;
  physicianId?: string;
}

export interface PhysicianOverrideResult {
  systemAddendum: string | null;
  nextQuestionOverride: string | null;
  toneOverride: ToneStrategy | null;
  deEscalationMode: boolean;
  urgencyBoost: boolean;
  suppressAIQuestion: boolean;
  customInstruction: string | null;
  appliedAt: string;
  physicianId: string | null;
  summary: string;
}

export interface OverrideHistoryEntry extends PhysicianOverrideResult {
  overrideId: string;
  targetComplaint?: string;
}

const overrideHistory: OverrideHistoryEntry[] = [];

export function physicianPromptOverrideEngine(input: PhysicianOverrideInput): PhysicianOverrideResult {
  const result: PhysicianOverrideResult = {
    systemAddendum: input.note ?? null,
    nextQuestionOverride: input.question ?? null,
    toneOverride: input.tone ?? null,
    deEscalationMode: input.deEscalate ?? false,
    urgencyBoost: input.urgencyBoost ?? false,
    suppressAIQuestion: input.suppressAIQuestion ?? false,
    customInstruction: input.customInstruction ?? null,
    appliedAt: new Date().toISOString(),
    physicianId: input.physicianId ?? null,
    summary: buildSummary(input),
  };

  const historyEntry: OverrideHistoryEntry = {
    ...result,
    overrideId: `ovr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    targetComplaint: input.targetComplaint,
  };
  overrideHistory.push(historyEntry);
  if (overrideHistory.length > 200) overrideHistory.shift();

  return result;
}

export function getOverrideHistory(limit = 50): OverrideHistoryEntry[] {
  return overrideHistory.slice(-limit).reverse();
}

export function buildPromptWithOverride(
  baseSystemPrompt: string,
  override: PhysicianOverrideResult
): string {
  const parts: string[] = [baseSystemPrompt];

  if (override.deEscalationMode) {
    parts.push('\n\n[PHYSICIAN OVERRIDE: DE-ESCALATION MODE ACTIVE] Prioritize emotional validation before any clinical questioning. Do not advance the clinical questioning until the patient feels heard.');
  }

  if (override.urgencyBoost) {
    parts.push('\n\n[PHYSICIAN OVERRIDE: URGENCY BOOST] Ask only the most critical safety questions. Skip non-essential history. Direct and focused questions only.');
  }

  if (override.toneOverride) {
    parts.push(`\n\n[PHYSICIAN OVERRIDE: TONE = ${override.toneOverride.toUpperCase()}] Adjust all responses to use this tone strategy.`);
  }

  if (override.systemAddendum) {
    parts.push(`\n\n[PHYSICIAN NOTE]: ${override.systemAddendum}`);
  }

  if (override.customInstruction) {
    parts.push(`\n\n[PHYSICIAN INSTRUCTION]: ${override.customInstruction}`);
  }

  if (override.suppressAIQuestion) {
    parts.push('\n\n[PHYSICIAN OVERRIDE: SUPPRESS AI QUESTION] Do not ask a question in this turn. Provide only requested information.');
  }

  return parts.join('');
}

function buildSummary(input: PhysicianOverrideInput): string {
  const parts: string[] = [];
  if (input.deEscalate) parts.push('de-escalation mode');
  if (input.urgencyBoost) parts.push('urgency boost');
  if (input.tone) parts.push(`tone → ${input.tone}`);
  if (input.question) parts.push('question override');
  if (input.note) parts.push('physician note');
  if (input.suppressAIQuestion) parts.push('suppress next question');
  return parts.length ? parts.join(', ') : 'no active overrides';
}

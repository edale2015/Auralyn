import type { Request, Response } from 'express';
import { classifyAcuity, type IntakeSnapshot } from './acuityPreClassifier';
import { logger } from '../utils/logger';

export interface FastPathResult {
  status: 'fast_path_er_now' | 'continue_pipeline';
  message: string;
  instructions?: string[];
  acuitySignal?: string;
  rationale?: string[];
  checkedAt: string;
}

export function runFastPath(snapshot: IntakeSnapshot): FastPathResult {
  const decision = classifyAcuity(snapshot);
  const checkedAt = new Date().toISOString();

  if (!decision.matched) {
    return {
      status: 'continue_pipeline',
      message: 'No immediate fast-path escalation triggered.',
      checkedAt,
    };
  }

  logger.warn('[FastPath] ER_NOW triggered', {
    signal: decision.signal,
    confidence: decision.confidence,
    rationale: decision.rationale,
    complaint: snapshot.chiefComplaint,
  });

  return {
    status: 'fast_path_er_now',
    acuitySignal: decision.signal,
    rationale: decision.rationale,
    checkedAt,
    message: 'This presentation may represent a medical emergency. Seek emergency care now.',
    instructions: [
      'Call 911 or go to the nearest emergency department immediately.',
      'Do not drive yourself if you feel unsafe, weak, dizzy, or short of breath.',
      'If symptoms worsen while waiting, call emergency services now.',
    ],
  };
}

export async function fastPathExpressHandler(req: Request, res: Response): Promise<void> {
  const snapshot = req.body as IntakeSnapshot;
  if (!Array.isArray(snapshot?.symptoms)) {
    res.status(400).json({ error: 'symptoms array is required' });
    return;
  }
  const result = runFastPath(snapshot);
  res.status(result.status === 'fast_path_er_now' ? 200 : 202).json(result);
}

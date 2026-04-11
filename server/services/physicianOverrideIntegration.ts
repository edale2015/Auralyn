import { v4 as uuidv4 } from "uuid";
import type { Request, Response } from "express";
import { query } from "../db";

export interface PhysicianOverrideRecord {
  overrideId: string;
  patientId: string;
  complaint: string;
  systemDecision: string;
  physicianDecision: string;
  reason: string;
  discrepancy: boolean;
  actorId: string;
  traceId: string;
  createdAt: Date;
}

const _inMemoryOverrides: PhysicianOverrideRecord[] = [];

export async function createPhysicianOverride(input: {
  patientId: string;
  complaint: string;
  systemDecision: string;
  physicianDecision: string;
  reason: string;
  actorId: string;
  traceId: string;
}): Promise<PhysicianOverrideRecord> {
  const record: PhysicianOverrideRecord = {
    overrideId: uuidv4(),
    ...input,
    discrepancy: input.systemDecision !== input.physicianDecision,
    createdAt: new Date(),
  };

  _inMemoryOverrides.push(record);

  try {
    await query(
      `INSERT INTO kb_physician_overrides
         (override_id, patient_id, complaint, system_decision,
          physician_decision, reason, discrepancy, actor_id, trace_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        record.overrideId,
        record.patientId,
        record.complaint,
        record.systemDecision,
        record.physicianDecision,
        record.reason,
        record.discrepancy,
        record.actorId,
        record.traceId,
      ]
    );
  } catch {
    // DB write failed — in-memory record is the fallback
  }

  return record;
}

export async function listPhysicianOverrides(actorId?: string): Promise<PhysicianOverrideRecord[]> {
  try {
    const result = actorId
      ? await query(
          `SELECT * FROM kb_physician_overrides WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 100`,
          [actorId]
        )
      : await query(
          `SELECT * FROM kb_physician_overrides ORDER BY created_at DESC LIMIT 100`
        );

    if (result.rows.length > 0) {
      return result.rows.map((r: any) => ({
        overrideId:        r.override_id,
        patientId:         r.patient_id,
        complaint:         r.complaint,
        systemDecision:    r.system_decision,
        physicianDecision: r.physician_decision,
        reason:            r.reason,
        discrepancy:       r.discrepancy,
        actorId:           r.actor_id,
        traceId:           r.trace_id,
        createdAt:         r.created_at,
      }));
    }
  } catch {
    // Fall back to in-memory
  }

  return actorId
    ? _inMemoryOverrides.filter((o) => o.actorId === actorId)
    : [..._inMemoryOverrides];
}

export async function createPhysicianOverrideHandler(req: Request, res: Response) {
  try {
    const {
      patientId, complaint, systemDecision,
      physicianDecision, reason, actorId, traceId,
    } = req.body;

    if (!patientId || !systemDecision || !physicianDecision || !reason || !actorId) {
      return res.status(400).json({
        error: "patientId, systemDecision, physicianDecision, reason, actorId required",
      });
    }

    const record = await createPhysicianOverride({
      patientId,
      complaint: complaint || "",
      systemDecision,
      physicianDecision,
      reason,
      actorId,
      traceId: traceId || uuidv4(),
    });

    res.json({ ok: true, record });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Override creation failed" });
  }
}

export async function listPhysicianOverridesHandler(req: Request, res: Response) {
  try {
    const actorId = req.query.actorId as string | undefined;
    const overrides = await listPhysicianOverrides(actorId);
    const discrepancyCount = overrides.filter((o) => o.discrepancy).length;
    res.json({
      ok: true,
      total: overrides.length,
      discrepancyCount,
      discrepancyRate: overrides.length > 0
        ? Math.round((discrepancyCount / overrides.length) * 1000) / 1000
        : 0,
      overrides,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to list overrides" });
  }
}

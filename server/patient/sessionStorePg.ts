import { db } from "../db";
import { sql } from "drizzle-orm";

export type PatientSession = {
  id: string;
  status: string;
  riskLevel?: string | null;
  safetyFlags?: string[];
  disposition?: unknown;
  approvedBy?: string | null;
  overrideData?: unknown;
};

export async function createOrUpsertSession(s: PatientSession): Promise<void> {
  await db.execute(sql`
    INSERT INTO patient_sessions
      (id, status, risk_level, safety_flags, disposition, approved_by, override_data)
    VALUES (
      ${s.id},
      ${s.status},
      ${s.riskLevel ?? null},
      ${JSON.stringify(s.safetyFlags ?? [])}::jsonb,
      ${JSON.stringify(s.disposition ?? null)}::jsonb,
      ${s.approvedBy ?? null},
      ${JSON.stringify(s.overrideData ?? null)}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      status        = EXCLUDED.status,
      risk_level    = EXCLUDED.risk_level,
      safety_flags  = EXCLUDED.safety_flags,
      disposition   = EXCLUDED.disposition,
      approved_by   = EXCLUDED.approved_by,
      override_data = EXCLUDED.override_data,
      updated_at    = NOW()
  `);
}

export async function getSessions(limit = 50, offset = 0): Promise<any[]> {
  const safeLimit = Math.min(limit, 200);
  const safeOffset = Math.max(offset, 0);
  const res = await db.execute(sql`
    SELECT *
    FROM patient_sessions
    ORDER BY created_at DESC
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `);
  return res.rows;
}

export async function getSessionById(id: string): Promise<any | null> {
  const res = await db.execute(sql`
    SELECT * FROM patient_sessions WHERE id = ${id} LIMIT 1
  `);
  return res.rows[0] ?? null;
}

export async function updateSession(id: string, patch: Partial<PatientSession>): Promise<void> {
  await db.execute(sql`
    UPDATE patient_sessions
    SET
      status        = COALESCE(${patch.status ?? null}, status),
      risk_level    = COALESCE(${patch.riskLevel ?? null}, risk_level),
      safety_flags  = COALESCE(${patch.safetyFlags ? JSON.stringify(patch.safetyFlags) : null}::jsonb, safety_flags),
      disposition   = COALESCE(${patch.disposition ? JSON.stringify(patch.disposition) : null}::jsonb, disposition),
      approved_by   = COALESCE(${patch.approvedBy ?? null}, approved_by),
      override_data = COALESCE(${patch.overrideData ? JSON.stringify(patch.overrideData) : null}::jsonb, override_data),
      updated_at    = NOW()
    WHERE id = ${id}
  `);
}

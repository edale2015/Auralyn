import { createHash } from "crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface KBSnapshot {
  fingerprint: string;
  capturedAt: string;
  counts: {
    redFlagRules: number;
    dispositionRules: number;
    questions: number;
    guidelines: number;
  };
}

export async function captureKBSnapshot(): Promise<KBSnapshot> {
  const [redFlagResult, dispositionResult, questionsResult, guidelinesResult] = await Promise.all([
    db.execute(sql`SELECT COUNT(*) AS cnt FROM kb_red_flag_rules WHERE active = true`).catch(() => ({ rows: [{ cnt: 0 }] })),
    db.execute(sql`SELECT COUNT(*) AS cnt FROM kb_disposition_rules WHERE active = true`).catch(() => ({ rows: [{ cnt: 0 }] })),
    db.execute(sql`SELECT COUNT(*) AS cnt FROM kb_questions WHERE active = true`).catch(() => ({ rows: [{ cnt: 0 }] })),
    db.execute(sql`SELECT COUNT(*) AS cnt FROM guideline_recommendations WHERE status = 'approved'`).catch(() => ({ rows: [{ cnt: 0 }] })),
  ]);

  const counts = {
    redFlagRules: Number((redFlagResult.rows as any[])[0]?.cnt ?? 0),
    dispositionRules: Number((dispositionResult.rows as any[])[0]?.cnt ?? 0),
    questions: Number((questionsResult.rows as any[])[0]?.cnt ?? 0),
    guidelines: Number((guidelinesResult.rows as any[])[0]?.cnt ?? 0),
  };

  const capturedAt = new Date().toISOString();
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ counts, capturedAt: capturedAt.slice(0, 16) }))
    .digest("hex");

  return { fingerprint, capturedAt, counts };
}

export async function attachKBSnapshotToEncounter(
  encounterId: string | number,
  snapshot: KBSnapshot
): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE encounters
      SET kb_snapshot = ${JSON.stringify(snapshot)}::jsonb,
          kb_fingerprint = ${snapshot.fingerprint}
      WHERE id = ${encounterId}
    `);
    console.log(
      `[KBFingerprint] Attached snapshot fp=${snapshot.fingerprint.slice(0, 12)}... to encounter ${encounterId} (rules: ${JSON.stringify(snapshot.counts)})`
    );
  } catch (err: any) {
    console.warn(`[KBFingerprint] Could not attach snapshot to encounter ${encounterId}: ${err?.message}`);
  }
}

export async function getEncounterKBSnapshot(
  encounterId: string | number
): Promise<KBSnapshot | null> {
  try {
    const result = await db.execute(sql`
      SELECT kb_snapshot FROM encounters WHERE id = ${encounterId}
    `);
    const row = (result.rows as any[])[0];
    return row?.kb_snapshot ?? null;
  } catch {
    return null;
  }
}

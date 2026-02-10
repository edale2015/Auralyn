export interface RetentionConfig {
  telemetryTtlDays: number;
  enableMessageRetention: boolean;
  dedupeDocStrategy: "field" | "docId";
}

const DEFAULT_CONFIG: RetentionConfig = {
  telemetryTtlDays: Number(process.env.RETENTION_TTL_DAYS || 7),
  enableMessageRetention: process.env.ENABLE_MESSAGE_RETENTION === "1",
  dedupeDocStrategy: "field",
};

export function getRetentionConfig(): RetentionConfig {
  return { ...DEFAULT_CONFIG };
}

export function getTelemetryCutoff(config?: Partial<RetentionConfig>): Date {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return new Date(Date.now() - cfg.telemetryTtlDays * 24 * 60 * 60 * 1000);
}

export interface SweepResult {
  conversationStatesRedacted: number;
  dedupeDocsDeleted: number;
  errors: string[];
  durationMs: number;
}

export async function runRetentionSweep(config?: Partial<RetentionConfig>): Promise<SweepResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const cutoff = getTelemetryCutoff(cfg);
  const cutoffIso = cutoff.toISOString();
  const cutoffMs = cutoff.getTime();
  const startMs = Date.now();
  const result: SweepResult = {
    conversationStatesRedacted: 0,
    dedupeDocsDeleted: 0,
    errors: [],
    durationMs: 0,
  };

  let db: FirebaseFirestore.Firestore;
  try {
    const { getFirestore } = require("../firebase") as typeof import("../firebase");
    db = getFirestore();
  } catch (err: any) {
    result.errors.push(`Firestore not available: ${err?.message}`);
    result.durationMs = Date.now() - startMs;
    return result;
  }

  if (!cfg.enableMessageRetention) {
    try {
      const convStates = db.collection("conversationStates");
      const oldStates = await convStates
        .where("updatedAt", "<", cutoffIso)
        .limit(500)
        .get();

      const batch = db.batch();
      let count = 0;

      for (const doc of oldStates.docs) {
        const data = doc.data();
        if (data.lastNMessages && data.lastNMessages.length > 0) {
          batch.update(doc.ref, {
            lastNMessages: [],
            _redactedAt: new Date().toISOString(),
            _redactedReason: `TTL sweep: conversation older than ${cfg.telemetryTtlDays} days`,
          });
          count++;
        }
      }

      if (count > 0) {
        await batch.commit();
      }
      result.conversationStatesRedacted = count;
    } catch (err: any) {
      result.errors.push(`Conversation state redaction failed: ${err?.message}`);
    }
  }

  try {
    const dedupeCol = db.collection("messageDedup");
    const oldDedupe = await dedupeCol
      .where("expiresAt", "<", cutoffIso)
      .limit(500)
      .get();
    // Also catch docs with numeric seenAt that are older than cutoff
    // (expiresAt may be ISO string or missing for legacy docs)

    const batch = db.batch();
    let count = 0;

    for (const doc of oldDedupe.docs) {
      batch.delete(doc.ref);
      count++;
    }

    if (count > 0) {
      await batch.commit();
    }
    result.dedupeDocsDeleted = count;
  } catch (err: any) {
    result.errors.push(`Dedupe cleanup failed: ${err?.message}`);
  }

  result.durationMs = Date.now() - startMs;
  return result;
}

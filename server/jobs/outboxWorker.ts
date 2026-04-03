import { pg } from "../db/postgres";

export interface FirestoreWriter {
  writeEvent: (payload: Record<string, unknown>) => Promise<void>;
}

let _writer: FirestoreWriter | null = null;

export function registerOutboxFirestoreWriter(writer: FirestoreWriter): void {
  _writer = writer;
}

export async function flushOutbox(
  writer?: FirestoreWriter,
  batchSize = 100
): Promise<{ processed: number; failed: number }> {
  const w = writer ?? _writer;
  if (!w) {
    console.warn("[OutboxWorker] No Firestore writer registered — skipping flush");
    return { processed: 0, failed: 0 };
  }

  const client = await pg.connect();
  let processed = 0;
  let failed = 0;

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, payload_json
       FROM outbox_events
       WHERE processed_at IS NULL
         AND (last_attempt_at IS NULL OR last_attempt_at < now() - interval '30 seconds')
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );

    for (const row of rows) {
      try {
        await w.writeEvent(row.payload_json);
        await client.query(
          `UPDATE outbox_events
           SET processed_at = now(), failure_count = 0, last_error = NULL
           WHERE id = $1`,
          [row.id]
        );
        processed++;
      } catch (err: any) {
        await client.query(
          `UPDATE outbox_events
           SET failure_count = failure_count + 1,
               last_error = $2,
               last_attempt_at = now()
           WHERE id = $1`,
          [row.id, String(err?.message ?? err)]
        );
        failed++;
      }
    }

    await client.query("COMMIT");
    return { processed, failed };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getOutboxLag(): Promise<{ pending: number; oldestPendingAgeMs: number | null }> {
  const { rows } = await pg.query(
    `SELECT count(*) AS pending,
            extract(epoch from (now() - min(created_at))) * 1000 AS oldest_age_ms
     FROM outbox_events WHERE processed_at IS NULL`
  );
  return {
    pending: parseInt(rows[0].pending, 10),
    oldestPendingAgeMs: rows[0].oldest_age_ms ? Number(rows[0].oldest_age_ms) : null,
  };
}

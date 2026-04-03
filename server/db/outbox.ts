import { pg } from "./postgres";

export async function createEncounterWithOutbox(params: {
  tenantId: string;
  patientId?: string | null;
  complaintKey: string;
  stateJson: Record<string, unknown>;
  firestoreEvent: Record<string, unknown>;
  kbVersionHash?: string;
}): Promise<{ id: string; created_at: string }> {
  const client = await pg.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      [params.tenantId]
    );

    const encounterResult = await client.query(
      `INSERT INTO encounters (tenant_id, patient_id, complaint_key, state_json, kb_version_hash)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, created_at`,
      [
        params.tenantId,
        params.patientId ?? null,
        params.complaintKey,
        JSON.stringify(params.stateJson),
        params.kbVersionHash ?? null,
      ]
    );

    const encounter = encounterResult.rows[0];

    await client.query(
      `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload_json)
       VALUES ($1, 'encounter', $2, 'ENCOUNTER_CREATED', $3::jsonb)`,
      [
        params.tenantId,
        encounter.id,
        JSON.stringify(params.firestoreEvent),
      ]
    );

    await client.query("COMMIT");
    return encounter;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function writeOutboxEvent(params: {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await pg.query(
    `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      params.tenantId,
      params.aggregateType,
      params.aggregateId,
      params.eventType,
      JSON.stringify(params.payload),
    ]
  );
}

/**
 * Clinical answer audit service.
 *
 * Every answer served by clinicalRagGrounding is logged here with a
 * SHA-256 content hash as the primary key, making the log tamper-evident.
 */

import crypto from "crypto";
import { db }  from "../db";
import { sql } from "drizzle-orm";

/**
 * Persist an audit record.  Returns the SHA-256 hash used as the record ID.
 */
export async function logClinicalAnswerAudit(payload: unknown): Promise<string> {
  const id = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  await db.execute(sql`
    INSERT INTO clinical_answer_audit (id, payload)
    VALUES (${id}, ${JSON.stringify(payload)})
    ON CONFLICT (id) DO NOTHING
  `);

  return id;
}

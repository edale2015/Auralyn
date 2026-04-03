import { Router } from "express";
import { pool } from "../db/pool";
import { appendAuditEvent } from "./audit";

export const modelFreezeRouter = Router();

modelFreezeRouter.post("/api/governance/model-freeze", async (req: any, res, next) => {
  try {
    const user = req.user ?? req.auth ?? {};
    const roles: string[] = user.roles ?? user.role ? [user.role] : [];
    if (!roles.some(r => ["admin", "system_admin"].includes(r))) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const locked = Boolean(req.body?.locked);
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) return res.status(400).json({ error: "REASON_REQUIRED" });

    await pool.query(
      `INSERT INTO governance_flags (flag_key, flag_value, updated_by, reason)
       VALUES ('validation_lock', $1, $2, $3)
       ON CONFLICT (flag_key)
       DO UPDATE SET flag_value = EXCLUDED.flag_value,
                     updated_by = EXCLUDED.updated_by,
                     reason = EXCLUDED.reason,
                     updated_at = now()`,
      [locked ? "true" : "false", user.id ?? user.email ?? "unknown", reason]
    );

    await appendAuditEvent({
      tenantId: user.tenantId ?? null,
      actorId: user.id ?? user.email ?? null,
      action: locked ? "MODEL_VALIDATION_LOCK_ENABLED" : "MODEL_VALIDATION_LOCK_DISABLED",
      entityType: "governance_flag",
      entityId: "validation_lock",
      justification: reason,
      payload: { locked },
    });

    console.log(`[ModelFreeze] validation_lock=${locked} by ${user.id ?? user.email} — ${reason}`);
    res.json({ ok: true, validationLock: locked });
  } catch (err) {
    next(err);
  }
});

modelFreezeRouter.get("/api/governance/model-freeze", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT flag_value, updated_by, reason, updated_at
       FROM governance_flags WHERE flag_key = 'validation_lock' LIMIT 1`
    );
    const locked = rows[0]?.flag_value === "true";
    res.json({
      validationLock: locked,
      updatedBy: rows[0]?.updated_by ?? null,
      reason: rows[0]?.reason ?? null,
      updatedAt: rows[0]?.updated_at ?? null,
    });
  } catch (err) {
    next(err);
  }
});

export async function assertModelPromotionAllowed(): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT flag_value FROM governance_flags WHERE flag_key = 'validation_lock' LIMIT 1`
    );
    if (rows[0]?.flag_value === "true") {
      const err = new Error("MODEL_VALIDATION_LOCK_ACTIVE");
      (err as any).statusCode = 423;
      throw err;
    }
  } catch (e: any) {
    if (e.message === "MODEL_VALIDATION_LOCK_ACTIVE") throw e;
    console.warn("[ModelFreeze] Could not check validation_lock:", e?.message);
  }
}

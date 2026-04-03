import { Router } from "express";
import { listKbEntities, getKbEntity, upsertKbEntity, setKbEntityStatus, getEntityVersionHistory, countKbEntities } from "../kb/kbRepository";
import { resolveComplaintPack, resolveEntityPackByType } from "../kb/kbResolver";
import { runFullKbMigration } from "../kb/migration/fullKbMigration";
import { requireAuth } from "../middleware/requireAuth";
import { z } from "zod";
import { logger } from "../utils/logger";

const router = Router();

router.get("/entities", requireAuth, async (req, res) => {
  try {
    const entityType = req.query.entityType as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = Number(req.query.limit ?? 100);
    const offset = Number(req.query.offset ?? 0);

    const entities = await listKbEntities({
      entityType: entityType as any,
      status: status as any,
      limit,
      offset,
    });

    res.json({ entities, count: entities.length, offset, limit });
  } catch (e: any) {
    logger.warn("[KbRoutes] GET /entities error", { message: e?.message });
    res.status(500).json({ error: "Failed to list KB entities" });
  }
});

router.get("/entities/:entityType/:entityKey", requireAuth, async (req, res) => {
  try {
    const { entityType, entityKey } = req.params;
    const entity = await getKbEntity(entityType as any, entityKey);
    if (!entity) return res.status(404).json({ error: "Entity not found" });
    res.json(entity);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to get KB entity" });
  }
});

router.get("/entities/:id/history", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const history = await getEntityVersionHistory(id);
    res.json({ history });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to get entity version history" });
  }
});

router.put("/entities/:entityType/:entityKey/status", requireAuth, async (req, res) => {
  try {
    const { entityType, entityKey } = req.params;
    const { status } = req.body;
    if (!["draft", "active", "deprecated"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    const entity = await getKbEntity(entityType as any, entityKey);
    if (!entity) return res.status(404).json({ error: "Entity not found" });
    await setKbEntityStatus(entity.id, status);
    res.json({ updated: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update entity status" });
  }
});

router.get("/resolve/:complaint", requireAuth, async (req, res) => {
  try {
    const complaint = decodeURIComponent(req.params.complaint);
    const pack = await resolveComplaintPack(complaint);
    res.json(pack);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to resolve complaint pack" });
  }
});

router.get("/resolve-type/:entityType", requireAuth, async (req, res) => {
  try {
    const { entityType } = req.params;
    const entities = await resolveEntityPackByType(entityType);
    res.json({ entities, count: entities.length });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to resolve entity pack" });
  }
});

router.get("/stats", requireAuth, async (req, res) => {
  try {
    const entityTypes = [
      "complaint", "red_flag_rule", "workup_rule", "diagnosis_rule",
      "treatment_rule", "disposition_rule", "plan_template", "feature_model",
    ] as const;
    const counts = await Promise.all(
      entityTypes.map(async (t) => ({ type: t, count: await countKbEntities(t) }))
    );
    res.json({ counts, totalEntityTypes: entityTypes.length });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to get KB stats" });
  }
});

router.post("/migrate", requireAuth, async (req, res) => {
  try {
    logger.info("[KbRoutes] Full KB migration triggered via API");
    const result = await runFullKbMigration();
    res.json(result);
  } catch (e: any) {
    logger.warn("[KbRoutes] Migration failed", { message: e?.message });
    res.status(500).json({ error: e?.message ?? "Migration failed" });
  }
});

export default router;

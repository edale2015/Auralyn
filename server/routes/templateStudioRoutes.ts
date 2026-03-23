import express from "express";
import {
  listTemplates,
  getTemplateById,
  getTemplateVersion,
  createTemplate,
  saveDraftVersion,
  approveVersion,
  publishVersion,
  reorderSteps,
  diffVersions,
  testSingleStep,
} from "../templateStudio/controller";

const router = express.Router();

router.get("/templates", listTemplates);
router.post("/templates", createTemplate);
router.get("/templates/:templateId", getTemplateById);
router.get("/templates/:templateId/versions/:versionId", getTemplateVersion);
router.post("/templates/:templateId/versions", saveDraftVersion);
router.post("/templates/:templateId/versions/:versionId/approve", approveVersion);
router.post("/templates/:templateId/versions/:versionId/publish", publishVersion);
router.post("/templates/:templateId/reorder-steps", reorderSteps);
router.post("/templates/:templateId/diff", diffVersions);
router.post("/templates/:templateId/test-step", testSingleStep);

export default router;

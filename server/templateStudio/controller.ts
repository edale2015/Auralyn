import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { TemplateRepository } from "./repository";
import { TemplateDiffService } from "./diffService";

const repo = new TemplateRepository();
const diffService = new TemplateDiffService();

export async function listTemplates(_req: Request, res: Response) {
  const templates = await repo.listTemplates();
  res.json({ templates });
}

export async function getTemplateById(req: Request, res: Response) {
  const template = await repo.getTemplate(req.params.templateId);
  const versions = await repo.listVersions(req.params.templateId);
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json({ template, versions });
}

export async function getTemplateVersion(req: Request, res: Response) {
  const version = await repo.getVersion(req.params.templateId, req.params.versionId);
  if (!version) return res.status(404).json({ error: "Version not found" });
  res.json({ version });
}

export async function createTemplate(req: Request, res: Response) {
  const now = new Date().toISOString();
  const templateId = randomUUID();
  const template = {
    id: templateId,
    name: req.body.name,
    category: req.body.category ?? "general",
    description: req.body.description ?? "",
    tags: req.body.tags ?? [],
    createdAt: now,
    updatedAt: now,
    approvalPolicy: {
      requiresPublishApproval: true,
      requiresRuntimeApproval: false,
    },
    currentVersionId: undefined as string | undefined,
  };
  await repo.upsertTemplate(template);
  res.json({ template });
}

export async function saveDraftVersion(req: Request, res: Response) {
  const template = await repo.getTemplate(req.params.templateId);
  if (!template) return res.status(404).json({ error: "Template not found" });
  const versions = await repo.listVersions(template.id);
  const version = {
    versionId: randomUUID(),
    templateId: template.id,
    versionNumber: versions.length + 1,
    createdAt: new Date().toISOString(),
    createdBy: req.body.createdBy ?? "system",
    status: "draft" as const,
    changelog: req.body.changelog ?? "",
    steps: req.body.steps ?? [],
    variables: req.body.variables ?? [],
  };
  await repo.upsertVersion(version);
  template.updatedAt = new Date().toISOString();
  await repo.upsertTemplate(template);
  res.json({ version });
}

export async function approveVersion(req: Request, res: Response) {
  const version = await repo.getVersion(req.params.templateId, req.params.versionId);
  if (!version) return res.status(404).json({ error: "Version not found" });
  version.status = "approved";
  await repo.upsertVersion(version);
  res.json({ version });
}

export async function publishVersion(req: Request, res: Response) {
  const template = await repo.getTemplate(req.params.templateId);
  const version = await repo.getVersion(req.params.templateId, req.params.versionId);
  if (!template || !version) return res.status(404).json({ error: "Template or version not found" });
  if (version.status !== "approved") return res.status(400).json({ error: "Only approved versions can be published" });
  template.currentVersionId = version.versionId;
  template.updatedAt = new Date().toISOString();
  await repo.upsertTemplate(template);
  res.json({ template, publishedVersion: version });
}

export async function reorderSteps(req: Request, res: Response) {
  const version = await repo.getVersion(req.params.templateId, req.body.versionId);
  if (!version) return res.status(404).json({ error: "Version not found" });
  const orderedIds: string[] = req.body.orderedStepIds ?? [];
  const stepMap = new Map(version.steps.map(s => [s.id, s]));
  version.steps = orderedIds.map(id => stepMap.get(id)).filter(Boolean) as any;
  await repo.upsertVersion(version);
  res.json({ version });
}

export async function diffVersions(req: Request, res: Response) {
  const from = await repo.getVersion(req.params.templateId, req.body.fromVersionId);
  const to = await repo.getVersion(req.params.templateId, req.body.toVersionId);
  if (!from || !to) return res.status(404).json({ error: "Version not found" });
  const diff = diffService.diffVersions(from, to);
  res.json(diff);
}

export async function testSingleStep(req: Request, res: Response) {
  res.json({
    success: true,
    result: {
      stepId: req.body.step?.id ?? "unknown",
      message: "Single-step test endpoint wired. Attach browser engine here.",
      durationMs: 42,
    },
  });
}

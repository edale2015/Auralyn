import fs from "fs/promises";
import path from "path";
import type { Template, TemplateVersion } from "../../shared/templateStudio";

const DATA_DIR = path.join(process.cwd(), "data", "template-studio");
const TEMPLATES_FILE = path.join(DATA_DIR, "templates.json");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: any) {
  await ensureDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

export class TemplateRepository {
  async listTemplates(): Promise<Template[]> {
    await ensureDir();
    return readJson<Template[]>(TEMPLATES_FILE, []);
  }

  async saveTemplates(templates: Template[]) {
    await writeJson(TEMPLATES_FILE, templates);
  }

  async getTemplate(templateId: string): Promise<Template | null> {
    const templates = await this.listTemplates();
    return templates.find(t => t.id === templateId) ?? null;
  }

  async upsertTemplate(template: Template): Promise<void> {
    const templates = await this.listTemplates();
    const idx = templates.findIndex(t => t.id === template.id);
    if (idx >= 0) templates[idx] = template;
    else templates.push(template);
    await this.saveTemplates(templates);
  }

  versionFile(templateId: string) {
    return path.join(DATA_DIR, `${templateId}.versions.json`);
  }

  async listVersions(templateId: string): Promise<TemplateVersion[]> {
    return readJson<TemplateVersion[]>(this.versionFile(templateId), []);
  }

  async saveVersions(templateId: string, versions: TemplateVersion[]) {
    await writeJson(this.versionFile(templateId), versions);
  }

  async getVersion(templateId: string, versionId: string): Promise<TemplateVersion | null> {
    const versions = await this.listVersions(templateId);
    return versions.find(v => v.versionId === versionId) ?? null;
  }

  async upsertVersion(version: TemplateVersion): Promise<void> {
    const versions = await this.listVersions(version.templateId);
    const idx = versions.findIndex(v => v.versionId === version.versionId);
    if (idx >= 0) versions[idx] = version;
    else versions.push(version);
    await this.saveVersions(version.templateId, versions);
  }
}

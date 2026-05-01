import { Router, Request, Response } from "express";
import archiver from "archiver";
import path from "path";
import fs from "fs";
import { requireRole } from "../middleware/requireRole";
import { requireReviewAuth } from "../middleware/reviewAuth";

const router = Router();
const ROOT = path.resolve(process.cwd());

const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", "dist", ".cache", ".local",
  "attached_assets", "generated",
]);

function shouldExclude(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  return parts.some(p => EXCLUDE_DIRS.has(p) || p.startsWith(".env"));
}

router.get("/codebase-zip", requireReviewAuth, requireRole(["admin"]), (req: Request, res: Response) => {
  const filename = `auralyn-codebase-${new Date().toISOString().slice(0, 10)}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("error", (err) => {
    console.error("[ZipExport] Archive error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  archive.pipe(res);

  // Walk root, exclude unwanted dirs
  function addDir(dir: string, baseName: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath  = path.join(dir, entry.name);
        const arcPath   = path.join(baseName, entry.name);
        if (shouldExclude(arcPath)) continue;
        if (entry.isDirectory()) {
          addDir(fullPath, arcPath);
        } else if (entry.isFile()) {
          archive.file(fullPath, { name: arcPath });
        }
      }
    } catch { /* skip unreadable */ }
  }

  addDir(ROOT, "auralyn");
  archive.finalize();
});

export default router;

/**
 * server/routes/adminClaudeExportRoutes.ts — Admin API for Claude review slice export
 *
 * Endpoints:
 *   POST /api/admin/export-claude-slices   — generate export (admin-only)
 *   GET  /api/admin/claude-export/download — download zip (admin-only, path-validated)
 *
 * Security:
 *   - Both endpoints require requirePhysician + requireRole("admin")
 *   - Download path is validated against the exports directory
 *     (prevents directory traversal attacks)
 */

import express from "express";
import path    from "path";
import fs      from "fs";

import { requirePhysician, requireRole } from "../auth/requirePhysician";
import { exportClaudeSlices }            from "../tools/exportClaudeSlices";

const router = express.Router();
router.use(requirePhysician);
router.use(requireRole(["admin"]));

const EXPORTS_ROOT = path.resolve(process.cwd(), "exports", "claude-review");

// ── POST /api/admin/export-claude-slices ──────────────────────────────────────

router.post("/export-claude-slices", async (req, res) => {
  try {
    const {
      diffOnly     = false,
      scrubSecrets = true,
      scrubPHI     = true,
    } = req.body ?? {};

    const result = await exportClaudeSlices({
      diffOnly:     Boolean(diffOnly),
      scrubSecrets: Boolean(scrubSecrets),
      scrubPHI:     Boolean(scrubPHI),
    });

    res.json({
      ok: true,
      ...result,
      downloadUrl: `/api/admin/claude-export/download?path=${encodeURIComponent(result.zipPath)}`,
    });
  } catch (error: any) {
    console.error("[ClaudeExport] Export failed:", error?.message ?? error);
    res.status(500).json({
      ok:    false,
      error: error?.message ?? "Unknown export error",
    });
  }
});

// ── GET /api/admin/claude-export/download ─────────────────────────────────────

router.get("/claude-export/download", async (req, res) => {
  try {
    const rawPath = String(req.query.path ?? "");
    if (!rawPath) {
      return res.status(400).json({ ok: false, error: "path query parameter is required" });
    }

    // Resolve and validate — must be inside exports/claude-review/
    const normalized = path.resolve(rawPath);
    if (!normalized.startsWith(EXPORTS_ROOT + path.sep)) {
      return res.status(403).json({ ok: false, error: "Forbidden — path outside export directory" });
    }

    if (!fs.existsSync(normalized)) {
      return res.status(404).json({ ok: false, error: "Export file not found" });
    }

    if (!normalized.endsWith(".zip")) {
      return res.status(400).json({ ok: false, error: "Only .zip files may be downloaded" });
    }

    res.download(normalized, "claude-review-slices.zip");
  } catch (error: any) {
    res.status(500).json({
      ok:    false,
      error: error?.message ?? "Download failed",
    });
  }
});

// ── GET /api/admin/claude-export/list ────────────────────────────────────────

router.get("/claude-export/list", (_req, res) => {
  try {
    if (!fs.existsSync(EXPORTS_ROOT)) {
      return res.json({ ok: true, exports: [] });
    }

    const entries = fs.readdirSync(EXPORTS_ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => {
        const dir     = path.join(EXPORTS_ROOT, e.name);
        const zipPath = path.join(dir, "claude-review-slices.zip");
        const hasZip  = fs.existsSync(zipPath);
        const stat    = hasZip ? fs.statSync(zipPath) : null;
        return {
          id:          e.name,
          exportDir:   dir,
          zipExists:   hasZip,
          sizeBytes:   stat?.size ?? 0,
          downloadUrl: hasZip
            ? `/api/admin/claude-export/download?path=${encodeURIComponent(zipPath)}`
            : null,
        };
      })
      .sort((a, b) => b.id.localeCompare(a.id));

    res.json({ ok: true, exports: entries });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "List failed" });
  }
});

export default router;

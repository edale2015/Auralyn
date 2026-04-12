/**
 * System Context Engine
 * HIPAA-safe project-wide awareness. Scans server/ and client/src/ for
 * TypeScript/TSX files, builds import dependency map, and surfaces
 * potentially orphaned files. Zero disk writes, no sensitive data leaked.
 */

import fs   from "fs";
import path from "path";

export interface ContextResult {
  scannedAt:    string;
  totalFiles:   number;
  files:        string[];
  dependencies: Record<string, string[]>;
  unusedFiles:  string[];
  stats:        { agentFiles: number; routeFiles: number; serviceFiles: number; testFiles: number };
}

const ROOT = path.resolve(".");

const SCAN_DIRS  = ["server", "client/src", "shared"];
const SKIP_DIRS  = new Set(["node_modules", ".git", "dist", "build", ".local"]);

function walk(dir: string, out: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      out.push(full.replace(ROOT + path.sep, "").replace(/\\/g, "/"));
    }
  }
}

function extractImports(filePath: string): string[] {
  try {
    const content = fs.readFileSync(path.join(ROOT, filePath), "utf-8");
    return [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  } catch {
    return [];
  }
}

export function scanProject(): ContextResult {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir), files);

  const dependencies: Record<string, string[]> = {};
  for (const f of files) {
    dependencies[f] = extractImports(f);
  }

  // Files never imported by any other scanned file
  const importedValues = new Set(Object.values(dependencies).flat());
  const unusedFiles = files.filter((f) => {
    const base = f.replace(/\.(ts|tsx)$/, "");
    return ![...importedValues].some((imp) =>
      base.endsWith(imp) || imp.includes(base.split("/").pop()!)
    );
  });

  const stats = {
    agentFiles:   files.filter((f) => f.includes("/agents/")).length,
    routeFiles:   files.filter((f) => f.includes("/routes/")).length,
    serviceFiles: files.filter((f) => f.includes("/services/")).length,
    testFiles:    files.filter((f) => f.includes("/tests/")).length,
  };

  return { scannedAt: new Date().toISOString(), totalFiles: files.length, files, dependencies, unusedFiles, stats };
}
